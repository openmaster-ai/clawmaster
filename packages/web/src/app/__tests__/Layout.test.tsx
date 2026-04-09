import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import i18n, { changeLanguage } from '@/i18n'
import Layout from '../Layout'

const mockGatewayStatus = vi.fn()
const mockDetectSystem = vi.fn()
const mockListVersions = vi.fn()

vi.mock('@/shared/adapters/gateway', () => ({
  getGatewayStatusResult: (...args: any[]) => mockGatewayStatus(...args),
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    detectSystem: (...args: any[]) => mockDetectSystem(...args),
    listOpenclawNpmVersions: (...args: any[]) => mockListVersions(...args),
  },
}))

const scrollIntoViewMock = vi.fn()

function LocationSpy() {
  const location = useLocation()
  return <div data-testid="location-spy">{`${location.pathname}${location.hash}`}</div>
}

function DelayedProfileAnchor() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 250)
    return () => window.clearTimeout(handle)
  }, [])

  return visible ? <div id="settings-profile">Profile anchor</div> : null
}

function renderLayout(initialPath = '/settings', children?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Layout>
        <LocationSpy />
        {children ?? (
          <>
            <div id="settings-profile">Profile anchor</div>
            <div id="gateway-runtime">Gateway anchor</div>
            <div>测试内容</div>
          </>
        )}
      </Layout>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    })
    await changeLanguage('zh')
    mockGatewayStatus.mockResolvedValue({
      success: true,
      data: { running: true, port: 8787 },
    })
    mockDetectSystem.mockResolvedValue({
      success: true,
      data: {
        nodejs: { installed: true, version: 'v22.13.0' },
        npm: { installed: true, version: '11.12.1' },
        openclaw: { installed: true, version: '2026.4.2 (d74a122)', configPath: '/tmp/openclaw.json' },
        runtime: { mode: 'native', hostPlatform: 'windows' },
      },
    })
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.2', '2026.4.1'],
        distTags: { latest: '2026.4.2' },
      },
    })
  })

  it('renders navigation groups, current page title, and footer status', async () => {
    renderLayout('/settings')

    expect(await screen.findByRole('heading', { level: 2, name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /跳转\s*Ctrl K/i })).toBeInTheDocument()
    expect(screen.getAllByText('运行').length).toBeGreaterThan(0)
    expect(screen.getAllByText('工作区').length).toBeGreaterThan(0)
    expect(screen.getAllByText('扩展').length).toBeGreaterThan(0)
    expect(screen.getAllByText('系统').length).toBeGreaterThan(0)
    expect(screen.getByText('概览')).toBeInTheDocument()
    expect(screen.getByText('网关')).toBeInTheDocument()
    expect(screen.getByText('测试内容')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('Gateway 运行中').length).toBeGreaterThan(0)
    })
    expect(screen.getByText(':8787')).toBeInTheDocument()
  })

  it('shows and persists dismissal of the command shortcut hint', async () => {
    renderLayout('/settings')

    expect(await screen.findByText('用 Ctrl K 快速跳转')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '知道了' }))

    expect(screen.queryByText('用 Ctrl K 快速跳转')).not.toBeInTheDocument()
    expect(localStorage.getItem('clawmaster-command-palette-hint-dismissed')).toBe('1')
  })

  it('toggles dark mode and switches language from the header controls', async () => {
    renderLayout('/settings')

    const themeButton = await screen.findByTitle('切换到深色模式')
    fireEvent.click(themeButton)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('clawmaster-theme')).toBe('dark')

    fireEvent.change(screen.getByDisplayValue('中文'), { target: { value: 'en' } })

    await waitFor(() => {
      expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
    })
    expect(i18n.language).toBe('en')
    expect(localStorage.getItem('clawmaster-language')).toBe('en')
  })

  it('polls gateway status every 30 seconds', async () => {
    vi.useFakeTimers()
    mockGatewayStatus.mockResolvedValue({
      success: true,
      data: { running: false, port: 0 },
    })

    renderLayout('/')

    await Promise.resolve()
    await Promise.resolve()
    expect(mockGatewayStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)

    expect(mockGatewayStatus).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('Gateway 已停止').length).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('opens the command palette with the keyboard and jumps to a page section', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })
    expect(dialog).toBeInTheDocument()

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: 'profile' },
    })

    fireEvent.click(await within(dialog).findByRole('option', { name: /Profile 路径/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location-spy')).toHaveTextContent('/settings#settings-profile')
      expect(scrollIntoViewMock).toHaveBeenCalled()
    })
  })

  it('shows section commands when the palette first opens', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    expect(within(dialog).getByRole('option', { name: /设置：Profile 路径/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: /概览/i })).toBeInTheDocument()
  })

  it('keeps retrying hash jumps until delayed content mounts', async () => {
    renderLayout('/settings#settings-profile', <DelayedProfileAnchor />)

    expect(scrollIntoViewMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled()
    }, { timeout: 1000 })
  })

  it('does not expose windows-only runtime jump before backend host detection resolves', async () => {
    mockDetectSystem.mockImplementation(() => new Promise(() => {}))
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    expect(within(dialog).queryByRole('option', { name: /设置：运行时/i })).not.toBeInTheDocument()
  })

  it('does not execute a command when enter confirms IME composition', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: 'profile' },
    })

    fireEvent.keyDown(window, { key: 'Enter', isComposing: true })

    expect(screen.getByTestId('location-spy')).toHaveTextContent('/settings')
    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('does not move palette selection when arrow keys are used during IME composition', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })
    const initialOption = within(dialog).getAllByRole('option').find((option) => (
      option.getAttribute('aria-selected') === 'true'
    ))

    expect(initialOption).toBeDefined()

    fireEvent.keyDown(window, { key: 'ArrowDown', isComposing: true })

    expect(initialOption).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('runs quick actions from the command palette', async () => {
    renderLayout('/settings')

    fireEvent.click(await screen.findByRole('button', { name: /跳转/i }))

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: 'theme' },
    })

    fireEvent.click(await within(dialog).findByRole('option', { name: /切换到深色模式/i }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument()
    })
  })
})
