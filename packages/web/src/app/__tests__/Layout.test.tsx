import { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import i18n, { changeLanguage } from '@/i18n'
import Layout from '../Layout'

const mockGatewayStatus = vi.fn()
const mockDetectSystem = vi.fn()
const mockCheckClawmasterRelease = vi.fn()

vi.mock('@/shared/adapters/gateway', () => ({
  getGatewayStatusResult: (...args: any[]) => mockGatewayStatus(...args),
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    detectSystem: (...args: any[]) => mockDetectSystem(...args),
  },
}))

vi.mock('@/shared/adapters/clawmasterReleases', () => ({
  checkClawmasterReleaseResult: (...args: any[]) => mockCheckClawmasterRelease(...args),
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

function SlowObserveAnchor() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handle = window.setTimeout(() => setVisible(true), 3_200)
    return () => window.clearTimeout(handle)
  }, [])

  return visible ? <div id="observe-runtime">Observe anchor</div> : null
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
    mockCheckClawmasterRelease.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '0.3.0',
        latestVersion: '0.3.0',
        hasUpdate: false,
        source: 'github',
        releases: [],
        latestRelease: null,
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

  it('shows a ClawMaster release banner and persists dismissal by release version', async () => {
    mockCheckClawmasterRelease.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '0.3.0',
        latestVersion: '0.3.1',
        hasUpdate: true,
        source: 'github',
        releases: [],
        latestRelease: null,
      },
    })
    await changeLanguage('en')

    renderLayout('/settings')

    expect(await screen.findByText('ClawMaster v0.3.1 is available.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review update' })).toHaveAttribute(
      'href',
      '/settings#settings-clawmaster-releases',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }))

    expect(localStorage.getItem('clawmaster-release-dismissed:0.3.1')).toBe('1')
    expect(screen.queryByText('ClawMaster v0.3.1 is available.')).not.toBeInTheDocument()
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

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

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

  it('does not open the command palette from focused text inputs', async () => {
    renderLayout('/settings', <input aria-label="Config input" />)

    const input = screen.getByRole('textbox', { name: 'Config input' })
    input.focus()

    fireEvent.keyDown(input, { key: 'k', code: 'KeyK', ctrlKey: true })

    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument()
  })

  it('prevents the browser shortcut when the palette search input is focused', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })
    const input = within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...')
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true })

    input.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('does not open the command palette while another modal dialog is active', async () => {
    renderLayout('/settings', (
      <div role="dialog" aria-modal="true" aria-label="Open modal">
        Existing modal
      </div>
    ))

    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)

    expect(screen.getByRole('dialog', { name: 'Open modal' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument()
    expect(event.defaultPrevented).toBe(true)
  })

  it('opens the command palette from the physical K key on non-latin layouts', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'л', code: 'KeyK', ctrlKey: true })

    expect(await screen.findByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('uses cmd+k on apple clients without stealing ctrl+k', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })

    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })
    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true })
    expect(await screen.findByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('shows section commands when the palette first opens', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

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

  it('keeps waiting for section anchors that mount after several seconds', async () => {
    renderLayout('/observe#observe-runtime', <SlowObserveAnchor />)

    expect(scrollIntoViewMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled()
    }, { timeout: 4_500 })
  }, 7_000)

  it('does not expose windows-only runtime jump before backend host detection resolves', async () => {
    mockDetectSystem.mockImplementation(() => new Promise(() => {}))
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    expect(within(dialog).queryByRole('option', { name: /设置：运行时/i })).not.toBeInTheDocument()
  })

  it('does not execute a command when enter confirms IME composition', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: 'profile' },
    })

    fireEvent.keyDown(window, { key: 'Enter', isComposing: true })

    expect(screen.getByTestId('location-spy')).toHaveTextContent('/settings')
    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  })

  it('resets the active command to the top match when the query changes', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: 'profile' },
    })

    const options = within(dialog).getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveTextContent('Profile 路径')

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('location-spy')).toHaveTextContent('/settings#settings-profile')
    })
  })

  it('executes the focused palette option when keyboard users press enter', async () => {
    renderLayout('/settings')

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: 'settings' },
    })

    const profileOption = await within(dialog).findByRole('option', { name: /设置：Profile 路径/i })
    const selectedBeforeFocus = within(dialog).getAllByRole('option').find((option) => (
      option.getAttribute('aria-selected') === 'true'
    ))

    expect(selectedBeforeFocus).toBeDefined()
    expect(selectedBeforeFocus).not.toBe(profileOption)
    fireEvent.focus(profileOption)
    expect(profileOption).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('location-spy')).toHaveTextContent('/settings#settings-profile')
    })
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

  it('ignores malformed hash fragments instead of crashing the shell', async () => {
    const originalMutationObserver = window.MutationObserver
    const observe = vi.fn()

    Object.defineProperty(window, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe = observe
        disconnect = vi.fn()
      },
    })

    renderLayout('/settings#%E0%A4%A')

    expect(await screen.findByRole('heading', { level: 2, name: '设置' })).toBeInTheDocument()
    expect(screen.getByTestId('location-spy')).toHaveTextContent('/settings#%E0%A4%A')
    expect(scrollIntoViewMock).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalledWith(document.body, { childList: true, subtree: true })

    Object.defineProperty(window, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: originalMutationObserver,
    })
  })

  it('disconnects hash observers when an anchor never appears', async () => {
    vi.useFakeTimers()

    const originalMutationObserver = window.MutationObserver
    const observe = vi.fn()
    const disconnect = vi.fn()

    Object.defineProperty(window, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe = observe
        disconnect = disconnect
      },
    })

    renderLayout('/settings#old-anchor')

    expect(observe).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(disconnect).toHaveBeenCalled()

    Object.defineProperty(window, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: originalMutationObserver,
    })
    vi.useRealTimers()
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

  it('keeps the theme action searchable with localized terms', async () => {
    renderLayout('/settings')

    fireEvent.click(await screen.findByRole('button', { name: /跳转/i }))

    const dialog = await screen.findByRole('dialog', { name: '命令面板' })

    fireEvent.change(within(dialog).getByPlaceholderText('搜索页面、区块和快捷操作...'), {
      target: { value: '主题' },
    })

    expect(await within(dialog).findByRole('option', { name: /切换到深色模式/i })).toBeInTheDocument()
  })
})
