type ProviderCatalogModel = {
  id: string
  name: string
}

type ProviderCatalogRequest = {
  url: string
  headers: Record<string, string>
}

const SAFE_PROVIDER_CATALOG_DEFAULTS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://localhost:11434/v1',
}

const OPENAI_COMPATIBLE_PROVIDER_DEFAULTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  'kimi-coding': 'https://api.moonshot.cn/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  'baidu-aistudio': 'https://aistudio.baidu.com/llm/lmapi/v3',
  openrouter: 'https://openrouter.ai/api/v1',
  cerebras: 'https://api.cerebras.ai/v1',
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizeUrlPathname(pathname: string) {
  const normalized = trimTrailingSlash(pathname)
  return normalized || '/'
}

function resolveEffectivePort(url: URL) {
  if (url.port) return url.port
  return url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : ''
}

function isSameOrChildPath(candidatePath: string, expectedPath: string) {
  return candidatePath === expectedPath || candidatePath.startsWith(`${expectedPath}/`)
}

function parseCatalogBaseUrl(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Provider catalog baseUrl must use http or https')
  }
  if (url.username || url.password) {
    throw new Error('Provider catalog baseUrl must not include credentials')
  }
  return url
}

function isPrivateOrLinkLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host === '::') {
    return true
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number) as [number, number, number, number]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  if (host.startsWith('fc') || host.startsWith('fd')) return true
  if (host.startsWith('fe80:')) return true
  if (host.startsWith('::ffff:')) {
    return isPrivateOrLinkLocalHost(host.slice('::ffff:'.length))
  }
  return false
}

export function assertSafeProviderCatalogBaseUrl(providerId: string, baseUrl?: string) {
  const normalizedBaseUrl = baseUrl?.trim()
  if (!normalizedBaseUrl) {
    return
  }

  if (providerId === 'custom-openai-compatible') {
    // User-supplied endpoints: accept any public http/https host.
    // Block loopback + RFC1918 + link-local so a custom provider cannot be
    // used to SSRF cloud metadata (169.254.169.254) or internal services.
    const candidate = parseCatalogBaseUrl(normalizedBaseUrl)
    if (isPrivateOrLinkLocalHost(candidate.hostname)) {
      throw new Error('Custom provider baseUrl cannot target loopback, private, or link-local hosts')
    }
    return
  }

  const candidate = parseCatalogBaseUrl(normalizedBaseUrl)

  if (providerId === 'ollama') {
    const hostname = candidate.hostname.toLowerCase()
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    if (!isLoopbackHost) {
      throw new Error('Ollama live model catalog is restricted to localhost in web mode')
    }
    return
  }

  const defaultBaseUrl = SAFE_PROVIDER_CATALOG_DEFAULTS[providerId] || OPENAI_COMPATIBLE_PROVIDER_DEFAULTS[providerId]
  if (!defaultBaseUrl) {
    throw new Error('Unsupported provider catalog baseUrl')
  }

  const expected = parseCatalogBaseUrl(defaultBaseUrl)
  if (candidate.protocol !== expected.protocol) {
    throw new Error('Provider catalog baseUrl protocol is not allowed')
  }
  if (candidate.hostname.toLowerCase() !== expected.hostname.toLowerCase()) {
    throw new Error('Provider catalog baseUrl host is not allowed')
  }
  if (resolveEffectivePort(candidate) !== resolveEffectivePort(expected)) {
    throw new Error('Provider catalog baseUrl port is not allowed')
  }
  if (!isSameOrChildPath(normalizeUrlPathname(candidate.pathname), normalizeUrlPathname(expected.pathname))) {
    throw new Error('Provider catalog baseUrl path is not allowed')
  }
}

function normalizeModelId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim().replace(/^models\//, '')
  return id || null
}

function normalizeCatalogModels(items: Array<{ id: unknown; name?: unknown }>): ProviderCatalogModel[] {
  const models: ProviderCatalogModel[] = []

  for (const item of items) {
    const id = normalizeModelId(item.id)
    if (!id) continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
    models.push({ id, name })
  }

  return models.filter((model, index, array) => array.findIndex((item) => item.id === model.id) === index)
}

function isSupportedOpenAiCompatibleProvider(providerId: string) {
  return providerId in OPENAI_COMPATIBLE_PROVIDER_DEFAULTS || providerId === 'custom-openai-compatible'
}

