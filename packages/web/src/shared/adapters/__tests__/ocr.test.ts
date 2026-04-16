import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../invoke', () => ({
  tauriInvoke: vi.fn(),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
}))

describe('ocr adapter', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getIsTauri } = await import('../platform')
    vi.mocked(getIsTauri).mockReturnValue(false)
  })

  it('parses documents through the web OCR route', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({
      success: true,
      data: { layoutParsingResults: [] },
      error: null,
    })

    const { parsePaddleOcrResult } = await import('../ocr')
    const result = await parsePaddleOcrResult({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'token',
      file: 'https://example.com/sample.jpg',
      fileType: 1,
    })

    expect(result.success).toBe(true)
    expect(webFetchJson).toHaveBeenCalledWith('/api/ocr/paddleocr/parse', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('wraps uploaded base64 payloads as data URLs before invoking tauri OCR parsing', async () => {
    const { getIsTauri } = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    vi.mocked(getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({ layoutParsingResults: [] })

    const { parsePaddleOcrResult } = await import('../ocr')
    const result = await parsePaddleOcrResult({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'token',
      file: 'raw-base64-payload',
      fileType: 0,
    })

    expect(result.success).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('paddleocr_parse_document', {
      payload: {
        endpoint: 'https://example.com/layout-parsing',
        accessToken: 'token',
        file: 'data:application/pdf;base64,raw-base64-payload',
        fileType: 0,
      },
    })
  })

  it('routes desktop OCR parsing through the dedicated tauri command', async () => {
    const { getIsTauri } = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    vi.mocked(getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({ layoutParsingResults: [] })

    const { parsePaddleOcrResult } = await import('../ocr')
    const result = await parsePaddleOcrResult({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'token',
      file: 'https://example.com/sample.jpg',
      fileType: 1,
    })

    expect(result.success).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('paddleocr_parse_document', {
      payload: {
        endpoint: 'https://example.com/layout-parsing',
        accessToken: 'token',
        file: 'https://example.com/sample.jpg',
        fileType: 1,
      },
    })
  })

  it('routes desktop OCR connection tests through the dedicated tauri command', async () => {
    const { getIsTauri } = await import('../platform')
    const { tauriInvoke } = await import('../invoke')
    vi.mocked(getIsTauri).mockReturnValue(true)
    vi.mocked(tauriInvoke).mockResolvedValue({
      ok: true,
      sampleFile: 'https://example.com/sample.jpg',
      pageCount: 1,
    })

    const { testPaddleOcrResult } = await import('../ocr')
    const result = await testPaddleOcrResult({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'token',
    })

    expect(result.success).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('paddleocr_test_connection', {
      payload: {
        endpoint: 'https://example.com/layout-parsing',
        accessToken: 'token',
      },
    })
  })
})
