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
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getIsTauri } = await import('../platform')
    vi.mocked(getIsTauri).mockReturnValue(false)
  })

  it('uses a tauri native probe instead of WebView fetch in desktop mode', async () => {
    const { getIsTauri } = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { probeHttpStatusResult } = await import('../system')

    vi.mocked(getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue('204')

    const result = await probeHttpStatusResult({
      url: 'https://api.example.com/health',
      method: 'POST',
      headers: { Authorization: 'Bearer sk-test' },
      body: '{"ping":true}',
      timeoutMs: 3000,
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ ok: true, status: 204 })
    expect(tauriInvoke).toHaveBeenCalledWith('run_system_command', expect.objectContaining({
      cmd: 'curl',
      args: expect.arrayContaining([
        '-X',
        'POST',
        '-H',
        'Authorization: Bearer sk-test',
        '--data-raw',
        '{"ping":true}',
        'https://api.example.com/health',
      ]),
    }))
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

  it('posts an HTTP probe in web mode', async () => {
    const { webFetchJson } = await import('../webHttp')
    const { probeHttpStatusResult } = await import('../system')
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: { ok: true, status: 200 }, error: null })

    await probeHttpStatusResult({
      url: 'https://api.example.com/health',
      method: 'GET',
      timeoutMs: 3000,
    })

    expect(webFetchJson).toHaveBeenCalledWith('/api/system/probe-http', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://api.example.com/health',
        method: 'GET',
        timeoutMs: 3000,
      }),
    })
  })
})
