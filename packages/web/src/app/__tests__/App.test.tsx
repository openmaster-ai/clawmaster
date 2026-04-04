import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

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

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the setup wizard before the app is marked ready', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
  })

  it('persists the ready state when setup completes', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

    expect(localStorage.getItem('clawmaster-app-ready')).toBe('1')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('bypasses the setup wizard when readiness was already persisted', () => {
    localStorage.setItem('clawmaster-app-ready', '1')

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Finish setup' })).not.toBeInTheDocument()
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })
})
