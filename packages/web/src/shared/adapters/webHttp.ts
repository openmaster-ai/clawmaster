import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'

export const SERVICE_TOKEN_STORAGE_KEY = 'clawmaster-service-token'
export const SERVICE_AUTH_REQUIRED_EVENT = 'clawmaster-service-auth-required'
export const SERVICE_AUTH_ERROR = 'CLAWMASTER_SERVICE_AUTH_REQUIRED'
export const SERVICE_DANGER_TOKEN_HEADER = 'X-Clawmaster-Danger-Token'

export function getStoredServiceToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(SERVICE_TOKEN_STORAGE_KEY)?.trim() || ''
}

function notifyServiceAuthRequired() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SERVICE_AUTH_REQUIRED_EVENT))
}

function withServiceAuth(init?: RequestInit): RequestInit | undefined {
  const token = getStoredServiceToken()
  if (!token) return init
  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return {
    ...init,
    headers,
  }
}

function formatHttpError(status: number, text: string): string {
  if (status === 401) {
    return text ? `${SERVICE_AUTH_ERROR}: ${text.slice(0, 240)}` : SERVICE_AUTH_ERROR
  }
  const hint = text ? `: ${text.slice(0, 240)}` : ''
  return `HTTP ${status}${hint}`
}

export function isServiceAuthError(message?: string | null): boolean {
  return Boolean(message?.startsWith(SERVICE_AUTH_ERROR))
}

export function setStoredServiceToken(token: string): void {
  if (typeof window === 'undefined') return
  const normalized = token.trim()
  if (!normalized) {
    localStorage.removeItem(SERVICE_TOKEN_STORAGE_KEY)
    return
  }
  localStorage.setItem(SERVICE_TOKEN_STORAGE_KEY, normalized)
}

export function clearStoredServiceToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SERVICE_TOKEN_STORAGE_KEY)
}

export function consumeServiceTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const token = url.searchParams.get('serviceToken')?.trim() || url.searchParams.get('token')?.trim() || ''
  if (!token) return null
  setStoredServiceToken(token)
  url.searchParams.delete('serviceToken')
  url.searchParams.delete('token')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return token
}

export function createAuthedWebSocketUrl(pathname: string): string {
  if (typeof window === 'undefined') return pathname
  const url = new URL(pathname, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = getStoredServiceToken()
  if (token) {
    url.searchParams.set('serviceToken', token)
  }
  return url.toString()
}

export function createDangerousActionHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers)
  const token = getStoredServiceToken()
  if (token) {
    next.set(SERVICE_DANGER_TOKEN_HEADER, token)
  }
  return next
}

export async function webFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, withServiceAuth(init))
  if (res.status === 401) {
    notifyServiceAuthRequired()
  }
  return res
}

export async function webFetchJson<T>(
  input: string,
  init?: RequestInit
): Promise<AdapterResult<T>> {
  try {
    const res = await webFetch(input, init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return fail<T>(formatHttpError(res.status, text))
    }
    const data = (await res.json()) as T
    return ok(data)
  } catch (e) {
    return fail<T>(e instanceof Error ? e.message : String(e))
  }
}

export async function webFetchVoid(
  input: string,
  init?: RequestInit
): Promise<AdapterResult<void>> {
  try {
    const res = await webFetch(input, init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return fail<void>(formatHttpError(res.status, text))
    }
    return ok(undefined)
  } catch (e) {
    return fail<void>(e instanceof Error ? e.message : String(e))
  }
}
