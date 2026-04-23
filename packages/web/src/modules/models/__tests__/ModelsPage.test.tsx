import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import ModelsPage from '../ModelsPage'

const mockGetConfig = vi.fn()
const mockGetModels = vi.fn()
const mockSetDefaultModel = vi.fn()
const mockTestApiKey = vi.fn()
const mockSetApiKey = vi.fn()
const mockGetProviderModelCatalog = vi.fn()
const mockSetConfigResult = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    getConfig: (...args: any[]) => mockGetConfig(...args),
    getModels: (...args: any[]) => mockGetModels(...args),
    setDefaultModel: (...args: any[]) => mockSetDefaultModel(...args),
  },
}))

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => ({
    onboarding: {
      testApiKey: (...args: any[]) => mockTestApiKey(...args),
      setApiKey: (...args: any[]) => mockSetApiKey(...args),
    },
  }),
}))

vi.mock('@/shared/adapters/openclaw', () => ({
  getProviderModelCatalogResult: (...args: any[]) => mockGetProviderModelCatalog(...args),
  setConfigResult: (...args: any[]) => mockSetConfigResult(...args),
}))

function getElementById(id: string) {
  const element = document.getElementById(id)
  expect(element).not.toBeNull()
  return element as HTMLElement
}

function getProviderCardByLabel(label: string) {
  const card = screen
    .getAllByText(label)
    .map((element) => element.closest('.surface-card'))
    .find((element): element is HTMLElement => Boolean(element))
  expect(card).not.toBeNull()
  return card as HTMLElement
}

function getProviderButtonByLabel(label: string) {
  const button = screen
    .getAllByText(label)
    .map((element) => element.closest('button'))
    .find((element): element is HTMLButtonElement => Boolean(element))
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ModelsPage />
    </MemoryRouter>,
  )
}

