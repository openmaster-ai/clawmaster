import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

function renderLayout(initialPath = '/settings') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Layout>
        <div>测试内容</div>
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
})
