import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import GatewayPage from '../GatewayPage'

const mockGetConfig = vi.fn()
const mockGetGatewayStatus = vi.fn()
const mockGetLogsResult = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    startGateway: vi.fn(),
    stopGateway: vi.fn(),
    restartGateway: vi.fn(),
  },
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    getConfig: (...args: any[]) => mockGetConfig(...args),
    getGatewayStatus: (...args: any[]) => mockGetGatewayStatus(...args),
  },
}))

vi.mock('@/shared/adapters/logs', () => ({
  getLogsResult: (...args: any[]) => mockGetLogsResult(...args),
}))

describe('GatewayPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')

    mockGetConfig.mockResolvedValue({
      success: true,
      data: {
        gateway: {
          port: 18789,
          bind: 'loopback',
          auth: { mode: 'token', token: 'secret-token' },
        },
      },
    })

    mockGetGatewayStatus.mockResolvedValue({
      success: true,
      data: {
        running: true,
        port: 18789,
      },
    })

    mockGetLogsResult.mockResolvedValue({
      success: true,
      data: [
        {
          timestamp: '2026-04-07T15:50:42.139Z',
          level: 'INFO',
          message: '2026-04-06T12:16:01.997+08:00 [gateway] listening on ws://127.0.0.1:18789',
        },
        {
          timestamp: '2026-04-07T15:50:42.139Z',
          level: 'INFO',
          message: '2026-04-05T20:19:43.900+08:00 [ws] webchat disconnected code=1001',
        },
      ],
    })
  })

  it('opens recent gateway logs and keeps only gateway-scoped entries', async () => {
    render(<GatewayPage />)

    expect(await screen.findByRole('heading', { name: 'Gateway Management' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'View Recent Logs' })[0])

    expect(await screen.findByRole('dialog', { name: 'Recent Gateway Logs' })).toBeInTheDocument()
    expect(screen.getByText(/\[gateway\] listening on ws:\/\/127\.0\.0\.1:18789/)).toBeInTheDocument()
    expect(screen.queryByText(/webchat disconnected code=1001/)).not.toBeInTheDocument()
  })
})
