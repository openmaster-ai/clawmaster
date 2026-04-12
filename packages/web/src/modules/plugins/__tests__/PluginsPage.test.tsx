import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import PluginsPage from '../PluginsPage'

const mockListPlugins = vi.fn()
const mockSetPluginEnabled = vi.fn()
const mockInstallPlugin = vi.fn()
const mockUninstallPlugin = vi.fn()

vi.mock('@/adapters', () => ({
  platformResults: {
    listPlugins: (...args: any[]) => mockListPlugins(...args),
    setPluginEnabled: (...args: any[]) => mockSetPluginEnabled(...args),
    installPlugin: (...args: any[]) => mockInstallPlugin(...args),
    uninstallPlugin: (...args: any[]) => mockUninstallPlugin(...args),
  },
}))

const longDescription =
  'This provider keeps a long operational description for testing the expand and collapse behavior in the plugins inventory without relying on snapshots.'

const pluginRows = [
  {
    id: 'deepseek',
    name: 'DeepSeek Provider',
    status: 'loaded',
    version: '1.2.3',
    description: longDescription,
  },
  {
    id: 'discord',
    name: 'Discord Relay',
    status: 'disabled',
    version: '0.9.0',
    description: 'OpenClaw Discord channel plugin',
  },
  {
    id: 'browser',
    name: 'Browser Tool',
    status: 'loaded',
    version: '2.0.0',
    description: 'OpenClaw browser tool plugin',
  },
]

function renderPlugins() {
  return render(
    <MemoryRouter>
      <PluginsPage />
    </MemoryRouter>,
  )
}

describe('PluginsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await changeLanguage('zh')
    mockListPlugins.mockResolvedValue({
      success: true,
      data: {
        plugins: pluginRows,
        rawCliOutput: null,
      },
    })
    mockSetPluginEnabled.mockResolvedValue({ success: true })
    mockInstallPlugin.mockResolvedValue({ success: true })
    mockUninstallPlugin.mockResolvedValue({ success: true })
  })

  it('shows runtime metrics, keeps loaded plugins visible by default, and supports status and category filters', async () => {
    renderPlugins()

    expect(await screen.findByText('插件管理')).toBeInTheDocument()
    expect(screen.getByText('当前运行中的插件')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DeepSeek Provider' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Browser Tool' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Discord Relay' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('插件状态筛选'), {
      target: { value: 'all' },
    })

    expect(await screen.findByRole('heading', { name: 'Discord Relay' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '消息通道 (1)' }))
    expect(screen.getByRole('heading', { name: 'Discord Relay' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'DeepSeek Provider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Browser Tool' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '全部分组' }))
    fireEvent.change(screen.getByPlaceholderText('筛选名称、ID、状态或描述...'), {
      target: { value: 'browser' },
    })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'DeepSeek Provider' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Browser Tool' })).toBeInTheDocument()
  })

  it('toggles long descriptions between collapsed and expanded states', async () => {
    renderPlugins()

    await screen.findByRole('heading', { name: 'DeepSeek Provider' })
    const description = screen.getByText(longDescription)

    expect(description).toHaveClass('line-clamp-2')
    fireEvent.click(screen.getByRole('button', { name: '展开' }))
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
    expect(description).not.toHaveClass('line-clamp-2')

    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.getByRole('button', { name: '展开' })).toBeInTheDocument()
    expect(description).toHaveClass('line-clamp-2')
  })

  it('validates install input and calls install with a trimmed plugin id', async () => {
    renderPlugins()

    await screen.findByRole('heading', { name: 'DeepSeek Provider' })
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请输入插件 ID')

    fireEvent.change(screen.getByPlaceholderText('输入插件 ID'), {
      target: { value: '  plugin.new  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '安装' }))

    await waitFor(() => {
      expect(mockInstallPlugin).toHaveBeenCalledWith('plugin.new')
    })
    await waitFor(() => {
      expect(mockListPlugins).toHaveBeenCalledTimes(2)
    })
  })

  it('passes keep-files and disable-loaded options when uninstalling a loaded plugin', async () => {
    renderPlugins()

    await screen.findByRole('heading', { name: 'DeepSeek Provider' })
    fireEvent.click(screen.getByLabelText('卸载时保留文件'))
    fireEvent.click(screen.getByRole('button', { name: '卸载 DeepSeek Provider' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('确定要卸载 DeepSeek Provider（deepseek）吗？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(mockUninstallPlugin).toHaveBeenCalledWith('deepseek', {
        keepFiles: true,
        disableLoadedFirst: true,
      })
    })
  })

  it('calls setPluginEnabled and refreshes the list after disabling a loaded plugin', async () => {
    renderPlugins()

    await screen.findByRole('heading', { name: 'DeepSeek Provider' })
    fireEvent.click(screen.getByRole('button', { name: '禁用 DeepSeek Provider' }))

    await waitFor(() => {
      expect(mockSetPluginEnabled).toHaveBeenCalledWith('deepseek', false)
    })
    await waitFor(() => {
      expect(mockListPlugins).toHaveBeenCalledTimes(2)
    })
  })
})
