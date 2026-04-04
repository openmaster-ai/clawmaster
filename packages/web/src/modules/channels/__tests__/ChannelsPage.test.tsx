import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import ChannelsPage from '../ChannelsPage'

const mockGetConfig = vi.fn()

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
})
