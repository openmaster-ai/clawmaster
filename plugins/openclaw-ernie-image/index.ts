import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry'
import type { ImageGenerationProvider, ImageGenerationRequest } from 'openclaw/plugin-sdk/image-generation'

const PROVIDER_ID = 'baidu-aistudio-image'
const DEFAULT_BASE_URL = 'https://aistudio.baidu.com/llm/lmapi/v3'
const DEFAULT_MODEL = 'ernie-image-turbo'
const DEFAULT_SIZE = '1024x1024'
const DEFAULT_MIME_TYPE = 'image/png'
const SUPPORTED_SIZES = [
  '1024x1024',
  '1376x768',
  '1264x848',
  '1200x896',
  '896x1200',
  '848x1264',
  '768x1376',
]

type OpenClawProviderConfig = {
  apiKey?: string
  api_key?: string
  baseUrl?: string
  baseURL?: string
}

function getProviderConfig(req: Pick<ImageGenerationRequest, 'cfg' | 'provider'>): OpenClawProviderConfig {
  const configured = req.cfg?.models?.providers?.[req.provider] as OpenClawProviderConfig | undefined
  if (configured) return configured
  return (req.cfg?.models?.providers?.['baidu-aistudio'] as OpenClawProviderConfig | undefined) ?? {}
}

function getApiKey(req: Pick<ImageGenerationRequest, 'cfg' | 'provider'>): string {
  const providerConfig = getProviderConfig(req)
  const apiKey = providerConfig.apiKey ?? providerConfig.api_key
  if (typeof apiKey === 'string' && apiKey.trim()) {
    return apiKey.trim()
  }
  throw new Error('Baidu AI Studio API key missing')
}

function getBaseUrl(req: Pick<ImageGenerationRequest, 'cfg' | 'provider'>): string {
  const providerConfig = getProviderConfig(req)
  const configured = providerConfig.baseUrl ?? providerConfig.baseURL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.replace(/\/+$/, '')
  }
  return DEFAULT_BASE_URL
}

function toGeneratedImage(entry: unknown, index: number) {
  if (!entry || typeof entry !== 'object') return null
  const payload = entry as { b64_json?: unknown }
  if (typeof payload.b64_json !== 'string' || !payload.b64_json.trim()) return null
  return {
    buffer: Buffer.from(payload.b64_json, 'base64'),
    mimeType: DEFAULT_MIME_TYPE,
    fileName: `ernie-image-${index + 1}.png`,
  }
}

function buildBaiduImageGenerationProvider(): ImageGenerationProvider {
  return {
    id: PROVIDER_ID,
    label: 'ERNIE-Image',
    defaultModel: DEFAULT_MODEL,
    models: [DEFAULT_MODEL],
    isConfigured: ({ cfg }) => {
      const providerConfig = (cfg?.models?.providers?.[PROVIDER_ID] ??
        cfg?.models?.providers?.['baidu-aistudio']) as OpenClawProviderConfig | undefined
      const apiKey = providerConfig?.apiKey ?? providerConfig?.api_key
      return typeof apiKey === 'string' && apiKey.trim().length > 0
    },
    capabilities: {
      generate: {
        maxCount: 4,
        supportsSize: true,
        supportsAspectRatio: false,
        supportsResolution: false,
      },
      edit: {
        enabled: false,
        maxCount: 1,
        maxInputImages: 0,
        supportsSize: true,
        supportsAspectRatio: false,
        supportsResolution: false,
      },
      geometry: {
        sizes: [...SUPPORTED_SIZES],
      },
    },
    async generateImage(req) {
      const response = await fetch(`${getBaseUrl(req)}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getApiKey(req)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: req.model || DEFAULT_MODEL,
          prompt: req.prompt,
          n: req.count ?? 1,
          response_format: 'b64_json',
          size: req.size || DEFAULT_SIZE,
        }),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `ERNIE-Image generation failed (${response.status})`)
      }

      const payload = await response.json() as { data?: unknown[] }
      const images = (payload.data ?? [])
        .map((entry, index) => toGeneratedImage(entry, index))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

      if (images.length === 0) {
        throw new Error('ERNIE-Image returned no image data')
      }

      return {
        images,
        model: req.model || DEFAULT_MODEL,
      }
    },
  }
}

const emptyConfigSchema = {
  parse(value: unknown): Record<string, never> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }
    return {}
  },
}

const plugin = {
  id: 'openclaw-ernie-image',
  name: 'ERNIE-Image Provider',
  description: 'OpenClaw image-generation provider for Baidu AI Studio ERNIE-Image.',
  configSchema: emptyConfigSchema,
  register(api: OpenClawPluginApi) {
    api.registerImageGenerationProvider(buildBaiduImageGenerationProvider())
  },
}

export default plugin
