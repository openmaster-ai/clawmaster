import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import SessionsPage from '../SessionsPage'

const mockCleanupSessions = vi.fn()
const mockGetSessionDetail = vi.fn()
const mockRefetch = vi.fn()

vi.mock('@/shared/hooks/useAdapterCall', () => ({
  useAdapterCall: () => ({
    data: {
      path: '/tmp/sessions',
      count: 2,
      sessions: [
        {
          key: 'sess-main',
          sessionId: 'sess-main',
          agentId: 'main',
          model: 'gpt-4.1-mini',
          modelProvider: 'openai',
          kind: 'direct',
          inputTokens: 1200,
          outputTokens: 450,
          totalTokens: 1650,
          contextTokens: 8000,
          updatedAt: Date.now(),
          ageMs: 30_000,
        },
        {
          key: 'sess-review',
          sessionId: 'sess-review',
          agentId: 'review',
          model: 'claude-sonnet-4-6',
          modelProvider: 'anthropic',
          kind: 'channel',
          inputTokens: 300,
          outputTokens: 180,
          totalTokens: 480,
          contextTokens: 4000,
          updatedAt: Date.now(),
          ageMs: 10 * 60 * 1000,
        },
      ],
    },
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
}))

vi.mock('@/shared/adapters/sessions', () => ({
  getSessions: vi.fn(),
  cleanupSessions: (...args: any[]) => mockCleanupSessions(...args),
  getSessionDetail: (...args: any[]) => mockGetSessionDetail(...args),
}))

describe('SessionsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')

    mockCleanupSessions.mockResolvedValue({ success: true, data: 'ok', error: null })
    mockGetSessionDetail.mockResolvedValue({
      success: true,
      data: {
        sessionKey: 'sess-main',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        inputTokens: 1200,
        outputTokens: 450,
        totalTokens: 1650,
        estimatedUsd: 0.0123,
        startedAt: 1710000000,
        lastActiveAt: 1710000300,
        durationMin: 5,
        compactionCount: 1,
        turns: [
          {
            turnIndex: 1,
            timestamp: 1710000000,
            inputTokensDelta: 400,
            outputTokensDelta: 120,
            estimatedUsd: 0.0031,
            compactOccurred: false,
            tools: ['tavily-search'],
          },
        ],
      },
      error: null,
    })
  })

  it('filters sessions by agent and expands a session to load detail', async () => {
    render(<SessionsPage />)

    expect(await screen.findByRole('heading', { name: 'Session Management' })).toBeInTheDocument()
    expect(screen.getByText('sess-main')).toBeInTheDocument()
    expect(screen.getByText('sess-review')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'main' } })

    expect(screen.getByText('sess-main')).toBeInTheDocument()
    expect(screen.queryByText('sess-review')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('sess-main'))

    await waitFor(() => {
      expect(mockGetSessionDetail).toHaveBeenCalledWith('sess-main')
    })
    expect(await screen.findByText('$0.0123')).toBeInTheDocument()
    expect(screen.getByText('1 turns')).toBeInTheDocument()
    expect(screen.getByText('tavily-search')).toBeInTheDocument()
  })

  it('runs cleanup and refetches the list', async () => {
    render(<SessionsPage />)

    await screen.findByRole('heading', { name: 'Session Management' })
    fireEvent.click(screen.getByRole('button', { name: 'Cleanup' }))

    await waitFor(() => {
      expect(mockCleanupSessions).toHaveBeenCalled()
      expect(mockRefetch).toHaveBeenCalled()
    })
  })
})
