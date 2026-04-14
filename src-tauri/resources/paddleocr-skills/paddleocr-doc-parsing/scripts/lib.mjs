import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_TIMEOUT = 600 // seconds
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

function getEnv(key, ...fallbackKeys) {
  const direct = (process.env[key] || '').trim()
  if (direct) return direct
  for (const fallback of fallbackKeys) {
    const value = (process.env[fallback] || '').trim()
    if (value) return value
  }
  return ''
}

export function getConfig() {
  let apiUrl = getEnv('PADDLEOCR_DOC_PARSING_API_URL')
  const token = getEnv('PADDLEOCR_ACCESS_TOKEN')

  if (!apiUrl) {
    throw new Error(
      `PADDLEOCR_DOC_PARSING_API_URL not configured. Get your API at: ${API_GUIDE_URL}`,
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

  if (!apiPath.endsWith('/layout-parsing')) {
    throw new Error(
      'PADDLEOCR_DOC_PARSING_API_URL must be a full endpoint ending with /layout-parsing. '
        + 'Example: https://your-service.paddleocr.com/layout-parsing',
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
      // ignore URL parsing errors and fall back to raw string
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

function extractText(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid response schema: top-level response must be an object')
  }

  const rawResult = result.result
  if (!rawResult || typeof rawResult !== 'object') {
    throw new Error('Invalid response schema: missing result object')
  }

  const pages = rawResult.layoutParsingResults
  if (!Array.isArray(pages)) {
    throw new Error('Invalid response schema: result.layoutParsingResults must be an array')
  }

  const texts = []
  pages.forEach((page, index) => {
    if (!page || typeof page !== 'object') {
      throw new Error(
        `Invalid response schema: result.layoutParsingResults[${index}] must be an object`,
      )
    }
    const markdown = page.markdown
    if (!markdown || typeof markdown !== 'object') {
      throw new Error(
        `Invalid response schema: result.layoutParsingResults[${index}].markdown must be an object`,
      )
    }
    const text = markdown.text
    if (typeof text !== 'string') {
      throw new Error(
        `Invalid response schema: result.layoutParsingResults[${index}].markdown.text must be a string`,
      )
    }
    texts.push(text)
  })

  return texts.join('\n\n')
}

function errorResult(code, message) {
  return {
    ok: false,
    text: '',
    result: null,
    error: { code, message },
  }
}

export async function parseDocument({
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
      }
    } else {
      params = { file: await loadFileAsBase64(filePath) }
      resolvedFileType = fileType !== null && fileType !== undefined
        ? fileType
        : detectFileType(filePath)
    }

    params = { ...params, ...options }
    if (resolvedFileType !== null && resolvedFileType !== undefined) {
      params.fileType = resolvedFileType
    } else if (fileUrl) {
      delete params.fileType
    }
  } catch (err) {
    return errorResult('INPUT_ERROR', err.message || String(err))
  }

  let result
  try {
    const timeout = Number(process.env.PADDLEOCR_DOC_PARSING_TIMEOUT || DEFAULT_TIMEOUT)
    result = await makeApiRequest(apiUrl, token, params, timeout)
  } catch (err) {
    return errorResult('API_ERROR', err.message || String(err))
  }

  let text
  try {
    text = extractText(result)
  } catch (err) {
    return errorResult('API_ERROR', err.message || String(err))
  }

  return {
    ok: true,
    text,
    result,
    error: null,
  }
}

export { FILE_TYPE_IMAGE, FILE_TYPE_PDF }
