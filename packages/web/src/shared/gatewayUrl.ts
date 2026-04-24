/**
 * Build a gateway URL from OpenClawConfig.gateway fields.
 *
 * Consolidates the hardcoded `127.0.0.1:18789` scattered across
 * Dashboard, Gateway, Setup, and Layout into a single source of truth.
 */

interface GatewayConfig {
  gateway?: {
    port?: number
    bind?: string
    auth?: { mode?: string; token?: string }
    controlUi?: { basePath?: string }
  }
}

function normalizeGatewayHost(bind?: string): string {
  const value = bind?.trim()
  if (!value) return '127.0.0.1'

  if (value === 'loopback') {
    return '127.0.0.1'
  }

  if (value === '0.0.0.0') {
    return '127.0.0.1'
  }

  if (value === '::' || value === '[::]') {
    return '[::1]'
  }

  if (value.includes(':') && !value.startsWith('[') && !value.endsWith(']')) {
    return `[${value}]`
  }

  return value
}

function normalizeGatewayBasePath(basePath?: string): string {
  const value = basePath?.trim()
  if (!value) return ''

  const collapsed = value.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!collapsed) return ''
  return `/${collapsed}`
}

export function buildGatewayUrl(
  config: GatewayConfig | null | undefined,
  options?: { protocol?: 'http' | 'ws'; includeBasePath?: boolean },
): string {
  const port = config?.gateway?.port ?? 18789
  const host = normalizeGatewayHost(config?.gateway?.bind)
  const proto = options?.protocol ?? 'http'
  const basePath = options?.includeBasePath
    ? normalizeGatewayBasePath(config?.gateway?.controlUi?.basePath)
    : ''
  return `${proto}://${host}:${port}${basePath}`
}

export function buildGatewayWebUiUrl(
  config: GatewayConfig | null | undefined,
): string {
  const url = new URL(buildGatewayUrl(config, { includeBasePath: true }))
  const authMode = config?.gateway?.auth?.mode?.trim()
  const token = config?.gateway?.auth?.token?.trim()

  if (authMode === 'token' && token) {
    url.searchParams.set('token', token)
  }

  return url.toString()
}

export function buildGatewayChatUrl(
  config: GatewayConfig | null | undefined,
  sessionKey: string,
): string {
  const trimmedSessionKey = sessionKey.trim()
  const url = new URL(buildGatewayWebUiUrl(config))

  const basePath = url.pathname.replace(/\/+$/, '')
  url.pathname = basePath ? `${basePath}/chat` : '/chat'

  if (trimmedSessionKey) {
    url.searchParams.set('session', trimmedSessionKey)
  }

  return url.toString()
}
