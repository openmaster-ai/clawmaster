#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_TEST_FILE =
  'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/ch_doc1.jpg'

const DEFAULT_OPTIONS = {
  fileType: 1,
  useDocOrientationClassify: true,
  useDocUnwarping: false,
  useLayoutDetection: true,
  useChartRecognition: false,
  restructurePages: false,
  mergeTables: true,
  relevelTitles: true,
  prettifyMarkdown: true,
  visualize: false,
}

const PRESETS = {
  'clean-pdf': {
    fileType: 0,
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useLayoutDetection: false,
    restructurePages: true,
    mergeTables: true,
    relevelTitles: true,
    prettifyMarkdown: true,
    visualize: false,
  },
  'mobile-scan': {
    fileType: 1,
    useDocOrientationClassify: true,
    useDocUnwarping: true,
    useLayoutDetection: true,
    useChartRecognition: false,
    restructurePages: false,
    prettifyMarkdown: true,
    visualize: false,
  },
  'layout-debug': {
    useLayoutDetection: true,
    visualize: true,
  },
}

const BOOLEAN_KEYS = new Set([
  'useDocOrientationClassify',
  'useDocUnwarping',
  'useLayoutDetection',
  'useChartRecognition',
  'restructurePages',
  'mergeTables',
  'relevelTitles',
  'prettifyMarkdown',
  'visualize',
  'pretty',
])

const FLAG_ALIASES = {
  token: 'accessToken',
  'access-token': 'accessToken',
  endpoint: 'endpoint',
  file: 'file',
  'file-type': 'fileType',
  preset: 'preset',
  output: 'output',
  'markdown-out': 'markdownOut',
  config: 'config',
  'sample-file': 'sampleFile',
  pretty: 'pretty',
  orientation: 'useDocOrientationClassify',
  unwarp: 'useDocUnwarping',
  layout: 'useLayoutDetection',
  chart: 'useChartRecognition',
  restructure: 'restructurePages',
  'merge-tables': 'mergeTables',
  'relevel-titles': 'relevelTitles',
  prettify: 'prettifyMarkdown',
  'use-doc-orientation-classify': 'useDocOrientationClassify',
  'use-doc-unwarping': 'useDocUnwarping',
  'use-layout-detection': 'useLayoutDetection',
  'use-chart-recognition': 'useChartRecognition',
  'restructure-pages': 'restructurePages',
  'prettify-markdown': 'prettifyMarkdown',
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeFlagName(input) {
  const raw = input.trim()
  if (!raw) return ''
  if (FLAG_ALIASES[raw]) return FLAG_ALIASES[raw]
  return raw.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  throw new Error(`Invalid boolean value: ${value}`)
}

function parseFileType(value) {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = String(value).trim().toLowerCase()
  if (normalized === '0' || normalized === 'pdf') return 0
  if (normalized === '1' || normalized === 'image') return 1
  throw new Error(`Invalid file type: ${value}`)
}

function expandHome(value) {
  if (!value) return value
  if (value === '~') return os.homedir()
  if (value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function defaultConfigPath() {
  return (
    process.env.OPENCLAW_CONFIG_PATH ||
    process.env.OPENCLAW_CONFIG ||
    path.join(os.homedir(), '.openclaw', 'openclaw.json')
  )
}

function parseArgs(argv) {
  const options = { positionals: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      options.positionals.push(current)
      continue
    }

    if (current === '--help' || current === '-h') {
      options.help = true
      continue
    }

    const withoutPrefix = current.slice(2)
    const [rawName, inlineValue] = withoutPrefix.split(/=(.*)/s)
    const isNegated = rawName.startsWith('no-')
    const flagName = normalizeFlagName(isNegated ? rawName.slice(3) : rawName)
    if (!flagName) continue

    if (isNegated) {
      options[flagName] = false
      continue
    }

    if (inlineValue !== undefined) {
      options[flagName] = BOOLEAN_KEYS.has(flagName) ? parseBoolean(inlineValue) : inlineValue
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      options[flagName] = BOOLEAN_KEYS.has(flagName) ? true : ''
      continue
    }

    options[flagName] = BOOLEAN_KEYS.has(flagName) ? parseBoolean(next) : next
    index += 1
  }

  if (!options.file && options.positionals.length > 0) {
    options.file = options.positionals[0]
  }

  return options
}

function loadConfig(configPathOverride) {
  const resolvedPath = path.resolve(expandHome(configPathOverride || defaultConfigPath()))
  const config = readJsonFile(resolvedPath)
  return {
    path: resolvedPath,
    config: isRecord(config) ? config : {},
  }
}

function deriveToken(config) {
  const providers = isRecord(config.models) && isRecord(config.models.providers)
    ? config.models.providers
    : {}
  const baiduProvider = isRecord(providers['baidu-aistudio']) ? providers['baidu-aistudio'] : {}
  if (typeof baiduProvider.apiKey === 'string' && baiduProvider.apiKey.trim()) return baiduProvider.apiKey.trim()
  if (typeof baiduProvider.api_key === 'string' && baiduProvider.api_key.trim()) return baiduProvider.api_key.trim()
  return ''
}

function resolveRuntimeSettings(options) {
  const { config } = loadConfig(options.config)
  const ocrProviders = isRecord(config.ocr) && isRecord(config.ocr.providers)
    ? config.ocr.providers
    : {}
  const ocrProvider = isRecord(ocrProviders.paddleocr) ? ocrProviders.paddleocr : {}
  const presetName = typeof options.preset === 'string' ? options.preset.trim().toLowerCase() : ''
  const presetOptions = isRecord(PRESETS[presetName]) ? PRESETS[presetName] : {}

  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...Object.fromEntries(
      Object.entries(DEFAULT_OPTIONS).map(([key]) => [
        key,
        key in ocrProvider ? ocrProvider[key] : DEFAULT_OPTIONS[key],
      ]),
    ),
    ...presetOptions,
  }

  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    if (key in options) {
      mergedOptions[key] = key === 'fileType'
        ? parseFileType(options[key])
        : parseBoolean(options[key])
    }
  }

  const endpoint = [
    options.endpoint,
    process.env.PADDLEOCR_ENDPOINT,
    typeof ocrProvider.endpoint === 'string' ? ocrProvider.endpoint : '',
  ].find((value) => typeof value === 'string' && value.trim())

  const accessToken = [
    options.accessToken,
    process.env.PADDLEOCR_TOKEN,
    typeof ocrProvider.accessToken === 'string' ? ocrProvider.accessToken : '',
    deriveToken(config),
  ].find((value) => typeof value === 'string' && value.trim())

  if (!endpoint) {
    throw new Error('Missing PaddleOCR endpoint. Configure ocr.providers.paddleocr.endpoint or pass --endpoint.')
  }
  if (!accessToken) {
    throw new Error('Missing PaddleOCR token. Configure ocr.providers.paddleocr.accessToken, set PADDLEOCR_TOKEN, or pass --token.')
  }

  return {
    endpoint: endpoint.trim(),
    accessToken: accessToken.trim(),
    options: mergedOptions,
    pretty: options.pretty !== false,
  }
}

