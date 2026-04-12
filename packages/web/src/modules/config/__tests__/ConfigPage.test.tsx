import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import ConfigPage from '../ConfigPage'

const mockGetConfig = vi.fn()
const mockSaveFullConfig = vi.fn()
const createObjectUrl = vi.fn(() => 'blob:config')
const revokeObjectUrl = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    getConfig: (...args: any[]) => mockGetConfig(...args),
  },
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    saveFullConfig: (...args: any[]) => mockSaveFullConfig(...args),
  },
}))

describe('ConfigPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')

    mockGetConfig.mockResolvedValue({
      gateway: { port: 18789 },
      models: {
        providers: {
          openai: {
            apiKey: 'sk-test',
            models: [{ id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' }],
          },
        },
      },
      channels: {
        slack: { enabled: true },
      },
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
        },
      },
    })

    mockSaveFullConfig.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      value: revokeObjectUrl,
    })
  })

  it('shows a syntax error and disables save when the JSON is invalid', async () => {
    render(<ConfigPage />)

    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{ invalid json' } })

    expect(screen.getByText(/JSON syntax error:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves the parsed config through saveFullConfig and shows success feedback', async () => {
    render(<ConfigPage />)

    const textarea = await screen.findByRole('textbox')
    fireEvent.change(
      textarea,
      { target: { value: JSON.stringify({ gateway: { port: 18800 } }, null, 2) } },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockSaveFullConfig).toHaveBeenCalledWith({ gateway: { port: 18800 } })
    })
    expect(await screen.findByText('Saved successfully')).toBeInTheDocument()
  })

  it('exports the current config as openclaw-config.json', async () => {
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return {
          click: clickSpy,
          set href(_value: string) {},
          set download(_value: string) {},
        } as unknown as HTMLAnchorElement
      }
      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    render(<ConfigPage />)

    await screen.findByRole('heading', { name: 'Config Management' })
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(createObjectUrl).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:config')

    createElementSpy.mockRestore()
  })
})
