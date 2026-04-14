import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
  webFetchVoid: vi.fn(),
  createDangerousActionHeaders: vi.fn(() => new Headers()),
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
  }, 10_000)

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
  }, 10_000)

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

  it('loads managed memory status through OpenClaw ltm commands in desktop mode', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { managedMemoryStatusResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        available: true,
        backend: 'service',
        implementation: 'powermem',
        engine: 'powermem-sqlite',
        runtimeMode: 'host-managed',
        runtimeTarget: 'native',
        hostPlatform: 'darwin',
        hostArch: 'arm64',
        targetPlatform: 'darwin',
        targetArch: 'arm64',
        selectedWslDistro: null,
        profileKey: 'default',
        dataRoot: '/tmp/.clawmaster/data/default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        storageType: 'sqlite',
        provisioned: true,
      }),
      stderr: '',
    })

    const result = await managedMemoryStatusResult()

    expect(result.success).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('run_openclaw_command_captured', {
      args: ['ltm', 'status', '--json'],
    })
  })

  it('accepts structured managed desktop JSON when OpenClaw exits non-zero with warnings', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { managedMemoryStatusResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      code: 1,
      stdout: JSON.stringify({
        available: true,
        backend: 'service',
        implementation: 'powermem',
        engine: 'powermem-sqlite',
        runtimeMode: 'host-managed',
        runtimeTarget: 'native',
        hostPlatform: 'darwin',
        hostArch: 'arm64',
        targetPlatform: 'darwin',
        targetArch: 'arm64',
        selectedWslDistro: null,
        profileKey: 'default',
        dataRoot: '/tmp/.clawmaster/data/default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        storageType: 'sqlite',
        provisioned: true,
      }),
      stderr: '[plugins] warning: startup banner',
    })

    const result = await managedMemoryStatusResult()

    expect(result.success).toBe(true)
    expect(result.data?.engine).toBe('powermem-sqlite')
  })

  it('falls back to bridge store metadata when ltm is unavailable before desktop bridge sync', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { managedMemoryStatusResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke)
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: "unknown command 'ltm'",
      })
      .mockResolvedValueOnce({
        pluginId: 'memory-clawmaster-powermem',
        slotKey: 'memory',
        state: 'missing',
        issues: ['plugins.slots.memory is not set to memory-clawmaster-powermem'],
        installed: false,
        pluginStatus: null,
        installedPluginPath: null,
        runtimePluginPath: '/tmp/openclaw/plugins/memory-clawmaster-powermem',
        pluginPath: '/tmp/clawmaster/plugins/memory-clawmaster-powermem',
        pluginPathExists: true,
        store: {
          implementation: 'powermem',
          engine: 'powermem-sqlite',
          runtimeMode: 'host-managed',
          runtimeTarget: 'native',
          hostPlatform: 'darwin',
          hostArch: 'arm64',
          targetPlatform: 'darwin',
          targetArch: 'arm64',
          selectedWslDistro: null,
          profileKey: 'default',
          dataRoot: '/tmp/.clawmaster/data/default',
          runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
          storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
          dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
          legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        },
        currentSlotValue: null,
        currentEntry: null,
        desired: {
          slotValue: 'memory-clawmaster-powermem',
          entry: null,
        },
      })

    const result = await managedMemoryStatusResult()

    expect(result).toEqual({
      success: true,
      data: {
        available: true,
        implementation: 'powermem',
        engine: 'powermem-sqlite',
        runtimeMode: 'host-managed',
        runtimeTarget: 'native',
        hostPlatform: 'darwin',
        hostArch: 'arm64',
        targetPlatform: 'darwin',
        targetArch: 'arm64',
        selectedWslDistro: null,
        profileKey: 'default',
        dataRoot: '/tmp/.clawmaster/data/default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        backend: 'service',
        storageType: 'sqlite',
        provisioned: false,
      },
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'run_openclaw_command_captured', {
      args: ['ltm', 'status', '--json'],
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'get_managed_memory_bridge_status')
  })

  it('returns an empty managed memory list when ltm is unavailable before desktop bridge sync', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { managedMemoryListResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke)
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: "unknown command 'ltm'",
      })
      .mockResolvedValueOnce({
        pluginId: 'memory-clawmaster-powermem',
        slotKey: 'memory',
        state: 'drifted',
        issues: ['plugins.entries.memory-clawmaster-powermem is missing or invalid'],
        installed: false,
        pluginStatus: null,
        installedPluginPath: null,
        runtimePluginPath: '/tmp/openclaw/plugins/memory-clawmaster-powermem',
        pluginPath: '/tmp/clawmaster/plugins/memory-clawmaster-powermem',
        pluginPathExists: true,
        store: {
          implementation: 'powermem',
          engine: 'powermem-sqlite',
          runtimeMode: 'host-managed',
          runtimeTarget: 'native',
          hostPlatform: 'darwin',
          hostArch: 'arm64',
          targetPlatform: 'darwin',
          targetArch: 'arm64',
          selectedWslDistro: null,
          profileKey: 'default',
          dataRoot: '/tmp/.clawmaster/data/default',
          runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
          storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
          dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
          legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        },
        currentSlotValue: null,
        currentEntry: null,
        desired: {
          slotValue: 'memory-clawmaster-powermem',
          entry: null,
        },
      })

    const result = await managedMemoryListResult({ limit: 8, offset: 2 })

    expect(result).toEqual({
      success: true,
      data: {
        memories: [],
        total: 0,
        limit: 8,
        offset: 2,
      },
    })
  })

  it('loads managed memory bridge status through tauri commands in desktop mode', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { managedMemoryBridgeStatusResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      pluginId: 'memory-clawmaster-powermem',
      slotKey: 'memory',
      state: 'ready',
      issues: [],
      installed: true,
      pluginStatus: 'loaded',
      installedPluginPath: '/tmp/openclaw/plugins/memory-clawmaster-powermem',
      runtimePluginPath: '/tmp/openclaw/plugins/memory-clawmaster-powermem',
      pluginPath: '/tmp/clawmaster/plugins/memory-clawmaster-powermem',
      pluginPathExists: true,
      store: {
        implementation: 'powermem',
        engine: 'powermem-sqlite',
        runtimeMode: 'host-managed',
        runtimeTarget: 'native',
        hostPlatform: 'darwin',
        hostArch: 'arm64',
        targetPlatform: 'darwin',
        targetArch: 'arm64',
        selectedWslDistro: null,
        profileKey: 'default',
        dataRoot: '/tmp/.clawmaster/data/default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
      },
      currentSlotValue: 'memory-clawmaster-powermem',
      currentEntry: null,
      desired: {
        slotValue: 'memory-clawmaster-powermem',
        entry: null,
      },
    })

    const result = await managedMemoryBridgeStatusResult()

    expect(result.success).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('get_managed_memory_bridge_status')
  })

  it('passes desktop ltm add content after -- so leading dashes stay literal', async () => {
    const platform = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    const { addManagedMemoryResult } = await import('../memory')

    vi.mocked(platform.getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        memoryId: 'mem-1',
        content: '- prefers espresso',
        userId: null,
        agentId: null,
        metadata: {},
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z',
      }),
      stderr: '',
    })

    const result = await addManagedMemoryResult({ content: '- prefers espresso' })

    expect(result.success).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('run_openclaw_command_captured', {
      args: ['ltm', 'add', '--json', '--', '- prefers espresso'],
    })
  })

  it('sends the danger token headers when syncing the managed memory bridge in web mode', async () => {
    const platform = await import('../platform')
    const { webFetchJson, createDangerousActionHeaders } = await import('../webHttp')
    const { syncManagedMemoryBridgeResult } = await import('../memory')

    const dangerHeaders = new Headers({ 'X-Clawmaster-Danger-Token': 'secret-token' })
    vi.mocked(platform.getIsTauri).mockReturnValue(false)
    vi.mocked(createDangerousActionHeaders).mockReturnValue(dangerHeaders)
    vi.mocked(webFetchJson).mockResolvedValue({
      success: true,
      data: {
        pluginId: 'memory-clawmaster-powermem',
        slotKey: 'memory',
        state: 'ready',
        issues: [],
        installed: true,
        pluginStatus: 'loaded',
        installedPluginPath: '/tmp/openclaw/plugins/memory-clawmaster-powermem',
        runtimePluginPath: '/tmp/openclaw/plugins/memory-clawmaster-powermem',
        pluginPath: '/tmp/clawmaster/plugins/memory-clawmaster-powermem',
        pluginPathExists: true,
        store: {
          implementation: 'powermem',
          engine: 'powermem-sqlite',
          runtimeMode: 'host-managed',
          runtimeTarget: 'native',
          hostPlatform: 'darwin',
          hostArch: 'arm64',
          targetPlatform: 'darwin',
          targetArch: 'arm64',
          selectedWslDistro: null,
          profileKey: 'default',
          dataRoot: '/tmp/.clawmaster/data/default',
          runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
          storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
          dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
          legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        },
        currentSlotValue: 'memory-clawmaster-powermem',
        currentEntry: null,
        desired: {
          slotValue: 'memory-clawmaster-powermem',
          entry: null,
        },
      },
    })

    const result = await syncManagedMemoryBridgeResult()

    expect(result.success).toBe(true)
    expect(createDangerousActionHeaders).toHaveBeenCalledWith()
    expect(webFetchJson).toHaveBeenCalledWith('/api/memory/managed/bridge/sync', {
      method: 'POST',
      headers: dangerHeaders,
    })
  })
})
