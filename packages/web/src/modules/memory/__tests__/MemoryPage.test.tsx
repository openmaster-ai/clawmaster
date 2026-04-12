import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import MemoryPage from '../MemoryPage'

const mockOpenclawMemoryStatus = vi.fn()
const mockOpenclawMemorySearchCapability = vi.fn()
const mockOpenclawMemorySearch = vi.fn()
const mockOpenclawMemoryFiles = vi.fn()
const mockReindexOpenclawMemory = vi.fn()
const mockDeleteOpenclawMemoryFile = vi.fn()

vi.mock('@/adapters', () => ({
  platformResults: {
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0])

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
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0])

    await waitFor(() => {
      expect(mockOpenclawMemorySearch).toHaveBeenCalledWith('missing note', {
        agent: undefined,
        maxResults: 25,
      })
    })

    expect(await screen.findByText('No results')).toBeInTheDocument()
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
})
