import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import DocsPage from '../DocsPage'

const mockExecCommand = vi.fn()
const mockWriteText = vi.fn()

vi.mock('@/shared/adapters/platform', () => ({
  execCommand: (...args: any[]) => mockExecCommand(...args),
}))

describe('DocsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
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
