import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
  webFetchVoid: vi.fn(),
}))

vi.mock('../invoke', () => ({
  tauriInvoke: vi.fn(),
}))

describe('system adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the selected OpenClaw profile in web mode', async () => {
    const { webFetchVoid } = await import('../webHttp')
    const { saveOpenclawProfileResult } = await import('../system')
    vi.mocked(webFetchVoid).mockResolvedValue({ success: true, data: undefined, error: null })

    await saveOpenclawProfileResult(
      { kind: 'named', name: 'team-a' },
      { mode: 'clone-current' }
    )

    expect(webFetchVoid).toHaveBeenCalledWith('/api/settings/openclaw-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'named',
        name: 'team-a',
        seedMode: 'clone-current',
        seedPath: undefined,
      }),
    })
  })

  it('clears the selected OpenClaw profile in web mode', async () => {
    const { webFetchVoid } = await import('../webHttp')
    const { clearOpenclawProfileResult } = await import('../system')
    vi.mocked(webFetchVoid).mockResolvedValue({ success: true, data: undefined, error: null })

    await clearOpenclawProfileResult()

    expect(webFetchVoid).toHaveBeenCalledWith('/api/settings/openclaw-profile', {
      method: 'DELETE',
    })
  })

  it('posts the selected runtime in web mode', async () => {
    const { webFetchVoid } = await import('../webHttp')
    const { saveClawmasterRuntimeResult } = await import('../system')
    vi.mocked(webFetchVoid).mockResolvedValue({ success: true, data: undefined, error: null })

    await saveClawmasterRuntimeResult({
      mode: 'wsl2',
      wslDistro: 'Ubuntu-24.04',
    })

    expect(webFetchVoid).toHaveBeenCalledWith('/api/settings/runtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'wsl2',
        wslDistro: 'Ubuntu-24.04',
      }),
    })
  })
})
