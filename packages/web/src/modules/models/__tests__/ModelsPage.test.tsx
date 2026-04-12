import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import ModelsPage from '../ModelsPage'

const mockGetConfig = vi.fn()
const mockGetModels = vi.fn()
const mockTestApiKey = vi.fn()
const mockSetApiKey = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    getConfig: (...args: any[]) => mockGetConfig(...args),
    getModels: (...args: any[]) => mockGetModels(...args),
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

describe('ModelsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockGetModels.mockResolvedValue([])
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
    expect(screen.getByText('Baidu AI Studio')).toBeInTheDocument()
    expect(screen.getByText('Golden Sponsor')).toBeInTheDocument()

    const cta = screen.getAllByText('Use this provider')[0]
    fireEvent.click(cta.closest('button')!)

    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get Baidu AI Studio Access Token →' })).toHaveAttribute(
      'href',
      'https://aistudio.baidu.com/usercenter/token',
    )
    expect(screen.getByPlaceholderText('Enter Baidu AI Studio Access Token')).toBeInTheDocument()
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

  it('lists Baidu AI Studio in the expanded provider catalog and can submit it', async () => {
    render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    expect(await screen.findByRole('heading', { name: 'Add Provider' })).toBeInTheDocument()

    const addPanel = document.getElementById('models-add-provider')
    expect(addPanel).not.toBeNull()
    const panel = within(addPanel!)

    fireEvent.click(panel.getByRole('button', { name: /More/ }))
    fireEvent.click(panel.getByRole('button', { name: /Baidu AI Studio/ }))
    fireEvent.change(screen.getByPlaceholderText('Enter Baidu AI Studio Access Token'), {
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
          model: { primary: 'baidu-aistudio/deepseek-v3' },
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
            models: [{ id: 'deepseek-v3', name: 'DeepSeek V3' }],
          },
        },
      },
    })

    const { container } = render(<ModelsPage />)

    expect(await screen.findByRole('heading', { name: 'Model Configuration' })).toBeInTheDocument()

    const configuredCards = Array.from(container.querySelectorAll('#models-providers > .surface-card'))
    expect(configuredCards).toHaveLength(2)
    expect(configuredCards[0]?.textContent).toContain('Baidu AI Studio')
    expect(configuredCards[1]?.textContent).toContain('SiliconFlow')

    fireEvent.click(screen.getByRole('button', { name: '+ Add Provider' }))
    const addPanel = document.getElementById('models-add-provider')
    expect(addPanel).not.toBeNull()

    const sponsorLabel = within(addPanel!).getAllByText('Golden Sponsor')[0]
    const sponsorSection = sponsorLabel.parentElement
    expect(sponsorSection?.textContent).toContain('Baidu AI Studio')
    expect(sponsorSection?.textContent).not.toContain('OpenAI')
  })
})
