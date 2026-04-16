import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import OcrPage from '../OcrPage'

const mockGetConfigResult = vi.fn()
const mockSaveFullConfigResult = vi.fn()
const mockGetSkillsResult = vi.fn()
const mockInstallSkillResult = vi.fn()
const mockSetSkillEnabledResult = vi.fn()
const mockTestPaddleOcrResult = vi.fn()
const mockParsePaddleOcrResult = vi.fn()

vi.mock('@/shared/adapters/openclaw', () => ({
  getConfigResult: (...args: any[]) => mockGetConfigResult(...args),
  saveFullConfigResult: (...args: any[]) => mockSaveFullConfigResult(...args),
}))

vi.mock('@/shared/adapters/clawhub', () => ({
  getSkillsResult: (...args: any[]) => mockGetSkillsResult(...args),
  installSkillResult: (...args: any[]) => mockInstallSkillResult(...args),
  setSkillEnabledResult: (...args: any[]) => mockSetSkillEnabledResult(...args),
}))

vi.mock('@/shared/adapters/ocr', () => ({
  testPaddleOcrResult: (...args: any[]) => mockTestPaddleOcrResult(...args),
  parsePaddleOcrResult: (...args: any[]) => mockParsePaddleOcrResult(...args),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <OcrPage />
    </MemoryRouter>,
  )
}

describe('OcrPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockGetConfigResult.mockResolvedValue({
      success: true,
      data: {
        agents: {
          defaults: {
            model: { primary: 'siliconflow/Pro/moonshotai/Kimi-K2.5' },
          },
        },
        models: {
          providers: {
            siliconflow: {
              models: [
                { id: 'Pro/moonshotai/Kimi-K2.5', name: 'Kimi K2.5' },
                { id: 'Pro/zai-org/GLM-5.1', name: 'GLM 5.1' },
              ],
            },
          },
        },
        ocr: {
          providers: {
            paddleocr: {
              endpoint: 'https://example.com/layout-parsing',
              accessToken: 'saved-token',
              defaultFileType: 1,
              useDocOrientationClassify: true,
              useLayoutDetection: true,
              mergeTables: true,
              relevelTitles: true,
              prettifyMarkdown: true,
            },
          },
        },
      },
      error: null,
    })
    mockSaveFullConfigResult.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    mockGetSkillsResult.mockResolvedValue({
      success: true,
      data: [],
      error: null,
    })
    mockInstallSkillResult.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    mockSetSkillEnabledResult.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    mockTestPaddleOcrResult.mockResolvedValue({
      success: true,
      data: {
        ok: true,
        sampleFile: 'https://example.com/sample.jpg',
        pageCount: 1,
      },
      error: null,
    })
    mockParsePaddleOcrResult.mockResolvedValue({
      success: true,
      data: {
        layoutParsingResults: [
          {
            markdown: {
              text: '# Parsed',
              images: {},
            },
            outputImages: null,
          },
        ],
      },
      error: null,
    })
  })

  it('renders the OCR workspace and bundled-skill onboarding message', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'OCR & Doc Parsing' })).toBeInTheDocument()
    expect(screen.getByText('Bundled skill guidance')).toBeInTheDocument()
    expect(screen.getByText('Better results with strong tool-following text models')).toBeInTheDocument()
    expect(screen.getByText('Examples from your available text models')).toBeInTheDocument()
    expect(screen.getByText('SiliconFlow / Kimi K2.5')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Models' })).toHaveAttribute('href', '/models')
    expect(screen.getByText('Prompt that reliably runs the skill')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue(
        'Use the read tool to load the installed PaddleOCR Doc Parsing skill file, then use the exec tool to run its bundled Node script against this PDF or image and reply with exactly the recognized markdown only, no explanation: <url-or-file-path>',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Skills' })).toHaveAttribute('href', '/skills')
    expect(screen.getByText('Chinese Document')).toBeInTheDocument()
    expect(screen.getByText('Table Page')).toBeInTheDocument()
    expect(screen.getByText('AI Studio token')).toBeInTheDocument()
  })

  it('auto-enables the bundled skill when PaddleOCR is already configured', async () => {
    renderPage()

    await waitFor(() => {
      expect(mockInstallSkillResult).toHaveBeenCalledWith('paddleocr-doc-parsing')
    })
    await waitFor(() => {
      expect(mockSetSkillEnabledResult).toHaveBeenCalledWith('paddleocr-doc-parsing', true)
    })
    expect(await screen.findByText('Bundled PaddleOCR skill auto-enabled for this saved OCR provider.')).toBeInTheDocument()
  })

  it('saves PaddleOCR config and installs the bundled skill', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('https://example.com/layout-parsing')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('saved-token')).toBeInTheDocument()

    const saveButton = await screen.findByRole('button', { name: 'Save & Enable OCR' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockInstallSkillResult).toHaveBeenCalledWith('paddleocr-doc-parsing')
    })
    await waitFor(() => {
      expect(mockSaveFullConfigResult).toHaveBeenCalled()
    })
    expect(await screen.findByText('PaddleOCR saved and ready to use.')).toBeInTheDocument()
  })

  it('runs a sample parse and renders markdown output', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('https://example.com/layout-parsing')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('saved-token')).toBeInTheDocument()

    const parseButton = await screen.findByRole('button', { name: 'Parse Document' })
    fireEvent.click(parseButton)

    await waitFor(() => {
      expect(mockParsePaddleOcrResult).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: 'https://example.com/layout-parsing',
        accessToken: 'saved-token',
        fileType: 1,
      }))
    })
    expect(await screen.findByDisplayValue(/# Parsed/)).toBeInTheDocument()
  })

  it('prefills the AI Studio token from the saved ERNIE provider when OCR is not configured yet', async () => {
    mockGetConfigResult.mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {
            'baidu-aistudio': {
              apiKey: 'shared-baidu-token',
            },
          },
        },
      },
      error: null,
    })

    renderPage()

    expect(await screen.findByDisplayValue('shared-baidu-token')).toBeInTheDocument()
  })
})
