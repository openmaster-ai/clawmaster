export interface HttpProbeRequest {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface HttpProbeResult {
  ok: boolean
  status: number
}

function normalizeUrl(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Missing probe url')
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported probe protocol: ${url.protocol}`)
  }
  return url
}

export async function probeHttpStatus(request: HttpProbeRequest): Promise<HttpProbeResult> {
  const url = normalizeUrl(request.url)
  const method = request.method === 'POST' ? 'POST' : 'GET'
  const timeoutMs = Number.isFinite(request.timeoutMs) ? Math.max(1000, Math.min(15000, Math.trunc(request.timeoutMs!))) : 5000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      headers: request.headers,
      body: method === 'POST' ? request.body : undefined,
      redirect: 'manual',
      signal: controller.signal,
    })
    return {
      ok: response.ok,
      status: response.status,
    }
  } finally {
    clearTimeout(timer)
  }
}