function inferFileTypeFromPath(input) {
  const lowered = input.toLowerCase()
  if (lowered.endsWith('.pdf')) return 0
  if (/\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(lowered)) return 1
  return undefined
}

function inferFileTypeFromUrl(input) {
  try {
    const parsed = new URL(input)
    return inferFileTypeFromPath(parsed.pathname)
  } catch {
    return undefined
  }
}

function inferFileTypeFromDataUrl(input) {
  const match = input.match(/^data:([^;,]+);base64,/i)
  if (!match) return undefined
  return match[1].toLowerCase() === 'application/pdf' ? 0 : 1
}

async function resolveFileInput(input) {
  if (!input || !String(input).trim()) {
    throw new Error('Missing input file. Pass a local path, URL, data URL, or base64 content.')
  }

  const value = String(input).trim()
  const dataUrlMatch = value.match(/^data:([^;,]+);base64,(.+)$/is)
  if (dataUrlMatch) {
    return {
      file: dataUrlMatch[2],
      inferredFileType: dataUrlMatch[1].toLowerCase() === 'application/pdf' ? 0 : 1,
      source: 'data-url',
    }
  }

  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value)
    if (!response.ok) {
      throw new Error(`Failed to fetch remote file (${response.status}) from ${value}`)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    return {
      file: bytes.toString('base64'),
      inferredFileType: inferFileTypeFromUrl(value),
      source: 'remote-url',
    }
  }

  const expanded = expandHome(value)
  const resolvedPath = path.resolve(expanded)
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return {
      file: fs.readFileSync(resolvedPath).toString('base64'),
      inferredFileType: inferFileTypeFromPath(resolvedPath),
      source: 'local-file',
      resolvedPath,
    }
  }

  return {
    file: value,
    inferredFileType: inferFileTypeFromDataUrl(value),
    source: 'base64',
  }
}

