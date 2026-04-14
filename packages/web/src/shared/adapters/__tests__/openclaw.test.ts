import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../invoke', () => ({
  tauriInvoke: vi.fn(),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
  webFetchVoid: vi.fn(),
}))

describe('openclaw adapter provider catalog', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getIsTauri } = await import('../platform')
    vi.mocked(getIsTauri).mockReturnValue(false)
  })

  it('uses a dedicated desktop catalog command without exposing headers on argv', async () => {
    const { getIsTauri } = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { getProviderModelCatalogResult } = await import('../openclaw')

    vi.mocked(getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue(JSON.stringify({
      data: [
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      ],
    }) + '\n__CLAWMASTER_STATUS__:200')

    const result = await getProviderModelCatalogResult({
      providerId: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
    ])
    expect(tauriInvoke).toHaveBeenCalledWith('fetch_provider_catalog', {
      url: 'https://api.openai.com/v1/models',
      headers: {
        Authorization: 'Bearer sk-test',
      },
    })
    expect(vi.mocked(tauriInvoke).mock.calls).not.toContainEqual([
      'run_system_command',
      expect.anything(),
    ])
  })

  it('rejects unsafe desktop provider catalog base URLs before issuing a request', async () => {
    const { getIsTauri } = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { getProviderModelCatalogResult } = await import('../openclaw')

    vi.mocked(getIsTauri).mockReturnValue(true)

    const result = await getProviderModelCatalogResult({
      providerId: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://169.254.169.254/latest/meta-data',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/host is not allowed/i)
    expect(tauriInvoke).not.toHaveBeenCalled()
  })
})
