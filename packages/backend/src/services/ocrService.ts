import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_TEST_FILE =
  'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/ch_doc1.jpg'

export interface PaddleOcrParseRequest {
  endpoint: string
  accessToken: string
  file: string
  fileType?: 0 | 1
  useDocOrientationClassify?: boolean
  useDocUnwarping?: boolean
  useLayoutDetection?: boolean
  useChartRecognition?: boolean
  restructurePages?: boolean
  mergeTables?: boolean
  relevelTitles?: boolean
  prettifyMarkdown?: boolean
  visualize?: boolean
}

export interface PaddleOcrTestRequest extends Omit<PaddleOcrParseRequest, 'file'> {
  file?: string
}

export interface PaddleOcrParseResult {
  layoutParsingResults: Array<{
    prunedResult?: unknown
    markdown: {
      text: string
      images: Record<string, string>
    }
    outputImages?: Record<string, string> | null
    inputImage?: string | null
  }>
  dataInfo?: Record<string, unknown>
}

export interface PaddleOcrTestResult {
  ok: boolean
  sampleFile: string
  pageCount: number
}

function validationError(message: string): Error {
  const error = new Error(message)
  error.name = 'PaddleOcrValidationError'
  return error
}

function isRemoteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function normalizeDataUrlFile(value: string): string {
  const match = value.match(/^data:[^;]+;base64,(.+)$/i)
  return match ? match[1].trim() : value
}

async function fetchRemoteFileAsBase64(value: string): Promise<string> {
  const response = await fetch(value)
  if (!response.ok) {
    throw new Error(`Failed to fetch remote OCR file (${response.status})`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return Buffer.from(bytes).toString('base64')
}

function normalizeEndpoint(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) {
    throw validationError('Missing PaddleOCR endpoint')
  }
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw validationError(`Unsupported PaddleOCR endpoint protocol: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw validationError('PaddleOCR endpoint must not include credentials')
  }
  return url
}

function normalizeAccessToken(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw validationError('Missing PaddleOCR access token')
  }
  return trimmed
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeFileType(value: unknown): 0 | 1 | undefined {
  return value === 0 || value === 1 ? value : undefined
}

function buildPayload(
  input: PaddleOcrParseRequest | PaddleOcrTestRequest,
  fallbackFile: string,
) {
  const payload: Record<string, unknown> = {
    file: (typeof input.file === 'string' && input.file.trim()) || fallbackFile,
  }
  const fileType = normalizeFileType(input.fileType)
  if (fileType !== undefined) payload.fileType = fileType

  const toggles: Array<keyof PaddleOcrParseRequest> = [
    'useDocOrientationClassify',
    'useDocUnwarping',
    'useLayoutDetection',
    'useChartRecognition',
    'restructurePages',
    'mergeTables',
    'relevelTitles',
    'prettifyMarkdown',
    'visualize',
  ]

  for (const key of toggles) {
    const value = normalizeBoolean(input[key])
    if (value !== undefined) {
      payload[key] = value
    }
  }

  return payload
}

async function writePayloadTempFile(payload: Record<string, unknown>): Promise<string> {
  const filePath = path.join(os.tmpdir(), `clawmaster-paddleocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  await fs.writeFile(filePath, JSON.stringify(payload), 'utf8')
  return filePath
}

async function postPaddleOcr(
  input: PaddleOcrParseRequest | PaddleOcrTestRequest,
  fallbackFile: string,
) {
  const endpoint = normalizeEndpoint(input.endpoint)
  const accessToken = normalizeAccessToken(input.accessToken)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)

  try {
    const rawFile = ((typeof input.file === 'string' && input.file.trim()) || fallbackFile)
    const normalizedFile = isRemoteHttpUrl(rawFile)
      ? await fetchRemoteFileAsBase64(rawFile)
      : normalizeDataUrlFile(rawFile)

    const payloadFile = await writePayloadTempFile(buildPayload({ ...input, file: normalizedFile }, normalizedFile))
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `token ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: await fs.readFile(payloadFile, 'utf8'),
        signal: controller.signal,
      })

      const body = await response.text()
      let parsed: unknown = null
      try {
        parsed = body ? JSON.parse(body) : null
      } catch {
        parsed = null
      }

      if (!response.ok) {
        const errorMsg =
          parsed && typeof parsed === 'object' && parsed !== null && typeof (parsed as { errorMsg?: unknown }).errorMsg === 'string'
            ? (parsed as { errorMsg: string }).errorMsg
            : body.slice(0, 240)
        throw new Error(`PaddleOCR request failed (${response.status}): ${errorMsg || 'Unknown error'}`)
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('PaddleOCR response was not valid JSON')
      }

      const errorCode = (parsed as { errorCode?: unknown }).errorCode
      const errorMsg = typeof (parsed as { errorMsg?: unknown }).errorMsg === 'string'
        ? (parsed as { errorMsg: string }).errorMsg
        : 'Unknown error'
      if (typeof errorCode === 'number' && errorCode !== 0) {
        throw new Error(`PaddleOCR error ${errorCode}: ${errorMsg}`)
      }

      return parsed as { result?: unknown }
    } finally {
      await fs.rm(payloadFile, { force: true })
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function testPaddleOcrConnection(input: PaddleOcrTestRequest): Promise<PaddleOcrTestResult> {
  const sampleFile =
    (typeof input.file === 'string' && input.file.trim()) ||
    DEFAULT_TEST_FILE
  const payload = await postPaddleOcr(
    {
      ...input,
      file: sampleFile,
      fileType: normalizeFileType(input.fileType) ?? 1,
      visualize: false,
    },
    sampleFile,
  )
  const result = (payload.result ?? {}) as PaddleOcrParseResult
  return {
    ok: true,
    sampleFile,
    pageCount: Array.isArray(result.layoutParsingResults) ? result.layoutParsingResults.length : 0,
  }
}

export async function parsePaddleOcrDocument(input: PaddleOcrParseRequest): Promise<PaddleOcrParseResult> {
  const payload = await postPaddleOcr(input, input.file)
  const result = payload.result
  if (!result || typeof result !== 'object') {
    throw new Error('PaddleOCR response did not contain a result payload')
  }
  return result as PaddleOcrParseResult
}

export function getDefaultPaddleOcrTestFile() {
  return DEFAULT_TEST_FILE
}
