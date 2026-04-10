import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import DashboardPage from '../DashboardPage'

const mockDetectSystem = vi.fn()
const mockGetGatewayStatus = vi.fn()
const mockGetConfig = vi.fn()
const mockClawprobeStatus = vi.fn()
const mockListPlugins = vi.fn()
const mockGetSkills = vi.fn()
const mockGetMcpServers = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    detectSystem: (...args: any[]) => mockDetectSystem(...args),
    getGatewayStatus: (...args: any[]) => mockGetGatewayStatus(...args),
    getConfig: (...args: any[]) => mockGetConfig(...args),
  },
  platformResults: {
    clawprobeStatus: (...args: any[]) => mockClawprobeStatus(...args),
    listPlugins: (...args: any[]) => mockListPlugins(...args),
    getSkills: (...args: any[]) => mockGetSkills(...args),
  },
}))

vi.mock('@/shared/adapters/mcp', () => ({
  getMcpServers: (...args: any[]) => mockGetMcpServers(...args),
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
    mockClawprobeStatus.mockResolvedValue({
      success: true,
      data: {
        agent: 'main',
        daemonRunning: true,
        installRequired: false,
        sessionKey: 'sess-1',
        sessionId: 'sess-1',
        model: 'openai/gpt-5.4',
        provider: 'openai',
        sessionTokens: 1024,
        windowSize: 8192,
        utilizationPct: 13,
        inputTokens: 512,
        outputTokens: 512,
        compactionCount: 0,
        lastActiveAt: Date.now(),
        isActive: true,
        todayUsd: 0.42,
        suggestions: [],
      },
    })
    mockListPlugins.mockResolvedValue({
      success: true,
      data: { plugins: [{ id: 'tavily', name: 'Tavily', status: 'loaded' }] },
    })
    mockGetSkills.mockResolvedValue({
      success: true,
      data: [{ slug: 'find-skills-skill', name: 'Find Skills', description: '', version: '1.0.0', disabled: false }],
    })
    mockGetMcpServers.mockResolvedValue({
      success: true,
      data: {
        context7: {
          enabled: true,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          env: {},
        },
      },
    })
  })

  it('renders dashboard data, opens task drawer, and points checklist links to exact sections', async () => {
    mockDetectSystem.mockResolvedValue({
      nodejs: { installed: true, version: '20.11.1' },
      npm: { installed: true, version: '10.8.1' },
      openclaw: { installed: true, version: '2026.4.1', configPath: '/tmp/openclaw.json' },
    })
    mockGetGatewayStatus.mockResolvedValue({ running: true, port: 3010 })
    mockGetConfig.mockResolvedValue({
      gateway: { port: 3010, bind: '0.0.0.0', auth: { mode: 'token' } },
      channels: {
        feishu: { enabled: true, accounts: { prod: {} } },
        slack: { enabled: true, accounts: { prod: {}, qa: {} } },
        discord: { enabled: false, accounts: { staging: {} } },
      },
      models: {
        providers: {
          openai: { baseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-5.4', name: 'gpt-5.4' }] },
        },
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
    expect(screen.getByText('feishu')).toBeInTheDocument()
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

    expect(screen.getByRole('heading', { name: '推荐任务流' })).toBeInTheDocument()
    expect(screen.getByText('接入飞书或 Lark')).toBeInTheDocument()
    expect(screen.getByText('控制成本与用量')).toBeInTheDocument()
    expect(screen.getByText('运维私有部署')).toBeInTheDocument()
    expect(screen.getByText('扩展助手能力')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '文档' })).toHaveAttribute('href', '/docs')
    expect(screen.getAllByRole('link', { name: '能力中心' })[0]).toHaveAttribute('href', '/capabilities')

    fireEvent.click(screen.getByRole('button', { name: '打开 接入飞书或 Lark 清单' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('任务清单')).toBeInTheDocument()
    expect(within(dialog).getByText('接入飞书或 Lark')).toBeInTheDocument()
    expect(within(dialog).getByText('建议下一步')).toBeInTheDocument()
    expect(within(dialog).getAllByText('已就绪').length).toBeGreaterThan(0)

    const jumpLinks = within(dialog).getAllByRole('link', { name: '前往对应区块' })
    const jumpHrefs = jumpLinks.map((link) => link.getAttribute('href'))
    expect(jumpHrefs).toContain('/models#models-providers')
    expect(jumpHrefs).toContain('/gateway#gateway-runtime')
    expect(jumpHrefs).toContain('/channels#channel-focus')
    expect(jumpHrefs).toContain('/channels#channel-configured')

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: '打开控制台' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:3010',
    )
    expect(screen.getByRole('link', { name: '查看日志' })).toHaveAttribute('href', '/gateway')
    expect(screen.getByRole('link', { name: '编辑配置' })).toHaveAttribute('href', '/config')

    fireEvent.click(screen.getByRole('button', { name: '打开 扩展助手能力 清单' }))

    const capabilityDialog = await screen.findByRole('dialog')
    const capabilityLinks = within(capabilityDialog).getAllByRole('link', { name: '前往对应区块' })
    const capabilityHrefs = capabilityLinks.map((link) => link.getAttribute('href'))
    expect(capabilityHrefs).toContain('/capabilities#capability-connect-data')
    expect(capabilityHrefs).toContain('/capabilities#capability-automation')
    expect(capabilityHrefs).toContain('/capabilities#capability-enhance')
    expect(capabilityHrefs).toContain('/capabilities#capability-runtime')
  }, 10000)

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
      models: { providers: {} },
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
      models: { providers: {} },
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
    mockGetConfig.mockResolvedValue({ models: { providers: {} } })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('错误: backend unavailable')).toBeInTheDocument()
    })
  })

  it('treats disabled MCP-only setups as not yet connected or verified', async () => {
    mockDetectSystem.mockResolvedValue({
      nodejs: { installed: true, version: '20.11.1' },
      npm: { installed: true, version: '10.8.1' },
      openclaw: { installed: true, version: '2026.4.1', configPath: '/tmp/openclaw.json' },
    })
    mockGetGatewayStatus.mockResolvedValue({ running: true, port: 3010 })
    mockGetConfig.mockResolvedValue({
      gateway: { port: 3010, bind: '0.0.0.0', auth: { mode: 'token' } },
      channels: {},
      models: { providers: {} },
      agents: { defaults: { model: { primary: '' }, workspace: '' }, list: [] },
    })
    mockListPlugins.mockResolvedValueOnce({ success: true, data: { plugins: [] } })
    mockGetSkills.mockResolvedValueOnce({ success: true, data: [] })
    mockGetMcpServers.mockResolvedValueOnce({
      success: true,
      data: {
        deepwiki: {
          enabled: false,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'deepwiki-mcp'],
          env: {},
        },
      },
    })

    renderDashboard()

    fireEvent.click(await screen.findByRole('button', { name: '打开 扩展助手能力 清单' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('需处理').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('待确认').length).toBeGreaterThan(0)
    const jumpLinks = within(dialog).getAllByRole('link', { name: '前往对应区块' })
    const jumpHrefs = jumpLinks.map((link) => link.getAttribute('href'))
    expect(jumpHrefs).toContain('/capabilities#capability-connect-data')
    expect(jumpHrefs).toContain('/capabilities#capability-runtime')
  })
})
