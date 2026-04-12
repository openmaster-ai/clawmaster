import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import ChannelsPage from '../ChannelsPage'

const mockGetConfig = vi.fn()
const mockExecCommand = vi.fn()
const mockGetLogsResult = vi.fn()

vi.mock('@/adapters', () => ({
  platformResults: {
    getConfig: (...args: any[]) => mockGetConfig(...args),
    saveFullConfig: vi.fn(),
    removeChannel: vi.fn(),
    setConfig: vi.fn(),
    verifyChannelAccount: vi.fn(),
    upsertBinding: vi.fn(),
    deleteBinding: vi.fn(),
  },
}))

vi.mock('@/shared/adapters/platform', () => ({
  isTauri: () => false,
  execCommand: (...args: any[]) => mockExecCommand(...args),
}))

vi.mock('@/shared/adapters/logs', () => ({
  getLogsResult: (...args: any[]) => mockGetLogsResult(...args),
}))

function renderChannels() {
  return render(
    <MemoryRouter>
      <ChannelsPage />
    </MemoryRouter>,
  )
}

describe('ChannelsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('zh')
    mockExecCommand.mockResolvedValue('')
    mockGetLogsResult.mockResolvedValue({
      success: true,
      data: [
        { timestamp: '2026-04-07 10:00:00', level: 'ERROR', message: 'webchat disconnected code=1001' },
      ],
    })
    mockGetConfig.mockResolvedValue({
      success: true,
      data: {
        channels: {},
        bindings: [],
        agents: {
          list: [{ id: 'default', name: '默认智能体' }],
        },
      },
    })
  })

  it('prioritizes recommended channel groups and opens the featured editor directly', async () => {
    renderChannels()

    expect(await screen.findByText('推荐入口')).toBeInTheDocument()
    expect(screen.getByText('国内团队协作')).toBeInTheDocument()
    expect(screen.getByText('全球工作区与社区')).toBeInTheDocument()
    expect(screen.getByText('飞书')).toBeInTheDocument()
    expect(screen.getByText('微信')).toBeInTheDocument()
    expect(screen.getByText('Discord')).toBeInTheDocument()
    expect(screen.getByText('Slack')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '开始配置' })[0])

    expect(await screen.findByRole('heading', { name: '通道设置: 飞书' })).toBeInTheDocument()
    expect(screen.getByText('配置步骤')).toBeInTheDocument()
    expect(screen.getByText('前往飞书开放平台创建企业自建应用')).toBeInTheDocument()
  })

  it('uses an install-first QR flow for wechat instead of the generic credential editor', async () => {
    mockExecCommand.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'list') {
        throw new Error('not installed')
      }
      if (cmd === 'npm' && args[0] === 'install') {
        return 'installed'
      }
      return ''
    })

    renderChannels()

    expect(await screen.findByText('推荐入口')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '开始配置' })[1])

    expect(await screen.findAllByRole('heading', { name: '微信' })).toHaveLength(2)
    expect(screen.getAllByText('点击开始后自动安装，无需手动操作')).toHaveLength(2)
    expect(screen.getByText('@tencent-weixin/openclaw-weixin')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '安装微信插件' }))

    await screen.findByText('已安装')
    expect(mockExecCommand).toHaveBeenCalledWith('npm', [
      'install',
      '-g',
      '@tencent-weixin/openclaw-weixin',
    ])
  })

  it('opens recent logs from the contextual troubleshooting action', async () => {
    renderChannels()

    expect(await screen.findByText('推荐入口')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看最近日志' }))

    expect(await screen.findByRole('dialog', { name: '通道排障日志' })).toBeInTheDocument()
    expect(screen.getByText('webchat disconnected code=1001')).toBeInTheDocument()
  })
})
