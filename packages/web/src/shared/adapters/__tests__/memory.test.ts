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

describe('memory adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats structured empty search payloads as success in tauri mode', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { openclawMemorySearchResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      code: 1,
      stdout: '{"results":[]}',
      stderr: 'no memory hits',
    })

    const result = await openclawMemorySearchResult('workspace')

    expect(result).toEqual({ success: true, data: [] })
    expect(tauriInvoke).toHaveBeenCalledWith('run_openclaw_command_captured', {
      args: ['memory', 'search', '--json', '--max-results', '20', '--query', 'workspace'],
    })
  })

  it('falls back to file-based memory search in tauri mode when fts5 is unavailable', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { openclawMemorySearchResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke)
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Memory search failed: no such module: fts5',
      })
      .mockResolvedValueOnce([
        {
          id: '/tmp/workspace/memory/deepwiki-note.md',
          path: '/tmp/workspace/memory/deepwiki-note.md',
          content: 'The DeepWiki tool was used to inspect repository structure.',
          score: 2,
        },
      ])

    const result = await openclawMemorySearchResult('deepwiki')

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: '/tmp/workspace/memory/deepwiki-note.md',
          path: '/tmp/workspace/memory/deepwiki-note.md',
          content: 'The DeepWiki tool was used to inspect repository structure.',
          score: 2,
        },
      ],
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'run_openclaw_command_captured', {
      args: ['memory', 'search', '--json', '--max-results', '20', '--query', 'deepwiki'],
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'search_openclaw_memory_fallback', {
      query: 'deepwiki',
      agent: undefined,
      maxResults: 20,
    })
  })

  it('loads memory search capability over web api in web mode', async () => {
    const platform = await import('../platform')
    const { webFetchJson } = await import('../webHttp')
    const { openclawMemorySearchCapabilityResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(false)
    vi.mocked(webFetchJson).mockResolvedValue({
      success: true,
      data: {
        mode: 'fallback',
        reason: 'fts5_unavailable',
      },
    })

    const result = await openclawMemorySearchCapabilityResult()

    expect(result).toEqual({
      success: true,
      data: {
        mode: 'fallback',
        reason: 'fts5_unavailable',
      },
    })
    expect(webFetchJson).toHaveBeenCalledWith('/api/memory/openclaw/search-capability')
  })

  it('reindexes memory through tauri command in desktop mode', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { reindexOpenclawMemoryResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      exitCode: 0,
      stdout: 'indexed 5 files',
      stderr: '',
    })

    const result = await reindexOpenclawMemoryResult()

    expect(result).toEqual({
      success: true,
      data: {
        exitCode: 0,
        stdout: 'indexed 5 files',
        stderr: '',
      },
    })
    expect(tauriInvoke).toHaveBeenCalledWith('reindex_openclaw_memory')
  })
})
