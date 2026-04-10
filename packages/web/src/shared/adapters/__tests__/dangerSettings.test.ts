import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../webHttp', async () => {
  const actual = await vi.importActual<typeof import('../webHttp')>('../webHttp')
  return {
    ...actual,
    webFetchJson: vi.fn(),
    webFetchVoid: vi.fn(),
  }
})

vi.mock('../invoke', () => ({
  tauriInvoke: vi.fn(),
}))

describe('danger settings adapters', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('sends the danger confirmation header for destructive web actions', async () => {
    localStorage.setItem('clawmaster-service-token', 'secret-token')
    const { webFetchVoid, webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchVoid).mockResolvedValue({ success: true, data: undefined, error: null })
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: { ok: true, code: 0, stdout: '', stderr: '' }, error: null })

    const {
      removeOpenclawDataResult,
      resetOpenclawConfigResult,
      restoreOpenclawBackupResult,
      uninstallOpenclawCliResult,
    } = await import('../dangerSettings')

    await removeOpenclawDataResult()
    await resetOpenclawConfigResult()
    await restoreOpenclawBackupResult('/tmp/backup.tar.gz')
    await uninstallOpenclawCliResult()

    expect(webFetchVoid).toHaveBeenNthCalledWith(1, '/api/settings/remove-openclaw-data', expect.objectContaining({
      headers: expect.any(Headers),
    }))
    expect(webFetchVoid).toHaveBeenNthCalledWith(2, '/api/settings/reset-config', expect.objectContaining({
      headers: expect.any(Headers),
    }))
    expect(webFetchVoid).toHaveBeenNthCalledWith(3, '/api/settings/openclaw-restore', expect.objectContaining({
      headers: expect.any(Headers),
    }))
    expect(webFetchJson).toHaveBeenCalledWith('/api/settings/uninstall-openclaw', expect.objectContaining({
      headers: expect.any(Headers),
    }))

    const removeHeaders = webFetchVoid.mock.calls[0]?.[1]?.headers as Headers
    const resetHeaders = webFetchVoid.mock.calls[1]?.[1]?.headers as Headers
    const restoreHeaders = webFetchVoid.mock.calls[2]?.[1]?.headers as Headers
    const uninstallHeaders = webFetchJson.mock.calls[0]?.[1]?.headers as Headers

    expect(removeHeaders.get('X-Clawmaster-Danger-Token')).toBe('secret-token')
    expect(resetHeaders.get('X-Clawmaster-Danger-Token')).toBe('secret-token')
    expect(restoreHeaders.get('X-Clawmaster-Danger-Token')).toBe('secret-token')
    expect(uninstallHeaders.get('X-Clawmaster-Danger-Token')).toBe('secret-token')
  })
})