describe('ModelsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockGetModels.mockResolvedValue([])
    mockSetDefaultModel.mockResolvedValue(undefined)
    mockGetProviderModelCatalog.mockResolvedValue({
      success: true,
      data: [],
      error: null,
    })
    mockSetConfigResult.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    mockGetConfig.mockResolvedValue({
      agents: {
        defaults: {
          model: { primary: '' },
          imageGenerationModel: { primary: '' },
        },
      },
      models: {
        providers: {},
      },
    })
    mockTestApiKey.mockResolvedValue(true)
    mockSetApiKey.mockResolvedValue(undefined)
  })

  it('renders the first-run provider recommendations and opens the add panel from a recommended provider', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    const firstRun = getElementById('models-first-run')
    expect(within(firstRun).getByText('Connect your first provider')).toBeInTheDocument()
    expect(within(firstRun).getByText('Text providers')).toBeInTheDocument()
    expect(within(firstRun).getByText('Image providers')).toBeInTheDocument()
    expect(within(firstRun).getByText('OpenAI')).toBeInTheDocument()
    expect(within(firstRun).getByText('Anthropic')).toBeInTheDocument()
    expect(within(firstRun).getByText('ERNIE LLM API')).toBeInTheDocument()
    expect(within(firstRun).getByText('ERNIE-Image')).toBeInTheDocument()
    expect(within(firstRun).getByText('Gemini Image')).toBeInTheDocument()
    expect(within(firstRun).getByText('GPT Image')).toBeInTheDocument()
    expect(within(firstRun).getAllByText('Golden Sponsor').length).toBeGreaterThan(0)

    fireEvent.click(getProviderButtonByLabel('ERNIE LLM API'))

    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get ERNIE LLM API Access Token →' })).toHaveAttribute(
      'href',
      'https://aistudio.baidu.com/usercenter/token',
    )
    expect(screen.getByPlaceholderText('Enter ERNIE LLM API Access Token')).toBeInTheDocument()
    expect(screen.getByText('Get 1,000,000 free tokens after registration, then another 1,000,000 after completing your profile.')).toBeInTheDocument()
  })

  it('requires a base URL for providers that need a custom endpoint before verifying', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ollama' }))
    fireEvent.change(screen.getByPlaceholderText('Enter Ollama API Key'), {
      target: { value: 'ollama-local-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Add' }))

    await waitFor(() => {
      expect(screen.getByText('Please enter API Base URL')).toBeInTheDocument()
    })
    expect(mockTestApiKey).not.toHaveBeenCalled()
    expect(mockSetApiKey).not.toHaveBeenCalled()
  })

  it('lists ERNIE LLM API in the expanded provider catalog and can submit it', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    const panel = within(getElementById('models-add-provider'))

    fireEvent.click(panel.getByRole('button', { name: /More/ }))
    fireEvent.click(panel.getByRole('button', { name: /ERNIE LLM API/ }))
    fireEvent.change(screen.getByPlaceholderText('Enter ERNIE LLM API Access Token'), {
      target: { value: 'bce-test-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Add' }))

    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('baidu-aistudio', 'bce-test-token', undefined)
    })
    await waitFor(() => {
      expect(mockSetApiKey).toHaveBeenCalledWith('baidu-aistudio', 'bce-test-token', undefined)
    })
  })

  it('lists ERNIE-Image in the expanded provider catalog and surfaces text-to-image guidance', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'siliconflow/Pro/moonshotai/Kimi-K2.5' },
          imageGenerationModel: { primary: '' },
        },
      },
      models: {
        providers: {
          siliconflow: {
            apiKey: 'sk-silicon',
            baseUrl: 'https://api.siliconflow.cn/v1',
            models: [
              { id: 'Pro/moonshotai/Kimi-K2.5', name: 'Kimi K2.5' },
              { id: 'Pro/zai-org/GLM-5.1', name: 'GLM 5.1' },
            ],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    const panel = within(getElementById('models-add-provider'))

    fireEvent.click(panel.getByRole('button', { name: /More/ }))
    fireEvent.click(panel.getByRole('button', { name: /ERNIE-Image/ }))

    expect(screen.getByText('Use this provider for image generation, not as the primary agent chat model.')).toBeInTheDocument()
    expect(screen.getByText('Automatic skill setup')).toBeInTheDocument()
    expect(screen.getByText('ClawMaster will install and enable the bundled ERNIE-Image Guide skill when you add this provider, so users get ERNIE-specific prompt and parameter guidance automatically.')).toBeInTheDocument()
    expect(screen.getByText('Recommended skill')).toBeInTheDocument()
    expect(screen.getByText('ERNIE-Image Guide')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Skills' })).toHaveAttribute('href', '/skills')
    expect(screen.getByText('Better results with strong tool-following text models')).toBeInTheDocument()
    expect(screen.getByText('Examples from your available text models')).toBeInTheDocument()
    expect(screen.getByText('SiliconFlow / Kimi K2.5')).toBeInTheDocument()
    expect(screen.getByText('SiliconFlow / GLM 5.1')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Enter ERNIE-Image Access Token'), {
      target: { value: 'bce-image-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Add' }))

    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('baidu-aistudio-image', 'bce-image-token', undefined)
    })
    await waitFor(() => {
      expect(mockSetApiKey).toHaveBeenCalledWith('baidu-aistudio-image', 'bce-image-token', undefined)
    })
  })

  it('lists Gemini Image in the image provider section and submits it through the image-provider flow', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    const addPanel = getElementById('models-add-provider')
    expect(within(addPanel).getByText('Image providers')).toBeInTheDocument()

    fireEvent.click(within(addPanel).getByRole('button', { name: 'Gemini Image' }))
    expect(screen.getByText('Use Gemini Image for image generation tasks. Keep Gemini chat models in the text provider section.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Enter Gemini Image API Key'), {
      target: { value: 'google-image-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Add' }))

    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('google-image', 'google-image-key', undefined)
    })
    await waitFor(() => {
      expect(mockSetApiKey).toHaveBeenCalledWith('google-image', 'google-image-key', undefined)
    })
  })

  it('lists GPT Image in the image provider section and submits it through the image-provider flow', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    const addPanel = getElementById('models-add-provider')

    fireEvent.click(within(addPanel).getByRole('button', { name: 'GPT Image' }))
    expect(screen.getByText('Use GPT Image for image generation tasks. Keep GPT chat and reasoning models in the text provider section.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Enter GPT Image API Key'), {
      target: { value: 'openai-image-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Add' }))

    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('openai-image', 'openai-image-key', undefined)
    })
    await waitFor(() => {
      expect(mockSetApiKey).toHaveBeenCalledWith('openai-image', 'openai-image-key', undefined)
    })
  })

  it('ranks the golden sponsor first in configured providers and in the add-provider panel', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'baidu-aistudio/ernie-5.0-thinking-preview' },
        },
      },
      models: {
        providers: {
          siliconflow: {
            apiKey: 'sk-silicon',
            baseUrl: 'https://api.siliconflow.cn/v1',
            models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' }],
          },
          'baidu-aistudio': {
            apiKey: 'sk-baidu',
            baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
            models: [{ id: 'ernie-5.0-thinking-preview', name: 'ERNIE 5.0 Thinking Preview' }],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    const configuredCards = Array.from(document.querySelectorAll('#models-text-providers .surface-card'))
    expect(configuredCards).toHaveLength(2)
    expect(configuredCards[0]?.textContent).toContain('ERNIE LLM API')
    expect(configuredCards[1]?.textContent).toContain('SiliconFlow')

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const addPanel = getElementById('models-add-provider')
    const providerButtons = Array.from(addPanel.querySelectorAll<HTMLButtonElement>('[data-provider-id]'))
    expect(providerButtons[0]?.dataset.providerId).toBe('baidu-aistudio')
    expect(providerButtons[0]?.textContent).toContain('Golden Sponsor')
    expect(providerButtons[0]?.textContent).toContain('ERNIE LLM API')
  })

  it('shows the canonical ERNIE catalog on configured cards even when saved config still has the old model list', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'baidu-aistudio/deepseek-v3' },
        },
      },
      models: {
        providers: {
          'baidu-aistudio': {
            apiKey: 'sk-baidu',
            baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
            models: [
              { id: 'deepseek-v3', name: 'DeepSeek V3' },
              { id: 'deepseek-r1', name: 'DeepSeek R1' },
            ],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('ERNIE 5.0 Thinking Preview')).toBeInTheDocument()
    expect(screen.getByText('deepseek-v3')).toBeInTheDocument()
    expect(screen.queryByText('ERNIE 4.5 Turbo VL')).not.toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('ERNIE LLM API')).getByRole('button', { name: 'Choose Model' }))
    const picker = getElementById('models-provider-picker-baidu-aistudio')
    expect(within(picker!).getByRole('button', { name: /ERNIE 5.0 Thinking Preview/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /^ERNIE 4\.5 Turbo VL ernie-4\.5-turbo-vl$/ })).toBeInTheDocument()
    expect(within(picker!).queryByRole('button', { name: /DeepSeek V3/ })).not.toBeInTheDocument()
    expect(within(picker!).queryByRole('button', { name: /DeepSeek R1/ })).not.toBeInTheDocument()
  })

  it('shows the canonical ERNIE catalog when the saved legacy model list uses string entries', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'baidu-aistudio/deepseek-v3' },
        },
      },
      models: {
        providers: {
          'baidu-aistudio': {
            apiKey: 'sk-baidu',
            baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
            models: ['deepseek-v3', 'deepseek-r1'],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    fireEvent.click(within(getProviderCardByLabel('ERNIE LLM API')).getByRole('button', { name: 'Choose Model' }))

    const picker = getElementById('models-provider-picker-baidu-aistudio')
    expect(within(picker!).getByRole('button', { name: /ERNIE 5.0 Thinking Preview/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /^ERNIE 4\.5 Turbo VL ernie-4\.5-turbo-vl$/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /deepseek-v3 deepseek-v3/i })).toBeInTheDocument()
    expect(within(picker!).queryByRole('button', { name: /deepseek-r1 deepseek-r1/i })).not.toBeInTheDocument()
  })

  it('merges built-in models into saved provider snapshots for supported providers', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-custom' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [
              { id: 'gpt-4.1-custom', name: 'GPT-4.1 Custom' },
              { id: 'o3-enterprise', name: 'o3 Enterprise' },
            ],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('GPT-4.1 Custom')).toBeInTheDocument()
    expect(screen.getByText('o3 Enterprise')).toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Choose Model' }))
    const picker = getElementById('models-provider-picker-openai')
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
  })

  it('uses the live provider catalog as the authoritative picker source when remote discovery succeeds', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-custom' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [
              { id: 'gpt-4.1-custom', name: 'GPT-4.1 Custom' },
            ],
          },
        },
      },
    })
    mockGetProviderModelCatalog.mockResolvedValueOnce({
      success: true,
      data: [
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      ],
      error: null,
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockGetProviderModelCatalog).toHaveBeenCalledWith({
        providerId: 'openai',
        apiKey: 'sk-openai',
        baseUrl: undefined,
      })
    })
    expect(screen.getByText('Live catalog')).toBeInTheDocument()
    expect(screen.getByText('Loaded from the provider account in real time.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Models' })).toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Choose Model' }))
    const picker = getElementById('models-provider-picker-openai')
    expect(within(picker!).getByText('Live catalog')).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /GPT-5 Mini gpt-5-mini/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /gpt-4\.1-custom gpt-4\.1-custom/i })).toBeInTheDocument()
    expect(within(picker!).queryByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).not.toBeInTheDocument()
  })

  it('shows fallback state when live catalog loading fails', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'siliconflow/deepseek-ai/DeepSeek-V3' },
        },
      },
      models: {
        providers: {
          siliconflow: {
            apiKey: 'sk-silicon',
            baseUrl: 'https://api.siliconflow.cn/v1',
            models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' }],
          },
        },
      },
    })
    mockGetProviderModelCatalog.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: 'Remote catalog failed',
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Catalog unavailable')).toBeInTheDocument()
    })

    fireEvent.click(within(getProviderCardByLabel('SiliconFlow')).getByRole('button', { name: 'Choose Model' }))
    const picker = getElementById('models-provider-picker-siliconflow')
    expect(within(picker!).getByText('Fallback catalog')).toBeInTheDocument()
    expect(within(picker!).getByText('Remote catalog failed')).toBeInTheDocument()
  })

  it('falls back to the built-in catalog when a configured provider saves an empty model list', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('GPT-4.1 Mini')).toBeInTheDocument()
    expect(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Choose Model' })).toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Choose Model' }))
    const picker = getElementById('models-provider-picker-openai')
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 gpt-4.1/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
  })

  it('enables the live catalog flow for custom openai-compatible providers once baseUrl is set', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'custom-openai-compatible/my-custom-model' },
        },
      },
      models: {
        providers: {
          'custom-openai-compatible': {
            apiKey: 'sk-custom',
            api: 'openai-completions',
            baseUrl: 'https://llm.example.com/v1',
            models: [],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    const customCard = getProviderCardByLabel('Custom (OpenAI Compatible)')
    expect(within(customCard).getByRole('button', { name: 'Refresh Models' })).toBeInTheDocument()
  })

  it('sets image generation providers as the image default instead of the text default', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
          imageGenerationModel: { primary: '' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
          },
          'baidu-aistudio-image': {
            apiKey: 'bce-image-token',
            api: 'openai-completions',
            baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
            models: [{ id: 'ernie-image-turbo', name: 'ERNIE-Image Turbo' }],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('Image generation default')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    const imageProviderCard = screen.getByText('ERNIE-Image').closest('.surface-card')
    expect(imageProviderCard).not.toBeNull()
    expect(within(imageProviderCard!).queryByRole('button', { name: 'Refresh Models' })).not.toBeInTheDocument()

    fireEvent.click(within(imageProviderCard!).getByRole('button', { name: 'Choose Model' }))

    const picker = getElementById('models-provider-picker-baidu-aistudio-image')
    expect(within(picker!).queryByText('Live catalog')).not.toBeInTheDocument()
    expect(within(picker!).queryByText('Fallback catalog')).not.toBeInTheDocument()

    fireEvent.click(within(picker!).getByRole('button', { name: 'Set as Image Default' }))

    await waitFor(() => {
      expect(mockSetConfigResult).toHaveBeenCalledWith(
        'agents.defaults.imageGenerationModel.primary',
        'baidu-aistudio-image/ernie-image-turbo',
      )
    })
    expect(mockSetDefaultModel).not.toHaveBeenCalled()
  })

  it('ignores name-only saved entries and falls back to built-in model ids for built-in providers', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [{ name: 'GPT-4.1 Mini' }],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Choose Model' }))

    const picker = getElementById('models-provider-picker-openai')
    expect(within(picker!).queryByRole('button', { name: /^GPT-4\.1 Mini GPT-4\.1 Mini$/ })).not.toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
  })

  it('renders aliased GPT and Gemini image cards in the standalone image section', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
          imageGenerationModel: { primary: 'google/gemini-3.1-flash-image-preview' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
          },
          google: {
            apiKey: 'sk-google',
            models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    const textSection = getElementById('models-text-providers')
    const imageSection = getElementById('models-image-providers')

    expect(within(textSection).getByText('OpenAI')).toBeInTheDocument()
    expect(within(textSection).getByText('Google Gemini')).toBeInTheDocument()
    expect(within(imageSection).getByText('GPT Image')).toBeInTheDocument()
    expect(within(imageSection).getByText('Gemini Image')).toBeInTheDocument()

    const gptImageCard = getProviderCardByLabel('GPT Image')
    expect(within(gptImageCard).queryByRole('button', { name: 'Refresh Models' })).not.toBeInTheDocument()
    fireEvent.click(within(gptImageCard).getByRole('button', { name: 'Choose Model' }))

    const picker = getElementById('models-provider-picker-openai-image')
    expect(within(picker).getByRole('button', { name: /GPT Image 1 gpt-image-1/ })).toBeInTheDocument()
    expect(within(picker).queryByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).not.toBeInTheDocument()
  })

  it('tests aliased image providers with their stored image credential instead of the shared chat key', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
          imageGenerationModel: { primary: 'openai/gpt-image-1' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai-chat',
            imageApiKey: 'sk-openai-image',
            models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('openai', 'sk-openai-chat', undefined)
    })

    fireEvent.click(within(getProviderCardByLabel('GPT Image')).getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('openai-image', 'sk-openai-image', undefined)
    })
  })

  it('does not inherit chat-only base URLs for aliased image providers', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
          imageGenerationModel: { primary: 'google/gemini-3.1-flash-image-preview' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai-chat',
            imageApiKey: 'sk-openai-image',
            baseUrl: 'https://chat-proxy.example.com/v1',
            models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
          },
          google: {
            apiKey: 'sk-google-chat',
            imageApiKey: 'sk-google-image',
            baseUrl: 'https://google-chat-proxy.example.com/v1beta',
            models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('openai', 'sk-openai-chat', 'https://chat-proxy.example.com/v1')
    })

    fireEvent.click(within(getProviderCardByLabel('GPT Image')).getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('openai-image', 'sk-openai-image', undefined)
    })

    fireEvent.click(within(getProviderCardByLabel('Google Gemini')).getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('google', 'sk-google-chat', 'https://google-chat-proxy.example.com/v1beta')
    })

    fireEvent.click(within(getProviderCardByLabel('Gemini Image')).getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => {
      expect(mockTestApiKey).toHaveBeenCalledWith('google-image', 'sk-google-image', undefined)
    })
  })

  it('lets users pick and set a model from the configured provider card', async () => {
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'baidu-aistudio/ernie-5.0-thinking-preview' },
        },
      },
      models: {
        providers: {
          'baidu-aistudio': {
            apiKey: 'sk-baidu',
            baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
            models: [
              { id: 'ernie-5.0-thinking-preview', name: 'ERNIE 5.0 Thinking Preview' },
              { id: 'ernie-4.5-turbo-vl', name: 'ERNIE 4.5 Turbo VL' },
              { id: 'ernie-4.5-21b-a3b-thinking', name: 'ERNIE 4.5 21B A3B Thinking' },
            ],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(within(getProviderCardByLabel('ERNIE LLM API')).getByRole('button', { name: 'Choose Model' }))

    const picker = getElementById('models-provider-picker-baidu-aistudio')
    expect(within(picker!).getByPlaceholderText('Search by model name or ID...')).toBeInTheDocument()
    expect(within(picker!).getByText(/Showing \d+ of \d+ models/)).toBeInTheDocument()

    fireEvent.change(within(picker!).getByPlaceholderText('Search by model name or ID...'), {
      target: { value: 'Turbo VL' },
    })
    expect(within(picker!).getByText('Showing 3 of 27 models')).toBeInTheDocument()
    expect(within(picker!).queryByRole('button', { name: /ERNIE 5.0 Thinking Preview/ })).not.toBeInTheDocument()

    fireEvent.click(within(picker!).getByRole('button', { name: /^ERNIE 4\.5 Turbo VL ernie-4\.5-turbo-vl$/ }))
    await waitFor(() => {
      expect(within(picker!).getByRole('button', { name: 'Set as Default' })).toBeEnabled()
    })
    fireEvent.click(within(picker!).getByRole('button', { name: 'Set as Default' }))

    await waitFor(() => {
      expect(mockSetDefaultModel).toHaveBeenCalledWith('baidu-aistudio/ernie-4.5-turbo-vl')
    })
  })

  it('does not reset an in-progress picker selection when the live catalog refresh finishes', async () => {
    let resolveCatalog: ((value: { success: boolean; data: Array<{ id: string; name: string }>; error: null }) => void) | null = null
    mockGetProviderModelCatalog.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCatalog = resolve
    }))
    mockGetConfig.mockResolvedValueOnce({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-custom' },
        },
      },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-openai',
            models: [
              { id: 'gpt-4.1-custom', name: 'GPT-4.1 Custom' },
              { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
            ],
          },
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    fireEvent.click(within(getProviderCardByLabel('OpenAI')).getByRole('button', { name: 'Choose Model' }))

    const picker = getElementById('models-provider-picker-openai')
    fireEvent.click(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ }))

    await waitFor(() => {
      expect(within(picker!).getByRole('button', { name: 'Set as Default' })).toBeEnabled()
    })
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
    expect(resolveCatalog).not.toBeNull()

    resolveCatalog?.({
      success: true,
      data: [
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      ],
      error: null,
    })

    await waitFor(() => {
      expect(within(picker!).getByText('Live catalog')).toBeInTheDocument()
    })
    expect(within(picker!).getByRole('button', { name: 'Set as Default' })).toBeEnabled()
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /gpt-4\.1-custom gpt-4\.1-custom/i })).toBeInTheDocument()
  })
})
