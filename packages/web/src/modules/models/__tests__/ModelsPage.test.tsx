import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import ModelsPage from '../ModelsPage'

const mockGetConfig = vi.fn()
const mockGetModels = vi.fn()
const mockSetDefaultModel = vi.fn()
const mockTestApiKey = vi.fn()
const mockSetApiKey = vi.fn()
const mockGetProviderModelCatalog = vi.fn()

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
}))

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
    mockGetConfig.mockResolvedValue({
      agents: {
        defaults: {
          model: { primary: '' },
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
    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('Connect your first provider')).toBeInTheDocument()
    expect(screen.getByText('Recommended providers')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText('ERNIE LLM API')).toBeInTheDocument()
    expect(screen.getByText('Golden Sponsor')).toBeInTheDocument()

    const cta = screen.getAllByText('Use this provider')[0]
    fireEvent.click(cta.closest('button')!)

    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get ERNIE LLM API Access Token →' })).toHaveAttribute(
      'href',
      'https://aistudio.baidu.com/usercenter/token',
    )
    expect(screen.getByPlaceholderText('Enter ERNIE LLM API Access Token')).toBeInTheDocument()
    expect(screen.getByText('Get 1,000,000 free tokens after registration, then another 1,000,000 after completing your profile.')).toBeInTheDocument()
  })

  it('requires a base URL for providers that need a custom endpoint before verifying', async () => {
    render(<ModelsPage />)

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
    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    const addPanel = document.getElementById('models-add-provider')
    expect(addPanel).not.toBeNull()
    const panel = within(addPanel!)

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

    const { container } = render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    const configuredCards = Array.from(container.querySelectorAll('#models-providers > .surface-card'))
    expect(configuredCards).toHaveLength(2)
    expect(configuredCards[0]?.textContent).toContain('ERNIE LLM API')
    expect(configuredCards[1]?.textContent).toContain('SiliconFlow')

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const addPanel = document.getElementById('models-add-provider')
    expect(addPanel).not.toBeNull()

    const sponsorLabel = within(addPanel!).getAllByText('Golden Sponsor')[0]
    const sponsorSection = sponsorLabel.parentElement
    expect(sponsorSection?.textContent).toContain('ERNIE LLM API')
    expect(sponsorSection?.textContent).not.toContain('OpenAI')
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('ERNIE 5.0 Thinking Preview')).toBeInTheDocument()
    expect(screen.getByText('deepseek-v3')).toBeInTheDocument()
    expect(screen.queryByText('ERNIE 4.5 Turbo VL')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))
    const picker = document.getElementById('models-provider-picker-baidu-aistudio')
    expect(picker).not.toBeNull()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))

    const picker = document.getElementById('models-provider-picker-baidu-aistudio')
    expect(picker).not.toBeNull()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('GPT-4.1 Custom')).toBeInTheDocument()
    expect(screen.getByText('o3 Enterprise')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))
    const picker = document.getElementById('models-provider-picker-openai')
    expect(picker).not.toBeNull()
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

    render(<ModelsPage />)

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

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))
    const picker = document.getElementById('models-provider-picker-openai')
    expect(picker).not.toBeNull()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Catalog unavailable')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))
    const picker = document.getElementById('models-provider-picker-siliconflow')
    expect(picker).not.toBeNull()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.getByText('GPT-4.1 Mini')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Model' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))
    const picker = document.getElementById('models-provider-picker-openai')
    expect(picker).not.toBeNull()
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 gpt-4.1/ })).toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
  })

  it('does not enter the live catalog flow for custom openai-compatible providers', async () => {
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh Models' })).not.toBeInTheDocument()
    expect(screen.queryByText('Catalog unavailable')).not.toBeInTheDocument()
    expect(mockGetProviderModelCatalog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))
    const picker = document.getElementById('models-provider-picker-custom-openai-compatible')
    expect(picker).not.toBeNull()
    expect(within(picker!).queryByText('Live catalog')).not.toBeInTheDocument()
    expect(within(picker!).queryByText('Fallback catalog')).not.toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /my-custom-model my-custom-model/i })).toBeInTheDocument()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))

    const picker = document.getElementById('models-provider-picker-openai')
    expect(picker).not.toBeNull()
    expect(within(picker!).queryByRole('button', { name: /^GPT-4\.1 Mini GPT-4\.1 Mini$/ })).not.toBeInTheDocument()
    expect(within(picker!).getByRole('button', { name: /GPT-4.1 Mini gpt-4.1-mini/ })).toBeInTheDocument()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))

    const picker = document.getElementById('models-provider-picker-baidu-aistudio')
    expect(picker).not.toBeNull()
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

    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose Model' }))

    const picker = document.getElementById('models-provider-picker-openai')
    expect(picker).not.toBeNull()
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
