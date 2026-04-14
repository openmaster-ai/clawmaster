import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import SetupWizard from '../SetupWizard'
import {
  PADDLEOCR_DOC_SKILL_ID,
  PADDLEOCR_TEXT_SKILL_ID,
} from '@/shared/paddleocr'

const mockDetectCapabilities = vi.fn()
const mockInstallCapabilities = vi.fn()
const mockPaddleOcrGetStatus = vi.fn()
const mockPaddleOcrSetup = vi.fn()
const mockPaddleOcrPreview = vi.fn()
const mockPaddleOcrClear = vi.fn()
const mockDetectSystem = vi.fn()
const mockSaveProfile = vi.fn()
const mockClearProfile = vi.fn()
const mockSetupAdapter = {
  detectCapabilities: (...args: any[]) => mockDetectCapabilities(...args),
  installCapabilities: (...args: any[]) => mockInstallCapabilities(...args),
  paddleocr: {
    getStatus: (...args: any[]) => mockPaddleOcrGetStatus(...args),
    setup: (...args: any[]) => mockPaddleOcrSetup(...args),
    preview: (...args: any[]) => mockPaddleOcrPreview(...args),
    clear: (...args: any[]) => mockPaddleOcrClear(...args),
  },
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
    let paddleOcrTextConfigured = false
    let paddleOcrDocConfigured = false
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
    mockPaddleOcrGetStatus.mockImplementation(async () => ({
      configured: paddleOcrTextConfigured && paddleOcrDocConfigured,
      enabledModules: [
        ...(paddleOcrTextConfigured ? [PADDLEOCR_TEXT_SKILL_ID] : []),
        ...(paddleOcrDocConfigured ? [PADDLEOCR_DOC_SKILL_ID] : []),
      ],
      missingModules: [],
      textRecognition: {
        configured: paddleOcrTextConfigured,
        enabled: paddleOcrTextConfigured,
        missing: false,
        apiUrlConfigured: paddleOcrTextConfigured,
        accessTokenConfigured: paddleOcrTextConfigured,
        apiUrl: paddleOcrTextConfigured ? 'https://demo.paddleocr.com/ocr' : undefined,
      },
      docParsing: {
        configured: paddleOcrDocConfigured,
        enabled: paddleOcrDocConfigured,
        missing: false,
        apiUrlConfigured: paddleOcrDocConfigured,
        accessTokenConfigured: paddleOcrDocConfigured,
        apiUrl: paddleOcrDocConfigured ? 'https://demo.paddleocr.com/layout-parsing' : undefined,
      },
    }))
    mockPaddleOcrSetup.mockImplementation(async (input: { moduleId: string }) => {
      if (input.moduleId === PADDLEOCR_TEXT_SKILL_ID) {
        paddleOcrTextConfigured = true
      }
      if (input.moduleId === PADDLEOCR_DOC_SKILL_ID) {
        paddleOcrDocConfigured = true
      }
      return {
        configured: paddleOcrTextConfigured && paddleOcrDocConfigured,
        enabledModules: [
          ...(paddleOcrTextConfigured ? [PADDLEOCR_TEXT_SKILL_ID] : []),
          ...(paddleOcrDocConfigured ? [PADDLEOCR_DOC_SKILL_ID] : []),
        ],
        missingModules: [],
        textRecognition: {
          configured: paddleOcrTextConfigured,
          enabled: paddleOcrTextConfigured,
          missing: false,
          apiUrlConfigured: paddleOcrTextConfigured,
          accessTokenConfigured: paddleOcrTextConfigured,
          apiUrl: paddleOcrTextConfigured ? 'https://demo.paddleocr.com/ocr' : undefined,
        },
        docParsing: {
          configured: paddleOcrDocConfigured,
          enabled: paddleOcrDocConfigured,
          missing: false,
          apiUrlConfigured: paddleOcrDocConfigured,
          accessTokenConfigured: paddleOcrDocConfigured,
          apiUrl: paddleOcrDocConfigured ? 'https://demo.paddleocr.com/layout-parsing' : undefined,
        },
      }
    })
    mockPaddleOcrPreview.mockImplementation(
      async (input: { moduleId: string; apiUrl: string }) => ({
        moduleId: input.moduleId,
        apiUrl: input.apiUrl,
        latencyMs: input.moduleId === PADDLEOCR_TEXT_SKILL_ID ? 123 : 240,
        pageCount: 1,
        textLineCount: input.moduleId === PADDLEOCR_TEXT_SKILL_ID ? 4 : 3,
        extractedText:
          input.moduleId === PADDLEOCR_TEXT_SKILL_ID
            ? 'ClawMaster PaddleOCR Preview\nOrder #A-1024\nTotal: 42.80 USD\nShip to: Shanghai'
            : '# ClawMaster PaddleOCR Preview\n\n- Order: A-1024\n- Total: 42.80 USD',
        responsePreview: '{"ok":true}',
      }),
    )
    mockPaddleOcrClear.mockImplementation(async (input: { moduleId: string }) => {
      if (input.moduleId === PADDLEOCR_TEXT_SKILL_ID) {
        paddleOcrTextConfigured = false
      }
      if (input.moduleId === PADDLEOCR_DOC_SKILL_ID) {
        paddleOcrDocConfigured = false
      }
      return {
        configured: paddleOcrTextConfigured && paddleOcrDocConfigured,
        enabledModules: [
          ...(paddleOcrTextConfigured ? [PADDLEOCR_TEXT_SKILL_ID] : []),
          ...(paddleOcrDocConfigured ? [PADDLEOCR_DOC_SKILL_ID] : []),
        ],
        missingModules: [],
        textRecognition: {
          configured: paddleOcrTextConfigured,
          enabled: paddleOcrTextConfigured,
          missing: false,
          apiUrlConfigured: paddleOcrTextConfigured,
          accessTokenConfigured: paddleOcrTextConfigured,
          apiUrl: paddleOcrTextConfigured ? 'https://demo.paddleocr.com/ocr' : undefined,
        },
        docParsing: {
          configured: paddleOcrDocConfigured,
          enabled: paddleOcrDocConfigured,
          missing: false,
          apiUrlConfigured: paddleOcrDocConfigured,
          accessTokenConfigured: paddleOcrDocConfigured,
          apiUrl: paddleOcrDocConfigured ? 'https://demo.paddleocr.com/layout-parsing' : undefined,
        },
      }
    })
    mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
      const results = [
        { id: 'engine', name: 'capability.engine', status: 'installed', version: '2026.4.0' },
        { id: 'memory', name: 'capability.memory', status: 'installed', version: '0.2.0' },
        { id: 'observe', name: 'capability.observe', status: 'not_installed' },
        {
          id: 'ocr_text',
          name: 'capability.ocrText',
          status: paddleOcrTextConfigured ? 'ready' : 'needs_setup',
        },
        {
          id: 'ocr_doc',
          name: 'capability.ocrDoc',
          status: paddleOcrDocConfigured ? 'ready' : 'needs_setup',
        },
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

  it('re-runs detection after installing the core engine so setup can continue', async () => {
    let engineInstalled = false
    mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
      const results = [
        {
          id: 'engine',
          name: 'capability.engine',
          status: engineInstalled ? 'installed' : 'not_installed',
          version: engineInstalled ? '2026.4.0' : undefined,
        },
        { id: 'memory', name: 'capability.memory', status: 'not_installed' },
        { id: 'observe', name: 'capability.observe', status: 'not_installed' },
        { id: 'ocr_text', name: 'capability.ocrText', status: 'needs_setup' },
        { id: 'ocr_doc', name: 'capability.ocrDoc', status: 'needs_setup' },
        { id: 'agent', name: 'capability.agent', status: 'installed', version: '0.1.0' },
      ]
      for (const item of results) {
        onUpdate(item)
      }
      return results
    })
    mockInstallCapabilities.mockImplementation(async (ids: string[], onProgress: (progress: any) => void) => {
      engineInstalled = ids.includes('engine')
      for (const id of ids) {
        onProgress({ id, status: 'done', progress: 100 })
      }
    })

    render(<SetupWizard onComplete={() => {}} />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Install Core Engine' }))[0]!)

    await waitFor(() => {
      expect(mockDetectCapabilities).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByRole('button', { name: 'Start Configuration' })).toBeInTheDocument()
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
        { id: 'ocr_text', name: 'capability.ocrText', status: 'needs_setup' },
        { id: 'ocr_doc', name: 'capability.ocrDoc', status: 'needs_setup' },
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

  it('waits for Ollama model pulls to finish before refreshing status', async () => {
    const { getOllamaStatus, pullModel } = await import('@/shared/adapters/ollama')

    vi.mocked(getOllamaStatus).mockResolvedValue({
      success: true,
      data: {
        installed: true,
        version: '0.9.0',
        running: true,
        models: [],
      },
      error: null,
    })

    let resolvePull: (() => void) | undefined
    vi.mocked(pullModel).mockImplementation(() => new Promise((resolve) => {
      resolvePull = () => resolve({
        success: true,
        data: 'pulled',
        error: null,
      })
    }))

    render(<SetupWizard onComplete={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Start Configuration' }))
    fireEvent.click(await screen.findByRole('button', { name: /Ollama/i }))
    expect(await screen.findByText('Ollama Running')).toBeInTheDocument()

    vi.mocked(getOllamaStatus).mockClear()

    fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }))

    await waitFor(() => {
      expect(pullModel).toHaveBeenCalledWith('llama3.2')
    })
    expect(getOllamaStatus).not.toHaveBeenCalled()

    resolvePull?.()

    await waitFor(() => {
      expect(getOllamaStatus).toHaveBeenCalledTimes(1)
    })
  })

  it('opens the shared PaddleOCR setup dialog and keeps submit disabled until the endpoint and token state are valid', async () => {
    render(<SetupWizard onComplete={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /Configure PP-OCRv5/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    const submitButton = screen.getByRole('button', { name: 'Save & verify' })
    expect(submitButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('API endpoint'), {
      target: { value: 'https://demo.paddleocr.com/ocr' },
    })
    expect(submitButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('API Key / Access Token'), {
      target: { value: 'tok_test_1234567890' },
    })
    expect(submitButton).not.toBeDisabled()
  })

  it('keeps PaddleOCR modules separate and shows a sample preview after saving one module', async () => {
    const { unmount } = render(<SetupWizard onComplete={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /Configure PP-OCRv5/ }))
    fireEvent.change(screen.getByLabelText('API endpoint'), {
      target: { value: 'https://demo.paddleocr.com/ocr' },
    })
    fireEvent.change(screen.getByLabelText('API Key / Access Token'), {
      target: { value: 'tok_test_1234567890' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save & verify' }))

    await waitFor(() => {
      expect(mockPaddleOcrSetup).toHaveBeenCalledWith({
        moduleId: PADDLEOCR_TEXT_SKILL_ID,
        apiUrl: 'https://demo.paddleocr.com/ocr',
        accessToken: 'tok_test_1234567890',
      })
    })
    expect(await screen.findByText('Sample preview')).toBeInTheDocument()
    expect(await screen.findByText(/ClawMaster PaddleOCR Preview/)).toBeInTheDocument()
    expect(mockPaddleOcrPreview).toHaveBeenCalledWith({
      moduleId: PADDLEOCR_TEXT_SKILL_ID,
      apiUrl: 'https://demo.paddleocr.com/ocr',
      accessToken: 'tok_test_1234567890',
    })
    expect(await screen.findByRole('button', { name: 'Update setup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Configure PP-StructureV3/ })).toBeInTheDocument()

    unmount()
    render(<SetupWizard onComplete={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update setup' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Configure PP-StructureV3/ })).toBeInTheDocument()
    })
  })

  it('can clear the saved PaddleOCR module configuration from the dialog', async () => {
    render(<SetupWizard onComplete={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: /Configure PP-OCRv5/ }))
    fireEvent.change(screen.getByLabelText('API endpoint'), {
      target: { value: 'https://demo.paddleocr.com/ocr' },
    })
    fireEvent.change(screen.getByLabelText('API Key / Access Token'), {
      target: { value: 'tok_test_1234567890' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save & verify' }))
    await screen.findByRole('button', { name: 'Disable & clear credentials' })

    fireEvent.click(screen.getByRole('button', { name: 'Disable & clear credentials' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear module' }))

    await waitFor(() => {
      expect(mockPaddleOcrClear).toHaveBeenCalledWith({
        moduleId: PADDLEOCR_TEXT_SKILL_ID,
      })
    })
    expect(await screen.findByRole('button', { name: /Configure PP-OCRv5/ })).toBeInTheDocument()
  })
})
