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
  'This plugin keeps a long operational description for testing the expand and collapse behavior in the plugins table without relying on snapshots.'

const pluginRows = [
  {
    id: 'plugin.alpha',
    name: 'Alpha Plugin',
    status: 'enabled',
    version: '1.2.3',
    description: longDescription,
  },
  {
    id: 'plugin.memory',
    name: 'Memory Helper',
    status: 'disabled',
    version: '0.9.0',
    description: 'Improves memory workflows.',
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('filters loaded plugins by default, supports status switching, and searches across fields', async () => {
    renderPlugins()

    expect(await screen.findByText('插件管理')).toBeInTheDocument()
    expect(screen.getByText('Alpha Plugin')).toBeInTheDocument()
    expect(screen.queryByText('Memory Helper')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('插件状态筛选'), {
      target: { value: 'all' },
    })

    expect(await screen.findByText('Memory Helper')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('筛选名称、ID、状态或描述...'), {
      target: { value: 'memory' },
    })

    await waitFor(() => {
      expect(screen.queryByText('Alpha Plugin')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Memory Helper')).toBeInTheDocument()
  })

  it('toggles long descriptions between collapsed and expanded states', async () => {
    renderPlugins()

    await screen.findByText('Alpha Plugin')
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

    await screen.findByText('Alpha Plugin')
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

  it('passes keep-files and disable-loaded options when uninstalling an enabled plugin', async () => {
    renderPlugins()

    await screen.findByText('Alpha Plugin')
    fireEvent.click(screen.getByLabelText('卸载时保留文件'))
    fireEvent.click(screen.getByRole('button', { name: '卸载' }))

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('确定要卸载 Alpha Plugin（plugin.alpha）吗？')
    })
    expect(mockUninstallPlugin).toHaveBeenCalledWith('plugin.alpha', {
      keepFiles: true,
      disableLoadedFirst: true,
    })
  })

  it('calls setPluginEnabled and refreshes the list after disabling a loaded plugin', async () => {
    renderPlugins()

    await screen.findByText('Alpha Plugin')
    fireEvent.click(screen.getByRole('button', { name: '禁用' }))

    await waitFor(() => {
      expect(mockSetPluginEnabled).toHaveBeenCalledWith('plugin.alpha', false)
    })
    await waitFor(() => {
      expect(mockListPlugins).toHaveBeenCalledTimes(2)
    })
  })
})
