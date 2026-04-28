import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import GatewayPage from '../GatewayPage'

const mockGetConfig = vi.fn()
const mockGetGatewayStatus = vi.fn()
const mockGetLogsResult = vi.fn()
const mockStartGateway = vi.fn()
const mockStopGateway = vi.fn()
const mockRestartGateway = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    startGateway: (...args: any[]) => mockStartGateway(...args),
    stopGateway: (...args: any[]) => mockStopGateway(...args),
    restartGateway: (...args: any[]) => mockRestartGateway(...args),
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

function renderGatewayPage() {
  return render(
    <MemoryRouter>
      <GatewayPage />
    </MemoryRouter>,
  )
}

describe('GatewayPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useRealTimers()
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

    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    })
  })

  it('renders auth-aware WebUI links and recent gateway logs', async () => {
    renderGatewayPage()

    expect(await screen.findByRole('heading', { name: 'Gateway Management' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'More Diagnostics' })[0]).toHaveAttribute(
      'href',
      '/settings#settings-logs',
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'View Recent Logs' })[0])

    expect(await screen.findByRole('dialog', { name: 'Recent Gateway Logs' })).toBeInTheDocument()
    expect(screen.getByText(/\[gateway\] listening on ws:\/\/127\.0\.0\.1:18789/)).toBeInTheDocument()
    expect(screen.queryByText(/webchat disconnected code=1001/)).not.toBeInTheDocument()

    const webUiLinks = screen.getAllByRole('link', { name: 'Open OpenClaw WebUI' })
    expect(webUiLinks.length).toBeGreaterThan(0)
    webUiLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', 'http://127.0.0.1:18789/?token=secret-token')
      expect(link).toHaveAttribute('target', '_blank')
    })
  })

  it('copies the gateway token from either card action', async () => {
    renderGatewayPage()

    expect(await screen.findByRole('heading', { name: 'Gateway Management' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Click to copy' })[0])

    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('secret-token')
    })
    expect(await screen.findByText('Token copied')).toBeInTheDocument()
  })

  it('shows the service watchdog safeguard state when available', async () => {
    mockGetGatewayStatus.mockResolvedValue({
      success: true,
      data: {
        running: true,
        port: 18789,
        watchdog: {
          enabled: true,
          state: 'healthy',
          intervalMs: 30000,
          restartCount: 2,
          lastCheckAt: '2026-04-28T00:00:00.000Z',
        },
      },
    })

    renderGatewayPage()

    expect((await screen.findAllByText('Auto-restart enabled')).length).toBeGreaterThan(0)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('ClawMaster service monitors OpenClaw gateway and restarts it after unexpected downtime.')).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
  })

  it('starts a stopped gateway and refreshes the runtime controls', async () => {
    mockGetGatewayStatus
      .mockResolvedValueOnce({ success: true, data: { running: false, port: 18789 } })
      .mockResolvedValueOnce({ success: true, data: { running: true, port: 18789 } })
      .mockResolvedValue({ success: true, data: { running: true, port: 18789 } })

    renderGatewayPage()

    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(mockStartGateway).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByRole('button', { name: 'Stop' }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  }, 10000)

  it('stops a running gateway and returns the start action', async () => {
    mockGetGatewayStatus
      .mockResolvedValueOnce({ success: true, data: { running: true, port: 18789 } })
      .mockResolvedValueOnce({ success: true, data: { running: false, port: 18789 } })
      .mockResolvedValue({ success: true, data: { running: false, port: 18789 } })

    renderGatewayPage()

    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(mockStopGateway).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByRole('button', { name: 'Start' }, { timeout: 4000 })).toBeInTheDocument()
  }, 10000)

  it('renders normalized IPv6/basePath WebUI links from config', async () => {
    mockGetConfig.mockResolvedValue({
      success: true,
      data: {
        gateway: {
          port: 18790,
          bind: '::',
          auth: { mode: 'token', token: 'ipv6-secret' },
          controlUi: { basePath: 'openclaw' },
        },
      },
    })

    renderGatewayPage()

    expect(await screen.findByRole('heading', { name: 'Gateway Management' })).toBeInTheDocument()

    const webUiLinks = screen.getAllByRole('link', { name: 'Open OpenClaw WebUI' })
    webUiLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', 'http://[::1]:18790/openclaw?token=ipv6-secret')
    })

    expect(screen.getAllByText('ws://[::1]:18790').length).toBeGreaterThan(0)
  })
})
