import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import MemoryPage from '../MemoryPage'

const mockGetIsTauri = vi.fn(() => false)
const mockManagedMemoryStatus = vi.fn()
const mockManagedMemoryStats = vi.fn()
const mockManagedMemoryImportStatus = vi.fn()
const mockManagedMemoryBridgeStatus = vi.fn()
const mockSyncManagedMemoryBridge = vi.fn()
const mockImportOpenclawManagedMemory = vi.fn()
const mockManagedMemoryList = vi.fn()
const mockManagedMemorySearch = vi.fn()
const mockAddManagedMemory = vi.fn()
const mockDeleteManagedMemory = vi.fn()
const mockOpenclawMemoryStatus = vi.fn()
const mockOpenclawMemorySearchCapability = vi.fn()
const mockOpenclawMemorySearch = vi.fn()
const mockOpenclawMemoryFiles = vi.fn()
const mockReindexOpenclawMemory = vi.fn()
const mockDeleteOpenclawMemoryFile = vi.fn()

vi.mock('@/shared/adapters/platform', () => ({
  getIsTauri: (...args: any[]) => mockGetIsTauri(...args),
}))

vi.mock('@/adapters', () => ({
  platformResults: {
    managedMemoryStatus: (...args: any[]) => mockManagedMemoryStatus(...args),
    managedMemoryStats: (...args: any[]) => mockManagedMemoryStats(...args),
    managedMemoryImportStatus: (...args: any[]) => mockManagedMemoryImportStatus(...args),
    managedMemoryBridgeStatus: (...args: any[]) => mockManagedMemoryBridgeStatus(...args),
    syncManagedMemoryBridge: (...args: any[]) => mockSyncManagedMemoryBridge(...args),
    importOpenclawManagedMemory: (...args: any[]) => mockImportOpenclawManagedMemory(...args),
    managedMemoryList: (...args: any[]) => mockManagedMemoryList(...args),
    managedMemorySearch: (...args: any[]) => mockManagedMemorySearch(...args),
    addManagedMemory: (...args: any[]) => mockAddManagedMemory(...args),
    deleteManagedMemory: (...args: any[]) => mockDeleteManagedMemory(...args),
    openclawMemoryStatus: (...args: any[]) => mockOpenclawMemoryStatus(...args),
    openclawMemorySearchCapability: (...args: any[]) => mockOpenclawMemorySearchCapability(...args),
    openclawMemorySearch: (...args: any[]) => mockOpenclawMemorySearch(...args),
    openclawMemoryFiles: (...args: any[]) => mockOpenclawMemoryFiles(...args),
    reindexOpenclawMemory: (...args: any[]) => mockReindexOpenclawMemory(...args),
    deleteOpenclawMemoryFile: (...args: any[]) => mockDeleteOpenclawMemoryFile(...args),
  },
}))

