import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RecentLogsSheet } from '../RecentLogsSheet'

const mockGetLogsResult = vi.fn()

vi.mock('@/shared/adapters/logs', () => ({
  getLogsResult: (...args: any[]) => mockGetLogsResult(...args),
}))

describe('RecentLogsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLogsResult.mockResolvedValue({
      success: true,
      data: [
        {
          timestamp: '2026-04-07 10:00:00',
          level: 'ERROR',
          message: 'gateway failed to bind',
        },
        {
          timestamp: '2026-04-07 10:00:02',
          level: 'INFO',
          message: 'gateway restarted successfully',
        },
      ],
    })
  })

  it('loads and filters recent log entries', async () => {
    render(
      <RecentLogsSheet
        open
        onClose={() => {}}
        title="Recent Gateway Logs"
        description="Use this to troubleshoot gateway issues."
      />,
    )

    expect(await screen.findByText('gateway failed to bind')).toBeInTheDocument()
    expect(screen.getByText('gateway restarted successfully')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bind' } })

    await waitFor(() => {
      expect(screen.getByText('gateway failed to bind')).toBeInTheDocument()
      expect(screen.queryByText('gateway restarted successfully')).not.toBeInTheDocument()
    })
  })

  it('applies the scope filter before rendering entries', async () => {
    mockGetLogsResult.mockResolvedValue({
      success: true,
      data: [
        {
          timestamp: '2026-04-07 10:00:00',
          level: 'INFO',
          message: '2026-04-06T12:16:01.997+08:00 [gateway] listening on ws://127.0.0.1:18789',
        },
        {
          timestamp: '2026-04-07 10:00:02',
          level: 'INFO',
          message: '2026-04-05T20:19:43.900+08:00 [ws] webchat disconnected code=1001',
        },
      ],
    })

    render(
      <RecentLogsSheet
        open
        onClose={() => {}}
        title="Channel Troubleshooting Logs"
        scope="channels"
        lines={200}
      />,
    )

    expect(await screen.findByText(/webchat disconnected/)).toBeInTheDocument()
    expect(screen.queryByText(/listening on ws:\/\//)).not.toBeInTheDocument()
  })
})
