import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import DocsPage from '../DocsPage'

const mockExecCommand = vi.fn()
const mockWriteText = vi.fn()
const mockUpsertLocalDataDocuments = vi.fn()
const mockSearchLocalData = vi.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

vi.mock('@/shared/adapters/platform', () => ({
  execCommand: (...args: any[]) => mockExecCommand(...args),
}))

vi.mock('@/shared/adapters/storage', () => ({
  upsertLocalDataDocumentsResult: (...args: any[]) => mockUpsertLocalDataDocuments(...args),
  searchLocalDataResult: (...args: any[]) => mockSearchLocalData(...args),
}))

describe('DocsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockUpsertLocalDataDocuments.mockResolvedValue({ success: true, data: { documentCount: 14 }, error: null })
    mockSearchLocalData.mockResolvedValue({ success: true, data: [], error: null })
    await changeLanguage('en')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: mockWriteText,
      },
    })
  })

  it('renders the local-first docs hub sections', () => {
    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Documentation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Common Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Core Guides' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Copyable Commands' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Troubleshooting' })).toBeInTheDocument()
    expect(screen.getByText('Connect Feishu or Lark')).toBeInTheDocument()
  })

  it('filters local cards by query before using live search', async () => {
    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway' },
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Local Matches' })).toBeInTheDocument()
      expect(screen.getByText('Gateway will not start')).toBeInTheDocument()
      expect(screen.queryByText('Connect Feishu or Lark')).not.toBeInTheDocument()
    })
  })

  it('shows indexed fallback store results for docs queries', async () => {
    mockSearchLocalData.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'docs:guide:quickstart',
          module: 'docs',
          sourceType: 'guide',
          sourcePath: 'https://docs.openclaw.ai/quickstart',
          title: 'Quick Start',
          content: 'Install OpenClaw and start the gateway.',
          tags: ['install', 'setup', 'gateway'],
          metadata: { url: 'https://docs.openclaw.ai/quickstart' },
          updatedAt: '2026-04-10T00:00:00.000Z',
          score: 99,
          snippet: 'Install OpenClaw and start the gateway.',
        },
      ],
      error: null,
    })

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway setup' },
    })

    await waitFor(() => {
      expect(mockUpsertLocalDataDocuments).toHaveBeenCalledWith(
        expect.any(Array),
        { replace: { module: 'docs' } },
      )
      expect(mockSearchLocalData).toHaveBeenCalledWith({ query: 'gateway setup', module: 'docs', limit: 8 })
    })
    expect(await screen.findByRole('heading', { name: 'Indexed Local Data' })).toBeInTheDocument()
    expect(screen.getByText('Install OpenClaw and start the gateway.')).toBeInTheDocument()
  })

  it('waits for local docs indexing before querying the fallback store', async () => {
    const upsert = deferred<{ success: true; data: { documentCount: number }; error: null }>()
    mockUpsertLocalDataDocuments.mockReturnValue(upsert.promise)

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway setup' },
    })

    await waitFor(() => {
      expect(mockUpsertLocalDataDocuments).toHaveBeenCalledWith(
        expect.any(Array),
        { replace: { module: 'docs' } },
      )
    })
    expect(mockSearchLocalData).not.toHaveBeenCalled()

    await act(async () => {
      upsert.resolve({ success: true, data: { documentCount: 14 }, error: null })
    })

    await waitFor(() => {
      expect(mockSearchLocalData).toHaveBeenCalledWith({ query: 'gateway setup', module: 'docs', limit: 8 })
    })
  })

  it('waits for the latest docs reindex when localized docs change mid-flight', async () => {
    const firstUpsert = deferred<{ success: true; data: { documentCount: number }; error: null }>()
    const secondUpsert = deferred<{ success: true; data: { documentCount: number }; error: null }>()
    mockUpsertLocalDataDocuments
      .mockReturnValueOnce(firstUpsert.promise)
      .mockReturnValueOnce(secondUpsert.promise)

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockUpsertLocalDataDocuments).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await changeLanguage('ja')
    })

    await waitFor(() => {
      expect(mockUpsertLocalDataDocuments).toHaveBeenCalledTimes(2)
    })

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'gateway setup' },
    })

    await act(async () => {
      firstUpsert.resolve({ success: true, data: { documentCount: 14 }, error: null })
    })

    expect(mockSearchLocalData).not.toHaveBeenCalled()

    await act(async () => {
      secondUpsert.resolve({ success: true, data: { documentCount: 14 }, error: null })
    })

    await waitFor(() => {
      expect(mockSearchLocalData).toHaveBeenCalledWith({ query: 'gateway setup', module: 'docs', limit: 8 })
    })
  })

  it('retries local docs indexing after a transient write failure on a later query', async () => {
    mockUpsertLocalDataDocuments
      .mockResolvedValueOnce({ success: false, error: 'backend booting' })
      .mockResolvedValueOnce({ success: true, data: { documentCount: 14 }, error: null })
    mockSearchLocalData.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'docs:guide:quickstart',
          module: 'docs',
          sourceType: 'guide',
          title: 'Quick Start',
          content: 'Install OpenClaw and start the gateway.',
          tags: ['install', 'setup', 'gateway'],
          metadata: {},
          updatedAt: '2026-04-10T00:00:00.000Z',
          score: 88,
          snippet: 'Install OpenClaw and start the gateway.',
        },
      ],
      error: null,
    })

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway' },
    })

    await waitFor(() => {
      expect(mockUpsertLocalDataDocuments).toHaveBeenCalledTimes(1)
    })
    expect(mockSearchLocalData).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway setup' },
    })

    await waitFor(() => {
      expect(mockUpsertLocalDataDocuments).toHaveBeenCalledTimes(2)
      expect(mockSearchLocalData).toHaveBeenCalledWith({ query: 'gateway setup', module: 'docs', limit: 8 })
    })
  })

  it('shows the local empty state when no built-in results match the query', async () => {
    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'totally-unmatched-keyword' },
    })

    await waitFor(() => {
      expect(screen.getByText('No local matches yet')).toBeInTheDocument()
      expect(screen.getByText('Try a broader keyword or use live docs search for upstream results.')).toBeInTheDocument()
    })
  })

  it('runs live docs fallback search through the OpenClaw CLI', async () => {
    mockExecCommand.mockResolvedValue(
      'Gateway Authentication https://docs.openclaw.ai/gateway/auth\nToken mode, loopback bind, and browser access.',
    )

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway auth' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search Live Docs' }))

    await waitFor(() => {
      expect(mockExecCommand).toHaveBeenCalledWith('openclaw', ['docs', 'gateway auth'])
    })

    expect(await screen.findByRole('heading', { name: 'Live Docs Results' })).toBeInTheDocument()
    expect(screen.getByText('Gateway Authentication')).toBeInTheDocument()
    expect(screen.getByText(/Token mode, loopback bind/)).toBeInTheDocument()
  })

  it('shows an error banner when the live docs fallback search fails', async () => {
    mockExecCommand.mockRejectedValue(new Error('cli unavailable'))

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Search guides, commands, and troubleshooting...'), {
      target: { value: 'gateway auth' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search Live Docs' }))

    expect(await screen.findByText('Search failed. Check your network.')).toBeInTheDocument()
  })

  it('copies command snippets from the docs hub', async () => {
    mockWriteText.mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <DocsPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy Command' })[0])

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('openclaw gateway start')
    })

    expect(await screen.findByText('Command copied')).toBeInTheDocument()
  })
})
