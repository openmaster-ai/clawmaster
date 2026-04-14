import fs from 'node:fs/promises'

const DEFAULT_TIMEOUT = 120 // seconds
const API_GUIDE_URL = 'https://paddleocr.com'
const FILE_TYPE_PDF = 0
const FILE_TYPE_IMAGE = 1
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.bmp',
  '.tiff',
  '.tif',
  '.webp',
])

function getEnv(key) {
  return (process.env[key] || '').trim()
}

export function getConfig() {
  let apiUrl = getEnv('PADDLEOCR_OCR_API_URL')
  const token = getEnv('PADDLEOCR_ACCESS_TOKEN')

  if (!apiUrl) {
    throw new Error(
      `PADDLEOCR_OCR_API_URL not configured. Get your API at: ${API_GUIDE_URL}`,
    )
  }
  if (!token) {
    throw new Error(
      `PADDLEOCR_ACCESS_TOKEN not configured. Get your API at: ${API_GUIDE_URL}`,
    )
  }

  if (!/^https?:\/\//i.test(apiUrl)) {
    apiUrl = `https://${apiUrl}`
  }

  let apiPath = ''
  try {
    apiPath = new URL(apiUrl).pathname.replace(/\/+$/, '')
  } catch {
    apiPath = ''
  }

  if (!apiPath.endsWith('/ocr')) {
    throw new Error(
      'PADDLEOCR_OCR_API_URL must be a full endpoint ending with /ocr. '
        + 'Example: https://your-service.paddleocr.com/ocr',
    )
  }

  return { apiUrl, token }
}

function detectFileType(pathOrUrl) {
  let target = String(pathOrUrl || '').toLowerCase()
  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      target = decodeURIComponent(new URL(target).pathname.toLowerCase())
    } catch {
      // ignore URL parsing errors
    }
  }

  if (target.endsWith('.pdf')) return FILE_TYPE_PDF
  for (const ext of IMAGE_EXTENSIONS) {
    if (target.endsWith(ext)) return FILE_TYPE_IMAGE
  }
  throw new Error(`Unsupported file format: ${pathOrUrl}`)
}

async function loadFileAsBase64(filePath) {
  try {
    const data = await fs.readFile(filePath)
    return data.toString('base64')
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`)
    }
    throw err
  }
}

async function makeApiRequest(apiUrl, token, params, timeoutSeconds) {
  const headers = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
    'Client-Platform': 'official-skill',
  }

  const controller = new AbortController()
  const timeoutMs = Math.max(0, Number(timeoutSeconds) || DEFAULT_TIMEOUT) * 1000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    })
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeoutSeconds}s`)
    }
    throw new Error(`API request failed: ${err && err.message ? err.message : err}`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    let errorDetail = ''
    let bodyText = ''
    try {
      bodyText = await response.text()
      const parsed = JSON.parse(bodyText)
      if (parsed && typeof parsed === 'object') {
        errorDetail = String(parsed.errorMsg || '').trim()
      }
    } catch {
      // ignore JSON parse errors
    }

    if (!errorDetail) {
      errorDetail = (bodyText || 'No response body').trim().slice(0, 200)
    }

    if (response.status === 403) {
      throw new Error(`Authentication failed (403): ${errorDetail}`)
    }
    if (response.status === 429) {
      throw new Error(`API rate limit exceeded (429): ${errorDetail}`)
    }
    if (response.status >= 500) {
      throw new Error(`API service error (${response.status}): ${errorDetail}`)
    }
    throw new Error(`API error (${response.status}): ${errorDetail}`)
  }

  let result
  try {
    result = await response.json()
  } catch {
    const text = await response.text().catch(() => '')
    throw new Error(`Invalid JSON response: ${(text || '').slice(0, 200)}`)
  }

  if (result && typeof result === 'object' && (result.errorCode || 0) !== 0) {
    throw new Error(`API error: ${result.errorMsg || 'Unknown error'}`)
  }

  return result
}

function errorResult(code, message) {
  return {
    ok: false,
    text: '',
    result: null,
    error: { code, message },
  }
}

function extractText(result) {
  const rawResult = result && typeof result === 'object' ? (result.result || result) : result
  let pages = []
  if (rawResult && typeof rawResult === 'object' && Array.isArray(rawResult.ocrResults)) {
    pages = rawResult.ocrResults
  } else if (Array.isArray(rawResult)) {
    pages = rawResult
  }

  const allText = []
  for (const item of pages) {
    if (!item || typeof item !== 'object') continue
    const texts = item.prunedResult && Array.isArray(item.prunedResult.rec_texts)
      ? item.prunedResult.rec_texts
      : []
    if (texts.length) {
      allText.push(texts.join('\n'))
    }
  }
  return allText.join('\n\n')
}

export async function ocr({
  filePath = null,
  fileUrl = null,
  fileType = null,
  ...options
} = {}) {
  if (!filePath && !fileUrl) {
    return errorResult('INPUT_ERROR', 'file_path or file_url required')
  }
  if (fileType !== null && fileType !== undefined && fileType !== FILE_TYPE_PDF && fileType !== FILE_TYPE_IMAGE) {
    return errorResult('INPUT_ERROR', 'file_type must be 0 (PDF) or 1 (Image)')
  }

  let apiUrl
  let token
  try {
    const config = getConfig()
    apiUrl = config.apiUrl
    token = config.token
  } catch (err) {
    return errorResult('CONFIG_ERROR', err.message || String(err))
  }

  let params
  let resolvedFileType = null
  try {
    if (fileUrl) {
      params = { file: fileUrl }
      if (fileType !== null && fileType !== undefined) {
        resolvedFileType = fileType
      } else {
        try {
          resolvedFileType = detectFileType(fileUrl)
        } catch {
          resolvedFileType = null
        }
      }
    } else {
      params = { file: await loadFileAsBase64(filePath) }
      resolvedFileType = fileType !== null && fileType !== undefined
        ? fileType
        : detectFileType(filePath)
    }

    params = { visualize: false, ...params, ...options }
    if (resolvedFileType !== null && resolvedFileType !== undefined) {
      params.fileType = resolvedFileType
    } else {
      delete params.fileType
    }
  } catch (err) {
    return errorResult('INPUT_ERROR', err.message || String(err))
  }

  let result
  try {
    const timeout = Number(process.env.PADDLEOCR_OCR_TIMEOUT || DEFAULT_TIMEOUT)
    result = await makeApiRequest(apiUrl, token, params, timeout)
  } catch (err) {
    return errorResult('API_ERROR', err.message || String(err))
  }

  const text = extractText(result)
  return {
    ok: true,
    text,
    result,
    error: null,
  }
}

export { FILE_TYPE_IMAGE, FILE_TYPE_PDF }
