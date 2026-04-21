import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import SetupWizard from '../SetupWizard'

const mockDetectCapabilities = vi.fn()
const mockInstallCapabilities = vi.fn()
const mockGetProviderModelCatalogResult = vi.fn()
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

vi.mock('@/shared/adapters/openclaw', () => ({
  getProviderModelCatalogResult: (...args: any[]) => mockGetProviderModelCatalogResult(...args),
}))

vi.mock('@/shared/adapters/ollama', () => ({
  getOllamaStatus: vi.fn(),
  installOllama: vi.fn(),
  startOllama: vi.fn(),
  pullModel: vi.fn(),
  formatModelSize: vi.fn(() => ''),
}))

function engineInstalled() {
  return [
    { id: 'engine', name: 'capability.engine', status: 'installed', version: '2026.4.0' },
    { id: 'memory', name: 'capability.memory', status: 'installed', version: '0.2.0' },
    { id: 'observe', name: 'capability.observe', status: 'not_installed' },
    { id: 'ocr', name: 'capability.ocr', status: 'installed', version: '1.0.0' },
    { id: 'agent', name: 'capability.agent', status: 'installed', version: '0.1.0' },
  ]
}

function engineMissing() {
  return [
    { id: 'engine', name: 'capability.engine', status: 'not_installed' },
    { id: 'memory', name: 'capability.memory', status: 'not_installed' },
    { id: 'observe', name: 'capability.observe', status: 'not_installed' },
    { id: 'ocr', name: 'capability.ocr', status: 'not_installed' },
    { id: 'agent', name: 'capability.agent', status: 'not_installed' },
  ]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('SetupWizard', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await changeLanguage('en')
    mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
      const results = engineInstalled()
      for (const item of results) onUpdate(item)
      return results
    })
    mockInstallCapabilities.mockImplementation(async (ids: string[], onProgress: (progress: any) => void) => {
      for (const id of ids) {
        onProgress({ id, status: 'done', progress: 100 })
      }
    })
    mockSetupAdapter.onboarding.initConfig.mockResolvedValue(undefined)
    mockSetupAdapter.onboarding.testApiKey.mockResolvedValue(true)
    mockSetupAdapter.onboarding.setApiKey.mockResolvedValue(undefined)
    mockSetupAdapter.onboarding.setDefaultModel.mockResolvedValue(undefined)
    mockGetProviderModelCatalogResult.mockResolvedValue({
      success: false,
      data: undefined,
      error: 'catalog unavailable',
    })
  })

  // ──────────────────────────────────────────────────────
  // Step 1: Engine detection
  // ──────────────────────────────────────────────────────

  describe('Step 1: Engine detection', () => {
    it('shows brand title and slogan during detection', async () => {
      let hold: (() => void) | undefined
      mockDetectCapabilities.mockImplementation(() => new Promise<any[]>((resolve) => {
        hold = () => resolve(engineInstalled())
      }))

      render(<SetupWizard onComplete={() => {}} />)

      expect(screen.getByText('ClawMaster')).toBeInTheDocument()
      expect(screen.getByText(/hexagonal warrior/i)).toBeInTheDocument()
      expect(screen.getByText('OpenClaw Engine')).toBeInTheDocument()
      expect(screen.getAllByText(/Detecting system capabilities/i).length).toBeGreaterThanOrEqual(1)

      hold?.()
    })

    it('auto-detects engine and advances to provider step without initializing config yet', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()
      expect(mockSetupAdapter.onboarding.initConfig).not.toHaveBeenCalled()
    })

    it('shows install button and mirror toggle when engine is not installed', async () => {
      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })

      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByRole('button', { name: /Install Core Engine/i })).toBeInTheDocument()
      expect(screen.getByText(/Core engine not installed/i)).toBeInTheDocument()
      expect(screen.getByText(/Use China npm mirror/i)).toBeInTheDocument()
    })

    it('falls back to not_installed when detection throws', async () => {
      mockDetectCapabilities.mockRejectedValue(new Error('network error'))

      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByRole('button', { name: /Install Core Engine/i })).toBeInTheDocument()
    })

    it('shows language switcher', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      const group = await screen.findByRole('radiogroup', { name: /language/i })
      expect(group).toBeInTheDocument()
      expect(within(group).getByRole('radio', { name: 'EN' })).toBeInTheDocument()
      expect(within(group).getByRole('radio', { name: '中文' })).toBeInTheDocument()
      expect(within(group).getByRole('radio', { name: '日本語' })).toBeInTheDocument()
    })
  })

  // ──────────────────────────────────────────────────────
  // Step 1b: Engine installation
  // ──────────────────────────────────────────────────────

  describe('Step 1b: Engine installation', () => {
    beforeEach(() => {
      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })
    })

    it('installs engine and proceeds to provider step', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))

      await waitFor(() => {
        expect(mockInstallCapabilities).toHaveBeenCalledWith(['engine'], expect.any(Function), undefined)
      })

      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()
    })

    it('passes China mirror registry when mirror toggle is checked', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByRole('button', { name: /Install Core Engine/i })

      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)
      expect(checkbox).toBeChecked()

      fireEvent.click(screen.getByRole('button', { name: /Install Core Engine/i }))

      await waitFor(() => {
        expect(mockInstallCapabilities).toHaveBeenCalledWith(
          ['engine'],
          expect.any(Function),
          { registryUrl: 'https://registry.npmmirror.com' },
        )
      })
    })

    it('shows error and retry button when installation fails', async () => {
      mockInstallCapabilities.mockRejectedValue(new Error('ENOMEM'))

      render(<SetupWizard onComplete={() => {}} />)

      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))

      expect(await screen.findByText('ENOMEM')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
      expect(screen.getByText(/Use China npm mirror/i)).toBeInTheDocument()
    })

    it('retries installation after failure', async () => {
      mockInstallCapabilities
        .mockRejectedValueOnce(new Error('timeout'))
        .mockImplementation(async (_ids: string[], onProgress: (p: any) => void) => {
          onProgress({ id: 'engine', status: 'done', progress: 100 })
        })

      render(<SetupWizard onComplete={() => {}} />)

      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))
      expect(await screen.findByText('timeout')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()
    })

    it('reaches the provider step after install without initializing config yet', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))

      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()
      expect(mockSetupAdapter.onboarding.initConfig).not.toHaveBeenCalled()
    })
  })

  // ──────────────────────────────────────────────────────
  // Step 2: Provider selection
  // ──────────────────────────────────────────────────────

  describe('Step 2: Provider selection', () => {
    it('shows golden sponsor badge for ERNIE', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')
      expect(screen.getByText('ERNIE LLM API')).toBeInTheDocument()
    })

    it('shows step pills with OpenClaw done and Model active', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')
      const pills = screen.getByText('OpenClaw').closest('.wizard-step-pills')!
      expect(within(pills as HTMLElement).getByText('OpenClaw')).toBeInTheDocument()
      expect(within(pills as HTMLElement).getByText('Model')).toBeInTheDocument()
    })

    it('shows primary providers on load', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')
      expect(screen.getByText('OpenAI')).toBeInTheDocument()
      expect(screen.getByText('Anthropic')).toBeInTheDocument()
      expect(screen.getByText('DeepSeek')).toBeInTheDocument()
      expect(screen.getByText('Google Gemini')).toBeInTheDocument()
    })

    it('shows more providers when expanding', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText(/More providers/i))
      expect(screen.getByText('Mistral AI')).toBeInTheDocument()
      expect(screen.getByText('Groq')).toBeInTheDocument()
    })

    it('switches provider and resets API key state', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      const openaiInput = screen.getByPlaceholderText(/Enter OpenAI API Key/i)
      fireEvent.change(openaiInput, { target: { value: 'sk-123' } })

      fireEvent.click(screen.getByText('Anthropic'))
      const anthropicInput = screen.getByPlaceholderText(/Enter Anthropic API Key/i)
      expect(anthropicInput).toHaveValue('')
    })

    it('shows "Get API Key" link for providers with keyUrl', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')
      fireEvent.click(screen.getByText('OpenAI'))

      expect(screen.getByText(/Get OpenAI API Key/i)).toHaveAttribute('href', 'https://platform.openai.com/api-keys')
    })
  })

  // ──────────────────────────────────────────────────────
  // Step 2b: API Key validation
  // ──────────────────────────────────────────────────────

  describe('Step 2b: API Key validation', () => {
    it('disables validate button when API key is empty', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')
      fireEvent.click(screen.getByText('OpenAI'))

      const btn = screen.getByRole('button', { name: /Validate & Continue/i })
      expect(btn).toBeDisabled()
    })

    it('validates API key and shows model picker', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      const input = screen.getByPlaceholderText(/Enter OpenAI API Key/i)
      fireEvent.change(input, { target: { value: 'sk-test-key' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.testApiKey).toHaveBeenCalledWith('openai', 'sk-test-key', undefined)
      })
      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.initConfig).toHaveBeenCalledTimes(1)
        expect(mockSetupAdapter.onboarding.setApiKey).toHaveBeenCalledWith('openai', 'sk-test-key', undefined)
      })

      expect(await screen.findByText('Select Default Model')).toBeInTheDocument()
    })

    it('shows error when API key is invalid', async () => {
      mockSetupAdapter.onboarding.testApiKey.mockResolvedValue(false)

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      const input = screen.getByPlaceholderText(/Enter OpenAI API Key/i)
      fireEvent.change(input, { target: { value: 'bad-key' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText(/API Key invalid/i)).toBeInTheDocument()
    })

    it('shows error when setApiKey throws', async () => {
      mockSetupAdapter.onboarding.setApiKey.mockRejectedValue(new Error('write failed'))

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-ok' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText('write failed')).toBeInTheDocument()
    })

    it('still shows the model picker when config initialization fails after validation', async () => {
      mockSetupAdapter.onboarding.initConfig.mockRejectedValue(new Error('init error'))

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-openai' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText('Select Default Model')).toBeInTheDocument()
      expect(mockSetupAdapter.onboarding.setApiKey).toHaveBeenCalledWith('openai', 'sk-openai', undefined)
    })

    it('passes baseUrl for DeepSeek provider', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('DeepSeek'))
      fireEvent.change(screen.getByPlaceholderText(/Enter DeepSeek API Key/i), { target: { value: 'sk-ds' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.testApiKey).toHaveBeenCalledWith(
          'deepseek',
          'sk-ds',
          'https://api.deepseek.com/v1',
        )
      })
    })

    it('requires revalidation when the API key changes after validation', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-old' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText('Select Default Model')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-new' } })

      expect(screen.getByRole('button', { name: /Validate & Continue/i })).toBeInTheDocument()
      expect(screen.queryByText('Select Default Model')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Enter ClawMaster/i })).not.toBeInTheDocument()
    })

    it('requires revalidation when the base URL changes after validation', async () => {
      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText(/More providers/i))
      fireEvent.click(screen.getByText('Custom (OpenAI Compatible)'))
      fireEvent.change(screen.getByPlaceholderText(/API Base URL/i), { target: { value: 'https://api.example.com/v1' } })
      fireEvent.change(screen.getByPlaceholderText(/Enter Custom \(OpenAI Compatible\) API Key/i), { target: { value: 'sk-old' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText('Select Default Model')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText(/API Base URL/i), { target: { value: 'https://api.changed.example/v1' } })

      expect(screen.getByRole('button', { name: /Validate & Continue/i })).toBeInTheDocument()
      expect(screen.queryByText('Select Default Model')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Enter ClawMaster/i })).not.toBeInTheDocument()
    })

    it('ignores stale live catalog responses after switching providers', async () => {
      const staleCatalog = deferred<{
        success: boolean
        data: Array<{ id: string; name: string }>
        error: null
      }>()
      mockGetProviderModelCatalogResult.mockImplementationOnce(() => staleCatalog.promise)

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-openai' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText('Select Default Model')).toBeInTheDocument()

      fireEvent.click(screen.getByText(/More providers/i))
      fireEvent.click(screen.getByText('Amazon Bedrock'))
      fireEvent.change(screen.getByPlaceholderText(/Enter Amazon Bedrock API Key/i), { target: { value: 'aws-key' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      expect(await screen.findByText('Select Default Model')).toBeInTheDocument()

      await act(async () => {
        staleCatalog.resolve({
          success: true,
          data: [{ id: 'gpt-5-preview', name: 'GPT-5 Preview' }],
          error: null,
        })
        await staleCatalog.promise
      })

      expect(screen.getByDisplayValue('anthropic.claude-sonnet-4-6')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('gpt-5-preview')).not.toBeInTheDocument()
      expect(screen.queryByText('GPT-5 Preview')).not.toBeInTheDocument()
    })

    it('clears the provisional model when the live catalog excludes it', async () => {
      mockGetProviderModelCatalogResult.mockResolvedValue({
        success: true,
        data: [{ id: 'gpt-4.1', name: 'GPT-4.1' }],
        error: null,
      })

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-openai' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      const enterButton = await screen.findByRole('button', { name: /Enter ClawMaster/i })

      await waitFor(() => {
        expect(enterButton).toBeDisabled()
      })

      expect(screen.getByDisplayValue('gpt-4.1')).not.toBeChecked()
    })

    it('uses the curated/live intersection when the provider catalog is a superset', async () => {
      mockGetProviderModelCatalogResult.mockResolvedValue({
        success: true,
        data: [
          { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
          { id: 'gpt-5-preview', name: 'GPT-5 Preview' },
        ],
        error: null,
      })

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-openai' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await screen.findByText('Select Default Model')

      expect(screen.getByDisplayValue('gpt-4.1-mini')).toBeChecked()
      expect(screen.queryByDisplayValue('gpt-4.1')).not.toBeInTheDocument()
      expect(screen.queryByDisplayValue('gpt-4o')).not.toBeInTheDocument()
      expect(screen.queryByDisplayValue('gpt-5-preview')).not.toBeInTheDocument()
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    it('keeps curated model choices when the live catalog is unsafe', async () => {
      mockGetProviderModelCatalogResult.mockResolvedValue({
        success: true,
        data: [{ id: 'text-embedding-3-large', name: 'Text Embedding 3 Large' }],
        error: null,
      })

      render(<SetupWizard onComplete={() => {}} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenRouter'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenRouter API Key/i), { target: { value: 'sk-openrouter' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await screen.findByText('Select Default Model')

      expect(screen.getByDisplayValue('anthropic/claude-sonnet-4')).toBeChecked()
      expect(screen.getByDisplayValue('openai/gpt-4.1-mini')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('text-embedding-3-large')).not.toBeInTheDocument()
      expect(screen.queryByText('Live')).not.toBeInTheDocument()
    })
  })

  // ──────────────────────────────────────────────────────
  // Step 2c: Model selection
  // ──────────────────────────────────────────────────────

  describe('Step 2c: Model selection', () => {
    async function renderAndAdvanceToModelPicker() {
      const result = render(<SetupWizard onComplete={vi.fn()} />)

      await screen.findByText('Configure LLM Provider')
      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-x' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await screen.findByText('Select Default Model')
      return result
    }

    it('shows model radio buttons for OpenAI', async () => {
      await renderAndAdvanceToModelPicker()

      expect(screen.getByDisplayValue('gpt-4.1')).toBeInTheDocument()
      expect(screen.getByDisplayValue('gpt-4.1-mini')).toBeInTheDocument()
      expect(screen.getByDisplayValue('gpt-4o')).toBeInTheDocument()
    })

    it('pre-selects the default model', async () => {
      await renderAndAdvanceToModelPicker()

      const defaultRadio = screen.getByDisplayValue('gpt-4.1-mini')
      expect(defaultRadio).toBeChecked()
    })

    it('allows custom model ID input that deselects radio', async () => {
      await renderAndAdvanceToModelPicker()

      const customInput = screen.getByPlaceholderText(/Enter model ID/i)
      fireEvent.change(customInput, { target: { value: 'gpt-5-preview' } })

      expect(screen.getByDisplayValue('gpt-4.1-mini')).not.toBeChecked()

      fireEvent.click(screen.getByRole('button', { name: /Enter ClawMaster/i }))

      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.setDefaultModel).toHaveBeenCalledWith('openai/gpt-5-preview')
      })
    })

    it('disables enter button when no model is selected and custom is empty', async () => {
      await renderAndAdvanceToModelPicker()

      const customInput = screen.getByPlaceholderText(/Enter model ID/i)
      // type something to deselect the radio, then clear it
      fireEvent.change(customInput, { target: { value: 'x' } })
      fireEvent.change(customInput, { target: { value: '' } })

      const btn = screen.getByRole('button', { name: /Enter ClawMaster/i })
      expect(btn).toBeDisabled()
    })
  })

  // ──────────────────────────────────────────────────────
  // Full happy-path flow
  // ──────────────────────────────────────────────────────

  describe('Full happy-path: detect → provider → model → reveal → complete', () => {
    it('completes the entire wizard flow end-to-end', async () => {
      const onComplete = vi.fn()
      render(<SetupWizard onComplete={onComplete} />)

      // Step 1: auto-detects engine → auto-init → advances to provider
      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()

      // Step 2a: pick OpenAI, enter API key
      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-prod-key' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      // Step 2b: model picker appears
      await screen.findByText('Select Default Model')

      // Step 2c: pick model and confirm
      fireEvent.click(screen.getByDisplayValue('gpt-4.1-mini'))
      fireEvent.click(screen.getByRole('button', { name: /Enter ClawMaster/i }))

      // Adapter calls
      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.testApiKey).toHaveBeenCalledWith('openai', 'sk-prod-key', undefined)
        expect(mockSetupAdapter.onboarding.setApiKey).toHaveBeenCalledWith('openai', 'sk-prod-key', undefined)
        expect(mockSetupAdapter.onboarding.setDefaultModel).toHaveBeenCalledWith('openai/gpt-4.1-mini')
      })

      // Circle reveal triggers onComplete
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1)
      }, { timeout: 2000 })
    })
  })

  // ──────────────────────────────────────────────────────
  // Full install path flow
  // ──────────────────────────────────────────────────────

  describe('Full install path: not_installed → install → provider → model → complete', () => {
    it('installs engine then completes the wizard', async () => {
      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })

      const onComplete = vi.fn()
      render(<SetupWizard onComplete={onComplete} />)

      // Step 1: engine not installed → install it
      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))

      // Auto-advances through init to provider
      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()

      // Step 2: pick Anthropic + validate
      fireEvent.click(screen.getByText('Anthropic'))
      fireEvent.change(screen.getByPlaceholderText(/Enter Anthropic API Key/i), { target: { value: 'sk-ant-x' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await screen.findByText('Select Default Model')

      // Pick model and finish
      fireEvent.click(screen.getByDisplayValue('claude-sonnet-4-6'))
      fireEvent.click(screen.getByRole('button', { name: /Enter ClawMaster/i }))

      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.setDefaultModel).toHaveBeenCalledWith('anthropic/claude-sonnet-4-6')
      })

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1)
      }, { timeout: 2000 })
    })
  })

  // ──────────────────────────────────────────────────────
  // Skip flow
  // ──────────────────────────────────────────────────────

  describe('Skip flow', () => {
    it('allows skipping from provider step directly', async () => {
      const onComplete = vi.fn()
      render(<SetupWizard onComplete={onComplete} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText(/Skip remaining steps/i))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1)
      }, { timeout: 2000 })
    })

    it('does not call any adapter methods when skipping', async () => {
      const onComplete = vi.fn()
      render(<SetupWizard onComplete={onComplete} />)

      await screen.findByText('Configure LLM Provider')
      fireEvent.click(screen.getByText(/Skip remaining steps/i))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      }, { timeout: 2000 })

      expect(mockSetupAdapter.onboarding.initConfig).not.toHaveBeenCalled()
      expect(mockSetupAdapter.onboarding.testApiKey).not.toHaveBeenCalled()
      expect(mockSetupAdapter.onboarding.setApiKey).not.toHaveBeenCalled()
      expect(mockSetupAdapter.onboarding.setDefaultModel).not.toHaveBeenCalled()
    })

    it('hides skip once provider credentials have been saved', async () => {
      render(<SetupWizard onComplete={vi.fn()} />)

      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText('OpenAI'))
      fireEvent.change(screen.getByPlaceholderText(/Enter OpenAI API Key/i), { target: { value: 'sk-openai' } })
      fireEvent.click(screen.getByRole('button', { name: /Validate & Continue/i }))

      await screen.findByText('Select Default Model')

      expect(screen.queryByText(/Skip remaining steps/i)).not.toBeInTheDocument()
    })
  })

  // ──────────────────────────────────────────────────────
  // Ollama flow
  // ──────────────────────────────────────────────────────

  describe('Ollama provider flow', () => {
    it('shows Ollama detection panel when Ollama is selected', async () => {
      const { getOllamaStatus } = await import('@/shared/adapters/ollama')
      vi.mocked(getOllamaStatus).mockResolvedValue({
        success: true,
        data: { installed: true, version: '0.9.0', running: true, models: [] },
        error: null,
      })

      render(<SetupWizard onComplete={() => {}} />)
      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText(/Ollama/i))

      expect(await screen.findByText('Ollama Running')).toBeInTheDocument()
      expect(screen.getByText(/No models pulled yet/i)).toBeInTheDocument()
    })

    it('waits for Ollama model pulls to finish before refreshing status', async () => {
      const { getOllamaStatus, pullModel } = await import('@/shared/adapters/ollama')

      vi.mocked(getOllamaStatus).mockResolvedValue({
        success: true,
        data: { installed: true, version: '0.9.0', running: true, models: [] },
        error: null,
      })

      let resolvePull: (() => void) | undefined
      vi.mocked(pullModel).mockImplementation(() => new Promise((resolve) => {
        resolvePull = () => resolve({ success: true, data: 'pulled', error: null })
      }))

      render(<SetupWizard onComplete={() => {}} />)
      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText(/Ollama/i))
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

    it('completes onboarding with the first available local Ollama model', async () => {
      const { getOllamaStatus } = await import('@/shared/adapters/ollama')

      vi.mocked(getOllamaStatus).mockResolvedValue({
        success: true,
        data: {
          installed: true,
          version: '0.9.0',
          running: true,
          models: [{ name: 'qwen2.5:latest', size: 1 }],
        },
        error: null,
      })

      const onComplete = vi.fn()
      render(<SetupWizard onComplete={onComplete} />)
      await screen.findByText('Configure LLM Provider')

      fireEvent.click(screen.getByText(/Ollama/i))
      expect(await screen.findByText('qwen2.5:latest')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Enter ClawMaster/i }))

      await waitFor(() => {
        expect(mockSetupAdapter.onboarding.testApiKey).toHaveBeenCalledWith('ollama', 'ollama', 'http://localhost:11434/v1')
        expect(mockSetupAdapter.onboarding.setApiKey).toHaveBeenCalledWith('ollama', 'ollama', 'http://localhost:11434/v1')
        expect(mockSetupAdapter.onboarding.setDefaultModel).toHaveBeenCalledWith('ollama/qwen2.5:latest')
      })

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1)
      }, { timeout: 2000 })
    })
  })

  // ──────────────────────────────────────────────────────
  // Page refresh recovery
  // ──────────────────────────────────────────────────────

  describe('Page refresh recovery', () => {
    it('saves install state to localStorage when install starts', async () => {
      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })

      render(<SetupWizard onComplete={() => {}} />)

      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))

      const saved = JSON.parse(localStorage.getItem('clawmaster-wizard-install') ?? '{}')
      expect(saved.phase).toBe('installing')
      expect(saved.startedAt).toBeGreaterThan(0)
    })

    it('clears localStorage on install failure', async () => {
      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })
      mockInstallCapabilities.mockRejectedValue(new Error('fail'))

      render(<SetupWizard onComplete={() => {}} />)

      fireEvent.click(await screen.findByRole('button', { name: /Install Core Engine/i }))

      await screen.findByText('fail')
      expect(localStorage.getItem('clawmaster-wizard-install')).toBeNull()
    })

    it('recovers to provider step if localStorage says installed', async () => {
      localStorage.setItem('clawmaster-wizard-install', JSON.stringify({
        phase: 'installed',
        startedAt: Date.now(),
      }))

      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()
      expect(localStorage.getItem('clawmaster-wizard-install')).toBeNull()
    })

    it('re-detects engine if localStorage says installing (install may have finished in background)', async () => {
      localStorage.setItem('clawmaster-wizard-install', JSON.stringify({
        phase: 'installing',
        startedAt: Date.now(),
      }))

      render(<SetupWizard onComplete={() => {}} />)

      // Engine is installed in default mock → should advance to provider
      expect(await screen.findByText('Configure LLM Provider')).toBeInTheDocument()
    })

    it('keeps interrupted installs in recovery mode longer than two polls while the recovery window is still active', async () => {
      localStorage.setItem('clawmaster-wizard-install', JSON.stringify({
        phase: 'installing',
        startedAt: Date.now(),
      }))

      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })

      render(<SetupWizard onComplete={() => {}} />)

      await waitFor(() => {
        expect(mockDetectCapabilities.mock.calls.length).toBeGreaterThanOrEqual(1)
      })

      expect(screen.queryByRole('button', { name: /Install Core Engine/i })).not.toBeInTheDocument()

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 4500))
      })

      expect(mockDetectCapabilities.mock.calls.length).toBeGreaterThanOrEqual(3)
      expect(screen.queryByRole('button', { name: /Install Core Engine/i })).not.toBeInTheDocument()
    }, 10000)

    it('falls back to a retryable install state once the recovery grace window expires', async () => {
      localStorage.setItem('clawmaster-wizard-install', JSON.stringify({
        phase: 'installing',
        startedAt: Date.now() - 61 * 1000,
      }))

      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })

      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByRole('button', { name: /Install Core Engine/i })).toBeInTheDocument()
      expect(screen.getByText(/Use China npm mirror/i)).toBeInTheDocument()
    })

    it('ignores stale localStorage entries older than 10 minutes', async () => {
      localStorage.setItem('clawmaster-wizard-install', JSON.stringify({
        phase: 'installed',
        startedAt: Date.now() - 11 * 60 * 1000,
      }))

      mockDetectCapabilities.mockImplementation(async (onUpdate: (status: any) => void) => {
        const results = engineMissing()
        for (const item of results) onUpdate(item)
        return results
      })

      render(<SetupWizard onComplete={() => {}} />)

      // Should NOT skip to provider — stale entry ignored, engine missing shown
      expect(await screen.findByRole('button', { name: /Install Core Engine/i })).toBeInTheDocument()
    })

    it('clears localStorage when wizard completes via skip', async () => {
      localStorage.setItem('clawmaster-wizard-install', JSON.stringify({
        phase: 'installed',
        startedAt: Date.now(),
      }))

      const onComplete = vi.fn()
      render(<SetupWizard onComplete={onComplete} />)

      await screen.findByText('Configure LLM Provider')
      fireEvent.click(screen.getByText(/Skip remaining steps/i))

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled()
      }, { timeout: 2000 })

      expect(localStorage.getItem('clawmaster-wizard-install')).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────
  // i18n
  // ──────────────────────────────────────────────────────

  describe('Internationalization', () => {
    it('renders in Chinese', async () => {
      await changeLanguage('zh')

      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByText('配置 LLM 提供商')).toBeInTheDocument()
      expect(screen.getByText('文心大模型')).toBeInTheDocument()
    })

    it('renders in Japanese', async () => {
      await changeLanguage('ja')

      render(<SetupWizard onComplete={() => {}} />)

      expect(await screen.findByText('LLMプロバイダーを設定')).toBeInTheDocument()
    })
  })
})
