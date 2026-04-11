import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('webHttp auth helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('adds the stored service token to outgoing requests', async () => {
    localStorage.setItem('clawmaster-service-token', 'secret-token')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { webFetchJson } = await import('../webHttp')
    await webFetchJson('/api/system/detect')

    expect(fetchMock).toHaveBeenCalledWith('/api/system/detect', expect.objectContaining({
      headers: expect.any(Headers),
    }))
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer secret-token')
  })

  it('dispatches an auth-required event on 401 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const eventSpy = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    window.addEventListener('clawmaster-service-auth-required', eventSpy)

    const { webFetchJson, isServiceAuthError } = await import('../webHttp')
    const result = await webFetchJson('/api/system/detect')

    expect(result.success).toBe(false)
    expect(isServiceAuthError(result.error)).toBe(true)
    expect(eventSpy).toHaveBeenCalledTimes(1)
  })

  it('adds the danger confirmation header when a service token is stored', async () => {
    localStorage.setItem('clawmaster-service-token', 'secret-token')

    const { createDangerousActionHeaders } = await import('../webHttp')
    const headers = createDangerousActionHeaders({ 'Content-Type': 'application/json' })

    expect(headers.get('X-Clawmaster-Danger-Token')).toBe('secret-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })
})
