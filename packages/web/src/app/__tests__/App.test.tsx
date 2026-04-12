import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

const mockDetectSystem = vi.fn()
const mockGetConfig = vi.fn()

vi.mock('../Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout-shell">{children}</div>,
}))

vi.mock('../providers', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../moduleRegistry', () => ({
  getClawModules: () => [
    {
      id: 'dashboard',
      route: {
        path: '/',
        LazyPage: () => <div>Dashboard page</div>,
      },
    },
  ],
}))

vi.mock('@/modules/setup', () => ({
  SetupWizard: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Finish setup
    </button>
  ),
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    detectSystem: (...args: any[]) => mockDetectSystem(...args),
    getConfig: (...args: any[]) => mockGetConfig(...args),
  },
}))

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    mockDetectSystem.mockResolvedValue({
      success: true,
      data: {
        nodejs: { installed: true, version: '22.0.0' },
        npm: { installed: true, version: '11.0.0' },
        openclaw: {
          installed: false,
          version: '',
          configPath: '/Users/test/.openclaw/openclaw.json',
          existingConfigPaths: [],
        },
      },
    })
    mockGetConfig.mockResolvedValue({
      success: true,
      data: {},
    })
  })

  it('shows the setup wizard when no usable environment is detected', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
  })

  it('persists the ready hint when setup completes', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Finish setup' }))

    expect(localStorage.getItem('clawmaster-app-ready')).toBe('1')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('bypasses the setup wizard when a usable environment already exists', async () => {
    mockDetectSystem.mockResolvedValue({
      success: true,
      data: {
        nodejs: { installed: true, version: '22.0.0' },
        npm: { installed: true, version: '11.0.0' },
        openclaw: {
          installed: true,
          version: '2026.4.7',
          configPath: '/Users/test/.openclaw/openclaw.json',
          existingConfigPaths: ['/Users/test/.openclaw/openclaw.json'],
        },
      },
    })
    mockGetConfig.mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {
            siliconflow: {
              apiKey: 'sk-test',
              models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' }],
            },
          },
        },
      },
    })

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Finish setup' })).not.toBeInTheDocument()
      expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    })
  })

  it('ignores a stale localStorage ready flag when the environment is still empty', async () => {
    localStorage.setItem('clawmaster-app-ready', '1')

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
  })

  it('still bypasses setup for demo routes', async () => {
    window.history.replaceState({}, '', '/?demo=skip')

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Finish setup' })).not.toBeInTheDocument()
      expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    })
  })
})
