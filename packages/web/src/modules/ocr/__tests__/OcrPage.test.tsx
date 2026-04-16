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
    await waitFor(() => {
      expect(screen.getByText('Bundled PaddleOCR skill auto-enabled for this saved OCR provider.')).toBeInTheDocument()
    })
  })

  it('preserves existing PaddleOCR skill entry settings when saving OCR config', async () => {
    // skillReady is evaluated as config?.skills?.entries?.[key]?.enabled === true.
    // Setting enabled:true makes skillReady=true synchronously on the first config
    // load, before any skills promise resolves. This prevents the auto-sync effect
    // from firing (and calling refetch() which would swap config before the save
    // click). Using mockResolvedValue keeps the same config for refetch() calls so
    // customPrompt is intact when handleSave reads config. buildSkillEnabledConfig
    // spreads the existing entry then overwrites enabled:true — customPrompt is
    // preserved regardless of the initial enabled value.
    mockGetConfigResult.mockResolvedValue({
      success: true,
      data: {
        skills: {
          entries: {
            'paddleocr-doc-parsing': {
              enabled: true,
              customPrompt: 'keep-me',
            },
          },
        },
        models: {
          providers: {},
        },
        ocr: {
          providers: {
            paddleocr: {
              endpoint: 'https://example.com/layout-parsing',
              accessToken: 'saved-token',
            },
          },
        },
      },
      error: null,
    })

    renderPage()

    const saveButton = await screen.findByRole('button', { name: 'Save & Enable OCR' })
    await waitFor(() => { expect(saveButton).toBeEnabled() })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockSaveFullConfigResult).toHaveBeenCalledWith(expect.objectContaining({
        skills: {
          entries: expect.objectContaining({
            'paddleocr-doc-parsing': expect.objectContaining({
              enabled: true,
              customPrompt: 'keep-me',
            }),
          }),
        },
      }))
    })
  })

  it('does not install the bundled skill when saving OCR config fails', async () => {
    // Provide endpoint + accessToken so canSubmit=true and the save button is
    // enabled (fireEvent.click does not fire React's handler on disabled buttons).
    // Mark the skill as enabled in config so skillReady=true and auto-sync never
    // fires, keeping installSkillResult at 0 calls even after the failed save.
    mockGetConfigResult.mockResolvedValue({
      success: true,
      data: {
        models: { providers: {} },
        skills: {
          entries: { 'paddleocr-doc-parsing': { enabled: true } },
        },
        ocr: {
          providers: {
            paddleocr: {
              endpoint: 'https://example.com/layout-parsing',
              accessToken: 'saved-token',
            },
          },
        },
      },
      error: null,
    })
    mockSaveFullConfigResult.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: 'save failed',
    })

    renderPage()

    const saveButton = await screen.findByRole('button', { name: 'Save & Enable OCR' })
    await waitFor(() => { expect(saveButton).toBeEnabled() })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockSaveFullConfigResult).toHaveBeenCalledTimes(1)
    })
    expect(mockInstallSkillResult).toHaveBeenCalledTimes(0)
  })

  it('saves PaddleOCR config and installs the bundled skill', async () => {
    // skillReady is computed as:
    //   config?.skills?.entries?.['paddleocr-doc-parsing']?.enabled === true
    //   || isSkillInstalled(installedSkills)
    // Setting enabled:true in the persistent config makes skillReady=true
    // synchronously on the first config load, before skills even resolve.
    // This prevents the auto-sync effect from firing at all, leaving
    // installSkillResult at 0 calls until the save button is clicked.
    // Using mockResolvedValue (not Once) ensures refetch() after save returns
    // the same config so skillReady stays true and auto-sync stays suppressed.
    mockGetConfigResult.mockResolvedValue({
      success: true,
      data: {
        models: { providers: {} },
        skills: {
          entries: { 'paddleocr-doc-parsing': { enabled: true } },
        },
        ocr: {
          providers: {
            paddleocr: {
              endpoint: 'https://example.com/layout-parsing',
              accessToken: 'saved-token',
              defaultFileType: 1,
            },
          },
        },
      },
      error: null,
    })

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
    await waitFor(() => {
      expect(mockSaveFullConfigResult).toHaveBeenCalledTimes(1)
      expect(mockInstallSkillResult).toHaveBeenCalledTimes(1)
    })
    expect(mockSaveFullConfigResult.mock.invocationCallOrder[0]).toBeLessThan(mockInstallSkillResult.mock.invocationCallOrder[0])
  })

  it('parses an uploaded PDF source and sends the base64 payload with the detected file type', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('https://example.com/layout-parsing')).toBeInTheDocument()
    const uploadToggle = screen.getByRole('button', { name: 'Upload file' })
    fireEvent.click(uploadToggle)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(fileInput).not.toBeNull()

    const file = new File(['pdf-binary'], 'statement.pdf', { type: 'application/pdf' })
    await fireEvent.change(fileInput!, { target: { files: [file] } })

    expect(await screen.findByText('statement.pdf')).toBeInTheDocument()
    expect(screen.getByText('Detected type: PDF')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Parse Document' }))

    await waitFor(() => {
      expect(mockParsePaddleOcrResult).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: 'https://example.com/layout-parsing',
        accessToken: 'saved-token',
        fileType: 0,
        file: expect.any(String),
      }))
    })
  })

  it('runs a sample parse and renders markdown output', async () => {
    mockGetConfigResult.mockResolvedValueOnce({
      success: true,
      data: {
        models: { providers: {} },
        ocr: {
          providers: {
            paddleocr: {
              endpoint: 'https://example.com/layout-parsing',
              accessToken: 'saved-token',
              defaultFileType: 1,
            },
          },
        },
      },
      error: null,
    })

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