function buildPayload(runtimeOptions, fileInput, fileType) {
  const payload = {
    file: fileInput.file,
    fileType,
  }

  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    if (key === 'fileType') continue
    if (typeof runtimeOptions[key] === 'boolean') {
      payload[key] = runtimeOptions[key]
    }
  }

  return payload
}

async function postPaddleOcr(endpoint, accessToken, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `token ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const rawText = await response.text()
  let parsed = null
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const errorMessage =
      parsed && typeof parsed.errorMsg === 'string'
        ? parsed.errorMsg
        : rawText.slice(0, 240) || 'Unknown error'
    throw new Error(`PaddleOCR request failed (${response.status}): ${errorMessage}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('PaddleOCR response was not valid JSON')
  }

  if (typeof parsed.errorCode === 'number' && parsed.errorCode !== 0) {
    const message = typeof parsed.errorMsg === 'string' ? parsed.errorMsg : 'Unknown error'
    throw new Error(`PaddleOCR error ${parsed.errorCode}: ${message}`)
  }

  return parsed.result ?? parsed
}

function mergeMarkdown(result) {
  const pages = Array.isArray(result.layoutParsingResults) ? result.layoutParsingResults : []
  return pages
    .map((page, index) => {
      const text = page?.markdown?.text?.trim() || ''
      return text ? `<!-- Page ${index + 1} -->\n${text}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

async function writeIfNeeded(filePath, content) {
  if (!filePath) return
  const resolvedPath = path.resolve(expandHome(filePath))
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
  fs.writeFileSync(resolvedPath, content, 'utf8')
}

function printHelp(command) {
  const body = command === 'test'
    ? [
        'Usage: node test-connection.mjs [options]',
        '',
        'Options:',
        '  --endpoint <url>       Override PaddleOCR endpoint',
        '  --token <value>        Override PaddleOCR token',
        '  --sample-file <value>  Sample URL, base64, data URL, or local path',
        '  --file-type <pdf|image|0|1>',
        '  --pretty <bool>        Pretty-print JSON output (default: true)',
      ]
    : [
        'Usage: node parse-document.mjs <file> [options]',
        '',
        'Options:',
        '  --endpoint <url>             Override PaddleOCR endpoint',
        '  --token <value>              Override PaddleOCR token',
        '  --preset <name>              clean-pdf | mobile-scan | layout-debug',
        '  --file-type <pdf|image|0|1>',
        '  --output <path>              Write JSON output to disk',
        '  --markdown-out <path>        Write merged markdown to disk',
        '  --use-layout-detection',
        '  --no-use-layout-detection',
        '  --visualize',
        '  --no-visualize',
      ]
  process.stdout.write(`${body.join('\n')}\n`)
}

export async function runCommand(command, argv) {
  const parsed = parseArgs(argv)
  if (parsed.help) {
    printHelp(command)
    return
  }

  const runtime = resolveRuntimeSettings(parsed)
  const inputValue =
    command === 'test'
      ? parsed.sampleFile || parsed.file || DEFAULT_TEST_FILE
      : parsed.file
  const fileInput = await resolveFileInput(inputValue)
  const resolvedFileType = parseFileType(parsed.fileType) ??
    fileInput.inferredFileType ??
    runtime.options.fileType

  const payload = buildPayload(runtime.options, fileInput, resolvedFileType)
  const result = await postPaddleOcr(runtime.endpoint, runtime.accessToken, payload)

  const pages = Array.isArray(result.layoutParsingResults) ? result.layoutParsingResults.length : 0
  const output =
    command === 'test'
      ? {
          ok: true,
          sampleFile: inputValue,
          pageCount: pages,
          resolvedFileType,
        }
      : {
          ok: true,
          pageCount: pages,
          resolvedFileType,
          source: fileInput.source,
          markdown: mergeMarkdown(result),
          result,
        }

  if (command === 'parse') {
    await writeIfNeeded(parsed.output, JSON.stringify(output, null, 2))
    await writeIfNeeded(parsed.markdownOut, output.markdown)
  }

  process.stdout.write(`${JSON.stringify(output, null, runtime.pretty ? 2 : 0)}\n`)
}

export async function runAndExit(command, argv) {
  try {
    await runCommand(command, argv)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
