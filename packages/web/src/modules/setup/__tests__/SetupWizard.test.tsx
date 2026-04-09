import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import SetupWizard from '../SetupWizard'

const mockDetectCapabilities = vi.fn()
const mockInstallCapabilities = vi.fn()
const mockDetectSystem = vi.fn()
const mockSaveProfile = vi.fn()
const mockClearProfile = vi.fn()
const mockSetupAdapter = {
  detectCapabilities: (...args: any[]) => mockDetectCapabilities(...args),
  installCapabilities: (...args: any[]) => mockInstallCapabilities(...args),
  onboarding: {
    initConfig: vi.fn(),
    testApiKey: vi.fn(),
    setApiKey: vi.fn(),
    setDefaultModel: vi.fn(),
    startGateway: vi.fn(),
    checkGateway: vi.fn(),
    addChannel: vi.fn(),
    loginChannel: vi.fn(),
    installPlugin: vi.fn(),
  },
}

vi.mock('../adapters', () => ({
  getSetupAdapter: () => mockSetupAdapter,
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    detectSystem: (...args: any[]) => mockDetectSystem(...args),
    saveOpenclawProfile: (...args: any[]) => mockSaveProfile(...args),
    clearOpenclawProfile: (...args: any[]) => mockClearProfile(...args),
  },
}))

vi.mock('@/shared/adapters/ollama', () => ({
  getOllamaStatus: vi.fn(),
  installOllama: vi.fn(),
  startOllama: vi.fn(),
  pullModel: vi.fn(),
  formatModelSize: vi.fn(() => ''),
}))

describe('SetupWizard', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockDetectSystem.mockResolvedValue({
      success: true,
      data: {
        nodejs: { installed: true, version: '20.0.0' },
        npm: { installed: true, version: '10.0.0' },
        openclaw: {
          installed: false,
          version: '',
          configPath: '/home/.openclaw/openclaw.json',
          dataDir: '/home/.openclaw',
          profileMode: 'default',
          profileName: null,
          overrideActive: false,
          configPathCandidates: ['/home/.openclaw/openclaw.json'],
          existingConfigPaths: [],
        },
        runtime: {
          mode: 'native',
          hostPlatform: 'darwin',
          wslAvailable: false,
          selectedDistro: null,
          selectedDistroExists: null,
          distros: [],
        },
      },
      error: null,
    })
    mockSaveProfile.mockResolvedValue({ success: true, data: undefined, error: null })
    mockClearProfile.mockResolvedValue({ success: true, data: undefined, error: null })
    mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
      const results = [
        { id: 'engine', name: 'capability.engine', status: 'installed', version: '2026.4.0' },
        { id: 'memory', name: 'capability.memory', status: 'installed', version: '0.2.0' },
        { id: 'observe', name: 'capability.observe', status: 'not_installed' },
        { id: 'ocr', name: 'capability.ocr', status: 'installed', version: '1.0.0' },
        { id: 'agent', name: 'capability.agent', status: 'installed', version: '0.1.0' },
      ]
      for (const item of results) {
        onUpdate(item)
      }
      return results
    })
    mockInstallCapabilities.mockImplementation(async (ids: string[], onProgress: (progress: any) => void) => {
      for (const id of ids) {
        onProgress({ id, status: 'done', progress: 100 })
      }
    })
  })

  it('offers optional observability installation from the wizard when core setup is already ready', async () => {
    render(<SetupWizard onComplete={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /Install Observability/ }))

    await waitFor(() => {
      expect(mockInstallCapabilities).toHaveBeenCalledTimes(1)
    })
    expect(mockInstallCapabilities.mock.calls[0]?.[0]).toEqual(['observe'])
  })

  it('becomes actionable after required checks finish even while optional checks are still pending', async () => {
    let releaseOptionalChecks: (() => void) | undefined

    mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
      const engine = { id: 'engine', name: 'capability.engine', status: 'installed', version: '2026.4.0' }
      onUpdate(engine)
      await new Promise<void>((resolve) => {
        releaseOptionalChecks = resolve
      })

      const rest = [
        { id: 'memory', name: 'capability.memory', status: 'not_installed' },
        { id: 'observe', name: 'capability.observe', status: 'not_installed' },
        { id: 'ocr', name: 'capability.ocr', status: 'installed', version: '1.0.0' },
        { id: 'agent', name: 'capability.agent', status: 'installed', version: '0.1.0' },
      ]
      for (const item of rest) onUpdate(item)
      return [engine, ...rest]
    })

    render(<SetupWizard onComplete={() => {}} />)

    expect(await screen.findByRole('button', { name: 'Start Configuration' })).toBeInTheDocument()

    releaseOptionalChecks?.()
  })

  it('shows the profile fallback card and saves a named profile', async () => {
    render(<SetupWizard onComplete={() => {}} />)

    expect(await screen.findByText('OpenClaw profile')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Named' }))
    fireEvent.change(screen.getByPlaceholderText('team-a'), { target: { value: 'workspace-a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply profile' }))

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        {
          kind: 'named',
          name: 'workspace-a',
        },
        {
          mode: 'empty',
          sourcePath: undefined,
        },
      )
    })
  })

  it('can seed a named profile from the current config in the wizard', async () => {
    render(<SetupWizard onComplete={() => {}} />)

    expect(await screen.findByText('OpenClaw profile')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Named' }))
    fireEvent.change(screen.getByPlaceholderText('team-a'), { target: { value: 'workspace-seeded' } })
    fireEvent.click(screen.getByRole('button', { name: /Clone current config/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply profile' }))

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        {
          kind: 'named',
          name: 'workspace-seeded',
        },
        {
          mode: 'clone-current',
          sourcePath: undefined,
        },
      )
    })
  })

  it('shows WSL runtime guidance on Windows when OpenClaw is only available through WSL2', async () => {
    mockDetectSystem.mockResolvedValueOnce({
      success: true,
      data: {
        nodejs: { installed: true, version: '20.0.0' },
        npm: { installed: true, version: '10.0.0' },
        openclaw: {
          installed: false,
          version: '',
          configPath: '/home/.openclaw/openclaw.json',
          dataDir: '/home/.openclaw',
          profileMode: 'default',
          profileName: null,
          overrideActive: false,
          configPathCandidates: ['/home/.openclaw/openclaw.json'],
          existingConfigPaths: [],
        },
        runtime: {
          mode: 'native',
          hostPlatform: 'windows',
          wslAvailable: true,
          selectedDistro: 'Ubuntu-24.04',
          selectedDistroExists: true,
          distros: [{ name: 'Ubuntu-24.04', state: 'Running', version: 2, isDefault: true }],
        },
      },
      error: null,
    })

    render(<SetupWizard onComplete={() => {}} />)

    expect(await screen.findByText(/switch the runtime in Settings/i)).toBeInTheDocument()
  })
})