describe('MemoryPage', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await changeLanguage('en')
    mockGetIsTauri.mockReturnValue(false)
    mockManagedMemoryStatus.mockResolvedValue({
      success: true,
      data: {
        available: true,
        implementation: 'powermem',
        engine: 'powermem-sqlite',
        profileKey: 'default',
        dataRoot: '/tmp/.clawmaster/data/default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        backend: 'service',
        storageType: 'sqlite',
        provisioned: true,
      },
    })
    mockManagedMemoryStats.mockResolvedValue({
      success: true,
      data: {
        implementation: 'powermem',
        engine: 'powermem-sqlite',
        profileKey: 'default',
        dataRoot: '/tmp/.clawmaster/data/default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        storagePath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        legacyDbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
        storageType: 'sqlite',
        totalMemories: 1,
        userCount: 1,
        oldestMemory: '2026-04-12T17:00:00.000Z',
        newestMemory: '2026-04-12T17:00:00.000Z',
      },
    })
    mockManagedMemoryImportStatus.mockResolvedValue({
      success: true,
      data: {
        profileKey: 'default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        stateFile: '/tmp/.clawmaster/data/default/memory/powermem/openclaw-import-state.json',
        availableSourceCount: 2,
        trackedSources: 1,
        importedMemoryCount: 1,
        lastImportedAt: '2026-04-12T17:10:00.000Z',
        lastRun: {
          scanned: 2,
          imported: 1,
          updated: 0,
          skipped: 1,
          duplicate: 0,
          failed: 0,
          importedMemoryCount: 1,
          lastImportedAt: '2026-04-12T17:10:00.000Z',
        },
      },
    })
    mockManagedMemoryBridgeStatus.mockResolvedValue({
      success: true,
      data: {
        pluginId: 'memory-clawmaster-powermem',
        slotKey: 'memory',
        state: 'drifted',
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
          entry: {
            enabled: true,
            config: {
              dataRoot: '/tmp/.clawmaster/data/default',
              engine: 'powermem-sqlite',
              autoCapture: true,
              autoRecall: true,
              inferOnAdd: false,
              recallLimit: 5,
              recallScoreThreshold: 0,
            },
          },
        },
      },
    })
    mockSyncManagedMemoryBridge.mockResolvedValue({
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
        currentEntry: {
          enabled: true,
          config: {
            dataRoot: '/tmp/.clawmaster/data/default',
            engine: 'powermem-sqlite',
            autoCapture: true,
            autoRecall: true,
            inferOnAdd: false,
            recallLimit: 5,
            recallScoreThreshold: 0,
          },
        },
        desired: {
          slotValue: 'memory-clawmaster-powermem',
          entry: {
            enabled: true,
            config: {
              dataRoot: '/tmp/.clawmaster/data/default',
              engine: 'powermem-sqlite',
              autoCapture: true,
              autoRecall: true,
              inferOnAdd: false,
              recallLimit: 5,
              recallScoreThreshold: 0,
            },
          },
        },
      },
    })
    mockImportOpenclawManagedMemory.mockResolvedValue({
      success: true,
      data: {
        profileKey: 'default',
        runtimeRoot: '/tmp/.clawmaster/data/default/memory/powermem',
        stateFile: '/tmp/.clawmaster/data/default/memory/powermem/openclaw-import-state.json',
        availableSourceCount: 2,
        trackedSources: 2,
        importedMemoryCount: 2,
        lastImportedAt: '2026-04-12T17:20:00.000Z',
        lastRun: {
          scanned: 2,
          imported: 1,
          updated: 0,
          skipped: 1,
          duplicate: 0,
          failed: 0,
          importedMemoryCount: 2,
          lastImportedAt: '2026-04-12T17:20:00.000Z',
        },
      },
    })
    mockManagedMemoryList.mockResolvedValue({
      success: true,
      data: {
        memories: [
          {
            id: 'managed-1',
            memoryId: 'managed-1',
            content: 'Alice prefers espresso after lunch.',
            userId: 'alice',
            agentId: 'planner',
            metadata: {},
            createdAt: '2026-04-12T17:00:00.000Z',
            updatedAt: '2026-04-12T17:00:00.000Z',
            accessCount: 0,
          },
        ],
        total: 1,
        limit: 8,
        offset: 0,
      },
    })
    mockManagedMemorySearch.mockResolvedValue({
      success: true,
      data: [],
    })
    mockAddManagedMemory.mockResolvedValue({
      success: true,
      data: {
        id: 'managed-2',
        memoryId: 'managed-2',
        content: 'New managed memory',
        userId: 'alice',
        agentId: 'planner',
        metadata: {},
        createdAt: '2026-04-12T17:05:00.000Z',
        updatedAt: '2026-04-12T17:05:00.000Z',
      },
    })
    mockDeleteManagedMemory.mockResolvedValue({
      success: true,
      data: { deleted: true },
    })
    mockOpenclawMemoryStatus.mockResolvedValue({
      success: true,
      data: {
        exitCode: 0,
        data: [
          {
            agentId: 'main',
            status: {
              backend: 'builtin',
              dirty: false,
              workspaceDir: '/tmp/openclaw/workspace',
              dbPath: '/tmp/openclaw/memory/main.sqlite',
            },
            scan: {
              totalFiles: 1,
            },
          },
        ],
        stderr: '',
      },
    })
    mockOpenclawMemoryFiles.mockResolvedValue({
      success: true,
      data: {
        root: '/tmp/openclaw/memory',
        files: [
          {
            name: 'main.sqlite',
            relativePath: 'main.sqlite',
            absolutePath: '/tmp/openclaw/memory/main.sqlite',
            size: 4096,
            modifiedAtMs: 1710000000000,
            extension: 'sqlite',
            kind: 'sqlite',
          },
          {
            name: 'main.sqlite-wal',
            relativePath: 'main.sqlite-wal',
            absolutePath: '/tmp/openclaw/memory/main.sqlite-wal',
            size: 1024,
            modifiedAtMs: 1710000001000,
            extension: '',
            kind: 'journal',
          },
        ],
      },
    })
    mockOpenclawMemorySearchCapability.mockResolvedValue({
      success: true,
      data: {
        mode: 'native',
      },
    })
    mockOpenclawMemorySearch.mockResolvedValue({
      success: true,
      data: [],
    })
    mockReindexOpenclawMemory.mockResolvedValue({
      success: true,
      data: {
        exitCode: 0,
        stdout: 'indexed 5 files',
        stderr: '',
      },
    })
    mockDeleteOpenclawMemoryFile.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
  })

  it('loads native memory status and storage files', async () => {
    render(<MemoryPage />)

    expect(await screen.findByRole('heading', { name: 'Memory Management' })).toBeInTheDocument()
    expect(await screen.findByText('PowerMem foundation')).toBeInTheDocument()
    expect(screen.getByText('Why managed memory is better')).toBeInTheDocument()
    expect(screen.getByText('Legacy memory import')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('Once you add a managed memory here, it stays queryable without touching workspace markdown files.')).toBeInTheDocument()
    expect(screen.getByText('Run compare')).toBeInTheDocument()
    expect(screen.getByText('Alice prefers espresso after lunch.')).toBeInTheDocument()
    expect(await screen.findByText('Memory Overview')).toBeInTheDocument()
    expect(screen.getAllByText('Storage Files').length).toBeGreaterThan(0)
    expect(screen.getByText('/tmp/openclaw/memory')).toBeInTheDocument()
    expect(screen.getByText('/tmp/openclaw/workspace')).toBeInTheDocument()
    expect(screen.getAllByText('/tmp/openclaw/memory/main.sqlite').length).toBeGreaterThan(0)
    expect(screen.getByText('main.sqlite')).toBeInTheDocument()
    expect(screen.getAllByText('SQLite store').length).toBeGreaterThan(0)
    expect(screen.getByText('Native SQLite search')).toBeInTheDocument()
  }, 10_000)

  it('runs a filtered native memory search', async () => {
    mockOpenclawMemorySearch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'hit-1',
          content: 'Found semantic memory',
          path: '/tmp/openclaw/memory/main.sqlite',
          score: 0.9182,
        },
      ],
    })

    render(<MemoryPage />)

    expect(await screen.findByRole('heading', { name: 'Memory Management' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Agent ID (optional)'), { target: { value: 'main' } })
    fireEvent.change(screen.getByPlaceholderText('Search memories...'), { target: { value: 'semantic cache' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[1]!)

    await waitFor(() => {
      expect(mockOpenclawMemorySearch).toHaveBeenCalledWith('semantic cache', {
        agent: 'main',
        maxResults: 25,
      })
    })

    expect(await screen.findByText('Found semantic memory')).toBeInTheDocument()
    expect(screen.getAllByText('/tmp/openclaw/memory/main.sqlite').length).toBeGreaterThan(0)
    expect(screen.getByText('score: 0.918')).toBeInTheDocument()
  })

  it('shows an empty result state for native search misses', async () => {
    render(<MemoryPage />)

    expect(await screen.findByRole('heading', { name: 'Memory Management' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search memories...'), { target: { value: 'missing note' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[1]!)

    await waitFor(() => {
      expect(mockOpenclawMemorySearch).toHaveBeenCalledWith('missing note', {
        agent: undefined,
        maxResults: 25,
      })
    })

    expect(await screen.findByText('No results')).toBeInTheDocument()
  })

  it('adds and searches managed PowerMem memories', async () => {
    mockManagedMemorySearch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          memoryId: 'managed-1',
          content: 'Alice prefers espresso after lunch.',
          userId: 'alice',
          agentId: 'planner',
          metadata: {},
          score: 0.9942,
          createdAt: '2026-04-12T17:00:00.000Z',
          updatedAt: '2026-04-12T17:00:00.000Z',
        },
      ],
    })

    render(<MemoryPage />)

    expect(await screen.findByText('PowerMem foundation')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('User ID for managed memory (optional)'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Agent ID for managed memory (optional)'), {
      target: { value: 'planner' },
    })
    fireEvent.change(
      screen.getByPlaceholderText('Store a stable fact, preference, or reusable note in managed PowerMem memory...'),
      { target: { value: 'Alice prefers espresso after lunch.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add memory' }))

    await waitFor(() => {
      expect(mockAddManagedMemory).toHaveBeenCalledWith({
        content: 'Alice prefers espresso after lunch.',
        userId: 'alice',
        agentId: 'planner',
      })
    })
    expect(await screen.findByText('Managed PowerMem memory saved.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search managed PowerMem memories...'), {
      target: { value: 'espresso lunch' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0])

    await waitFor(() => {
      expect(mockManagedMemorySearch).toHaveBeenCalledWith('espresso lunch', {
        userId: 'alice',
        agentId: 'planner',
        limit: 12,
      })
    })

    expect(await screen.findByText('Managed search results')).toBeInTheDocument()
    expect(screen.getByText('score: 0.994')).toBeInTheDocument()
  })

  it('imports legacy OpenClaw memory into managed PowerMem', async () => {
    render(<MemoryPage />)

    const importHeading = await screen.findByText('Legacy memory import')
    const importCard = importHeading.closest('.section-subcard')
    expect(importCard).not.toBeNull()
    expect(within(importCard!).getByText('Available sources')).toBeInTheDocument()
    expect(within(importCard!).getAllByText('2').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Import OpenClaw memory' }))

    await waitFor(() => {
      expect(mockImportOpenclawManagedMemory).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Legacy OpenClaw memory imported into managed PowerMem.')).toBeInTheDocument()
  })

  it('refreshes legacy OpenClaw capability and status after bridge sync', async () => {
    mockOpenclawMemorySearchCapability
      .mockResolvedValueOnce({
        success: true,
        data: {
          mode: 'unsupported',
          reason: 'command_unavailable',
          detail: "error: unknown command 'memory'",
        },
      })
      .mockResolvedValue({
        success: true,
        data: {
          mode: 'native',
        },
      })
    mockOpenclawMemoryStatus
      .mockResolvedValueOnce({
        success: false,
        error: "error: unknown command 'memory'",
      })
      .mockResolvedValue({
        success: true,
        data: {
          exitCode: 0,
          data: [
            {
              agentId: 'main',
              status: {
                backend: 'managed',
                dirty: false,
                workspaceDir: '/tmp/openclaw/workspace',
                dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
              },
              scan: {
                totalFiles: 1,
              },
            },
          ],
          stderr: '',
        },
      })

    render(<MemoryPage />)
    expect(await screen.findByRole('button', { name: 'Sync bridge' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sync bridge' }))

    await waitFor(() => {
      expect(mockSyncManagedMemoryBridge).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mockOpenclawMemorySearchCapability).toHaveBeenCalledTimes(2)
      expect(mockOpenclawMemoryStatus).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('The OpenClaw memory slot now points at the shipped PowerMem bridge for this profile.')).toBeInTheDocument()
    expect(screen.getByText('Native SQLite search')).toBeInTheDocument()
  })

  it('compares managed and legacy recall side by side', async () => {
    mockManagedMemorySearch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          memoryId: 'managed-1',
          content: 'Managed memory keeps the imported espresso preference.',
          userId: 'alice',
          agentId: 'planner',
          metadata: {},
          score: 0.991,
        },
      ],
    })
    mockOpenclawMemorySearch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'legacy-1',
          content: 'Legacy markdown note mentions espresso.',
          path: '/tmp/openclaw/workspace/memory/coffee.md',
          score: 1,
        },
      ],
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Recall comparison')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Compare the same query across managed and legacy memory...'), {
      target: { value: 'espresso preference' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compare recall' }))

    await waitFor(() => {
      expect(mockManagedMemorySearch).toHaveBeenCalledWith('espresso preference', { limit: 6 })
      expect(mockOpenclawMemorySearch).toHaveBeenCalledWith('espresso preference', { maxResults: 6 })
    })

    expect(await screen.findByText('Managed memory keeps the imported espresso preference.')).toBeInTheDocument()
    expect(screen.getByText('Legacy markdown note mentions espresso.')).toBeInTheDocument()
    expect(screen.getByText('1 · 1')).toBeInTheDocument()
    expect(screen.getByText('Managed and legacy memory both returned 1 hits on the last comparison query.')).toBeInTheDocument()
  })

  it('retries after a status failure', async () => {
    mockOpenclawMemoryStatus
      .mockResolvedValueOnce({
        success: false,
        error: 'status backend unavailable',
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          exitCode: 0,
          data: [
            {
              agentId: 'main',
              status: {
                backend: 'builtin',
                dirty: false,
                workspaceDir: '/tmp/openclaw/workspace',
                dbPath: '/tmp/openclaw/memory/main.sqlite',
              },
              scan: { totalFiles: 1 },
            },
          ],
          stderr: '',
        },
      })

    render(<MemoryPage />)

    expect(await screen.findByText('status backend unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(mockOpenclawMemoryStatus).toHaveBeenCalledTimes(2)
    })
    expect((await screen.findAllByText('/tmp/openclaw/memory/main.sqlite')).length).toBeGreaterThan(0)
  })

  it('shows fallback search mode guidance and reindexes memory', async () => {
    mockOpenclawMemoryStatus.mockResolvedValueOnce({
      success: true,
      data: {
        exitCode: 0,
        data: [
          {
            agentId: 'main',
            status: {
              backend: 'builtin',
              dirty: false,
              workspaceDir: '/tmp/openclaw/workspace',
              dbPath: '/tmp/openclaw/memory/main.sqlite',
            },
            scan: { totalFiles: 1 },
          },
        ],
        stderr: 'fts unavailable: no such module: fts5',
      },
    })
    mockOpenclawMemorySearchCapability.mockResolvedValueOnce({
      success: true,
      data: {
        mode: 'fallback',
        reason: 'fts5_unavailable',
      },
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Fallback file search')).toBeInTheDocument()
    expect(screen.getByText(/This runtime does not provide SQLite FTS5/i)).toBeInTheDocument()
    expect(screen.queryByText(/fts unavailable: no such module: fts5/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reindex memory' }))

    await waitFor(() => {
      expect(mockReindexOpenclawMemory).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Memory reindex completed and status refreshed.')).toBeInTheDocument()
  })

  it('hides legacy comparison and disables native search when openclaw memory is unsupported', async () => {
    mockOpenclawMemoryStatus.mockResolvedValueOnce({
      success: true,
      data: {
        exitCode: 1,
        data: { raw: '[plugins] memory-clawmaster-powermem: plugin registered' },
        stderr: "error: unknown command 'memory'",
      },
    })
    mockOpenclawMemorySearchCapability.mockResolvedValueOnce({
      success: true,
      data: {
        mode: 'unsupported',
        reason: 'command_unavailable',
        detail: "error: unknown command 'memory'",
      },
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Legacy memory unavailable')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText(/does not currently expose the legacy memory CLI/i)).toBeInTheDocument()
    expect(screen.queryByText('Recall comparison')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Agent ID (optional)')).toBeDisabled()
    expect(screen.getByPlaceholderText('Search memories...')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reindex memory' })).toBeDisabled()
  })

  it('confirms and deletes a native memory file', async () => {
    mockOpenclawMemoryFiles
      .mockResolvedValueOnce({
        success: true,
        data: {
          root: '/tmp/openclaw/memory',
          files: [
            {
              name: 'main.sqlite',
              relativePath: 'main.sqlite',
              absolutePath: '/tmp/openclaw/memory/main.sqlite',
              size: 4096,
              modifiedAtMs: 1710000000000,
              extension: 'sqlite',
              kind: 'sqlite',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          root: '/tmp/openclaw/memory',
          files: [],
        },
      })

    render(<MemoryPage />)

    expect(await screen.findByText('main.sqlite')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete main.sqlite' }))

    expect(await screen.findByRole('dialog', { name: 'Delete memory file "main.sqlite"? This cannot be undone.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockDeleteOpenclawMemoryFile).toHaveBeenCalledWith('main.sqlite')
    })
    expect(await screen.findByText('No memory files found yet')).toBeInTheDocument()
  })

  it('deletes a managed memory entry from the recent list', async () => {
    mockManagedMemoryList
      .mockResolvedValueOnce({
        success: true,
        data: {
          memories: [
            {
              id: 'managed-1',
              memoryId: 'managed-1',
              content: 'Alice prefers espresso after lunch.',
              userId: 'alice',
              agentId: 'planner',
              metadata: {},
              createdAt: '2026-04-12T17:00:00.000Z',
              updatedAt: '2026-04-12T17:00:00.000Z',
              accessCount: 0,
            },
          ],
          total: 1,
          limit: 8,
          offset: 0,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          memories: [],
          total: 0,
          limit: 8,
          offset: 0,
        },
      })

    render(<MemoryPage />)

    expect(await screen.findByText('Recent managed memories')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete managed-1' }))

    await waitFor(() => {
      expect(mockDeleteManagedMemory).toHaveBeenCalledWith('managed-1')
    })
    expect(await screen.findByText('No managed memories stored yet.')).toBeInTheDocument()
  })

  it('shows an error when a managed memory delete becomes stale', async () => {
    mockDeleteManagedMemory.mockResolvedValueOnce({
      success: true,
      data: { deleted: false },
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Recent managed memories')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete managed-1' }))

    await waitFor(() => {
      expect(mockDeleteManagedMemory).toHaveBeenCalledWith('managed-1')
    })
    expect(await screen.findByText('That managed memory was already removed.')).toBeInTheDocument()
  })

  it('treats malformed managed memory list payloads as empty instead of crashing', async () => {
    mockManagedMemoryList.mockResolvedValueOnce({
      success: true,
      data: {} as any,
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Recent managed memories')).toBeInTheDocument()
    expect(screen.getByText('No managed memories stored yet.')).toBeInTheDocument()
  })

  it('keeps bridge controls visible but disables managed actions until desktop bridge sync is ready', async () => {
    mockGetIsTauri.mockReturnValue(true)

    render(<MemoryPage />)

    expect(await screen.findByText('OpenClaw bridge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync bridge' })).toBeInTheDocument()
    expect(screen.getAllByText('Needs sync').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Sync the OpenClaw bridge first to enable managed PowerMem actions in desktop mode.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import OpenClaw memory' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Compare recall' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add memory' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Search' })[0]).toBeDisabled()
    expect(screen.getByPlaceholderText('Compare the same query across managed and legacy memory...')).toBeDisabled()
    expect(screen.getByPlaceholderText('User ID for managed memory (optional)')).toBeDisabled()
    expect(screen.getByPlaceholderText('Agent ID for managed memory (optional)')).toBeDisabled()
    expect(
      screen.getByPlaceholderText('Store a stable fact, preference, or reusable note in managed PowerMem memory...'),
    ).toBeDisabled()
    expect(screen.getByPlaceholderText('Search managed PowerMem memories...')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete managed-1' })).toBeDisabled()
  })

  it('keeps managed desktop actions disabled when bridge status fails to load', async () => {
    mockGetIsTauri.mockReturnValue(true)
    mockManagedMemoryBridgeStatus.mockResolvedValueOnce({
      success: false,
      error: 'bridge status unavailable',
    })

    render(<MemoryPage />)

    expect(await screen.findByText('bridge status unavailable')).toBeInTheDocument()
    expect(
      screen.getByText('Sync the OpenClaw bridge first to enable managed PowerMem actions in desktop mode.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import OpenClaw memory' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Compare recall' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add memory' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Search' })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete managed-1' })).toBeDisabled()
  })

  it('disables bridge sync when desktop bridge status is unsupported', async () => {
    mockGetIsTauri.mockReturnValue(true)
    mockManagedMemoryBridgeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        pluginId: 'memory-clawmaster-powermem',
        slotKey: 'memory',
        state: 'unsupported',
        issues: ['The managed PowerMem plugin files are missing from the ClawMaster package.'],
        installed: false,
        pluginStatus: null,
        installedPluginPath: null,
        runtimePluginPath: null,
        pluginPath: '/tmp/clawmaster/plugins/memory-clawmaster-powermem',
        pluginPathExists: false,
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
      },
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Unsupported')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync bridge' })).toBeDisabled()
  })
})
