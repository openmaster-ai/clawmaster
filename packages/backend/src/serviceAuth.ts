import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const CLAWMASTER_SERVICE_TOKEN_ENV = 'CLAWMASTER_SERVICE_TOKEN'
export const CLAWMASTER_SERVICE_TOKEN_QUERY_KEY = 'serviceToken'
export const CLAWMASTER_SERVICE_TOKEN_ALT_QUERY_KEY = 'token'
export const CLAWMASTER_DANGER_TOKEN_HEADER = 'x-clawmaster-danger-token'
export const SERVICE_AUTH_ERROR = 'ClawMaster service token required'
export const SERVICE_DANGER_ERROR = 'ClawMaster destructive action confirmation required'

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>
  url?: string
}

export function getServiceAuthToken(): string | null {
  const token = process.env[CLAWMASTER_SERVICE_TOKEN_ENV]?.trim()
  return token ? token : null
}

export function isServiceAuthEnabled(): boolean {
  return Boolean(getServiceAuthToken())
}

function getSingleHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

function parseAuthorizationToken(headerValue: string | null): string | null {
  if (!headerValue) return null
  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function parseQueryToken(urlValue: string | undefined): string | null {
  if (!urlValue) return null
  try {
    const url = new URL(urlValue, 'http://clawmaster.local')
    const direct = url.searchParams.get(CLAWMASTER_SERVICE_TOKEN_QUERY_KEY)?.trim()
    if (direct) return direct
    return url.searchParams.get(CLAWMASTER_SERVICE_TOKEN_ALT_QUERY_KEY)?.trim() || null
  } catch {
    return null
  }
}

function safeTokenEquals(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  if (expectedBuffer.length !== providedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, providedBuffer)
}

export function extractServiceToken(request: RequestLike): string | null {
  const authHeader = getSingleHeaderValue(request.headers?.authorization)
  const explicitHeader = getSingleHeaderValue(request.headers?.['x-clawmaster-token'])
  return (
    parseAuthorizationToken(authHeader)
    || explicitHeader?.trim()
    || parseQueryToken(request.url)
    || null
  )
}

export function isServiceRequestAuthorized(request: RequestLike): boolean {
  const configuredToken = getServiceAuthToken()
  if (!configuredToken) return true
  const requestToken = extractServiceToken(request)
  return requestToken ? safeTokenEquals(configuredToken, requestToken) : false
}

export function isDangerousServiceRequestAuthorized(request: RequestLike): boolean {
  const configuredToken = getServiceAuthToken()
  if (!configuredToken) return true
  const dangerHeader = getSingleHeaderValue(request.headers?.[CLAWMASTER_DANGER_TOKEN_HEADER])?.trim()
  return dangerHeader ? safeTokenEquals(configuredToken, dangerHeader) : false
}

export function requireServiceAuth(req: Request, res: Response, next: NextFunction): void {
  if (isServiceRequestAuthorized(req)) {
    next()
    return
  }
  res.status(401).json({ error: SERVICE_AUTH_ERROR })
}

export function requireDangerousServiceAuth(req: Request, res: Response, next: NextFunction): void {
  if (isDangerousServiceRequestAuthorized(req)) {
    next()
    return
  }
  res.status(403).json({ error: SERVICE_DANGER_ERROR })
}
