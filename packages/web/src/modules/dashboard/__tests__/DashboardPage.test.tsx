import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import DashboardPage from '../DashboardPage'

const mockDetectSystem = vi.fn()
const mockGetGatewayStatus = vi.fn()
const mockGetConfig = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    detectSystem: (...args: any[]) => mockDetectSystem(...args),
    getGatewayStatus: (...args: any[]) => mockGetGatewayStatus(...args),
    getConfig: (...args: any[]) => mockGetConfig(...args),
  },
}))

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('zh')
  })

  it('renders dashboard data and quick-action links from live config values', async () => {
    mockDetectSystem.mockResolvedValue({
      nodejs: { installed: true, version: '20.11.1' },
      npm: { installed: true, version: '10.8.1' },
      openclaw: { installed: true, version: '2026.4.1', configPath: '/tmp/openclaw.json' },
    })
    mockGetGatewayStatus.mockResolvedValue({ running: true, port: 3010 })
    mockGetConfig.mockResolvedValue({
      gateway: { port: 3010, bind: '0.0.0.0', auth: { mode: 'token' } },
      channels: {
        slack: { enabled: true, accounts: { prod: {}, qa: {} } },
        discord: { enabled: false, accounts: { staging: {} } },
      },
      agents: {
        defaults: {
          model: { primary: 'gpt-5.4' },
          workspace: '/srv/agents',
        },
        list: [
          { id: 'main', name: 'Main Agent' },
          { id: 'review', name: 'Review Agent' },
        ],
      },
    })

    renderDashboard()

    expect(await screen.findByText('系统环境')).toBeInTheDocument()
    expect(screen.getByText('20.11.1')).toBeInTheDocument()
    expect(screen.getByText('10.8.1')).toBeInTheDocument()
    expect(screen.getAllByText('v2026.4.1').length).toBeGreaterThan(0)
    expect(screen.getByText('slack')).toBeInTheDocument()
    expect(screen.getByText('(2 账号)')).toBeInTheDocument()
    expect(screen.getByText('gpt-5.4')).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => element?.textContent === '工作区: /srv/agents'),
    ).toBeInTheDocument()
    expect(screen.getByText('2 个已配置')).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => element?.textContent === '• Main Agent'),
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => element?.textContent === '• Review Agent'),
    ).toBeInTheDocument()

    expect(screen.getByRole('link', { name: '打开控制台' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:3010',
    )
    expect(screen.getByRole('link', { name: '查看日志' })).toHaveAttribute('href', '/gateway')
    expect(screen.getByRole('link', { name: '编辑配置' })).toHaveAttribute('href', '/config')
  })

  it('shows the no-channel placeholder when config has no channels', async () => {
    mockDetectSystem.mockResolvedValue({
      nodejs: { installed: true, version: '20.11.1' },
      npm: { installed: true, version: '10.8.1' },
      openclaw: { installed: false, version: '', configPath: '/tmp/openclaw.json' },
    })
    mockGetGatewayStatus.mockResolvedValue({ running: false, port: 0 })
    mockGetConfig.mockResolvedValue({
      gateway: { port: 18789, bind: '127.0.0.1', auth: { mode: 'none' } },
      channels: {},
      agents: { defaults: { model: { primary: '' }, workspace: '' }, list: [] },
    })

    renderDashboard()

    expect(await screen.findByText('暂无通道配置')).toBeInTheDocument()
  })

  it('renders the shell while gateway status is still loading', async () => {
    let resolveGateway: ((value: { running: boolean; port: number }) => void) | undefined

    mockDetectSystem.mockResolvedValue({
      nodejs: { installed: true, version: '20.11.1' },
      npm: { installed: true, version: '10.8.1' },
      openclaw: { installed: true, version: '2026.4.1', configPath: '/tmp/openclaw.json' },
    })
    mockGetGatewayStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveGateway = resolve
      }),
    )
    mockGetConfig.mockResolvedValue({
      gateway: { port: 18789, bind: '127.0.0.1', auth: { mode: 'token' } },
      channels: {},
      agents: { defaults: { model: { primary: 'gpt-5.4' }, workspace: '/srv/agents' }, list: [] },
    })

    renderDashboard()

    expect(await screen.findByText('系统环境')).toBeInTheDocument()
    expect(screen.getByText('20.11.1')).toBeInTheDocument()
    expect(screen.getAllByLabelText('loading').length).toBeGreaterThan(0)

    resolveGateway?.({ running: true, port: 18789 })

    await waitFor(() => {
      expect(screen.getAllByText('运行中').length).toBeGreaterThan(0)
    })
  })

  it('renders a translated error message when dashboard loading fails', async () => {
    mockDetectSystem.mockRejectedValue(new Error('backend unavailable'))
    mockGetGatewayStatus.mockResolvedValue({ running: false, port: 0 })
    mockGetConfig.mockResolvedValue({})

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('错误: backend unavailable')).toBeInTheDocument()
    })
  })
})