function filterProviderCatalogModels(providerId: string, models: ProviderCatalogModel[]) {
  switch (providerId) {
    case 'openai':
      return models.filter((model) => /^(?:ft:)?(?:gpt|o\d|o1|o3|o4|chatgpt|codex|gpt-oss)/i.test(model.id))
    case 'mistral':
      return models.filter((model) => !/(embed|moderation)/i.test(model.id))
    case 'baidu-aistudio':
      return models.filter((model) => !/(embedding|bge|stable-diffusion|infer-|sft-)/i.test(model.id))
    default:
      return models
  }
}

function buildProviderCatalogRequest(input: {
  providerId: string
  apiKey?: string
  baseUrl?: string
}): ProviderCatalogRequest | null {
  const providerId = input.providerId.trim()
  const apiKey = input.apiKey?.trim() || ''
  const baseUrl = input.baseUrl?.trim()

  if (providerId === 'ollama') {
    const root = trimTrailingSlash(baseUrl || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '')
    return {
      url: `${root}/api/tags`,
      headers: {},
    }
  }

  if (providerId === 'anthropic') {
    if (!apiKey) return null
    const root = trimTrailingSlash(baseUrl || 'https://api.anthropic.com/v1')
    return {
      url: `${root}/models`,
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
    }
  }

  if (providerId === 'google') {
    if (!apiKey) return null
    const root = trimTrailingSlash(baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
    return {
      url: `${root}/models?key=${encodeURIComponent(apiKey)}`,
      headers: {},
    }
  }

  if (isSupportedOpenAiCompatibleProvider(providerId)) {
    const root = trimTrailingSlash(baseUrl || OPENAI_COMPATIBLE_PROVIDER_DEFAULTS[providerId] || '')
    if (!root || !apiKey) return null
    const suffix = providerId === 'siliconflow'
      ? '/models?type=text&sub_type=chat'
      : '/models'
    return {
      url: `${root}${suffix}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  }

  return null
}

function normalizeProviderCatalogResponse(providerId: string, payload: unknown): ProviderCatalogModel[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  if (providerId === 'ollama') {
    const models = Array.isArray((payload as { models?: unknown[] }).models)
      ? (payload as { models: Array<{ name?: unknown }> }).models
      : []
    return normalizeCatalogModels(models.map((model) => ({ id: model.name })))
  }

  if (providerId === 'google') {
    const models = Array.isArray((payload as { models?: unknown[] }).models)
      ? (payload as {
        models: Array<{
          name?: unknown
          displayName?: unknown
          supportedGenerationMethods?: unknown
        }>
      }).models
      : []

    return normalizeCatalogModels(
      models
        .filter((model) => {
          const methods = Array.isArray(model.supportedGenerationMethods)
            ? model.supportedGenerationMethods
            : []
          return methods.some((method) => method === 'generateContent' || method === 'streamGenerateContent')
        })
        .map((model) => ({
          id: model.name,
          name: typeof model.displayName === 'string' ? model.displayName : undefined,
        })),
    )
  }

  if (providerId === 'anthropic') {
    const models = Array.isArray((payload as { data?: unknown[] }).data)
      ? (payload as {
        data: Array<{ id?: unknown; display_name?: unknown }>
      }).data
      : []
    return normalizeCatalogModels(
      models.map((model) => ({
        id: model.id,
        name: typeof model.display_name === 'string' ? model.display_name : undefined,
      })),
    )
  }

  const data = Array.isArray((payload as { data?: unknown[] }).data)
    ? (payload as { data: Array<{ id?: unknown; name?: unknown }> }).data
    : []
  return filterProviderCatalogModels(
    providerId,
    normalizeCatalogModels(data.map((model) => ({ id: model.id, name: model.name }))),
  )
}

export async function listProviderModels(input: {
  providerId: string
  apiKey?: string
  baseUrl?: string
}): Promise<ProviderCatalogModel[]> {
  const request = buildProviderCatalogRequest(input)
  if (!request) return []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(request.url, {
      method: 'GET',
      headers: request.headers satisfies HeadersInit,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Provider catalog request failed (${response.status})`)
    }

    const payload = await response.json()
    return normalizeProviderCatalogResponse(input.providerId, payload)
  } finally {
    clearTimeout(timeout)
  }
}
