import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import MemoryPage from '../MemoryPage'

const mockGetIsTauri = vi.fn(() => false)
const mockManagedMemoryStatus = vi.fn()
const mockManagedMemoryStats = vi.fn()
const mockManagedMemoryImportStatus = vi.fn()
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
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
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
        dbPath: '/tmp/.clawmaster/data/default/memory/powermem/powermem.sqlite',
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
    expect(await screen.findByText('powermem foundation')).toBeInTheDocument()
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
  })

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

  it('adds and searches managed powermem memories', async () => {
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

    expect(await screen.findByText('powermem foundation')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('User ID for managed memory (optional)'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Agent ID for managed memory (optional)'), {
      target: { value: 'planner' },
    })
    fireEvent.change(
      screen.getByPlaceholderText('Store a stable fact, preference, or reusable note in managed powermem memory...'),
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
    expect(await screen.findByText('Managed powermem memory saved.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search managed powermem memories...'), {
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

  it('imports legacy OpenClaw memory into managed powermem', async () => {
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
    expect(await screen.findByText('Legacy OpenClaw memory imported into managed powermem.')).toBeInTheDocument()
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

  it('shows a neutral desktop placeholder instead of a managed-memory error', async () => {
    mockGetIsTauri.mockReturnValue(true)
    mockManagedMemoryStatus.mockResolvedValueOnce({
      success: false,
      error: 'Managed powermem memory is available in web/backend mode first.',
    })
    mockManagedMemoryStats.mockResolvedValueOnce({
      success: false,
      error: 'Managed powermem memory is available in web/backend mode first.',
    })
    mockManagedMemoryList.mockResolvedValueOnce({
      success: false,
      error: 'Managed powermem memory is available in web/backend mode first.',
    })

    render(<MemoryPage />)

    expect(await screen.findByText('Managed powermem memory will arrive in desktop mode in a later PR. Native OpenClaw memory tools below remain available now.')).toBeInTheDocument()
    expect(screen.queryByText('Managed powermem memory is available in web/backend mode first.')).not.toBeInTheDocument()
  })
})
