import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readConfigJsonOrEmpty, updateConfigJson } from '../configJson.js'
import { getOpenclawDataDir } from '../paths.js'
import { isRecord } from '../serverUtils.js'

export const PADDLEOCR_TEXT_SKILL_ID = 'paddleocr-text-recognition' as const
export const PADDLEOCR_DOC_SKILL_ID = 'paddleocr-doc-parsing' as const
export const PADDLEOCR_SKILL_IDS = [
  PADDLEOCR_TEXT_SKILL_ID,
  PADDLEOCR_DOC_SKILL_ID,
] as const

export type PaddleOcrModuleId = (typeof PADDLEOCR_SKILL_IDS)[number]

export interface PaddleOcrModuleStatus {
  configured: boolean
  enabled: boolean
  missing: boolean
  apiUrlConfigured: boolean
  accessTokenConfigured: boolean
  apiUrl?: string
}

export interface PaddleOcrStatusPayload {
  configured: boolean
  enabledModules: PaddleOcrModuleId[]
  missingModules: PaddleOcrModuleId[]
  textRecognition: PaddleOcrModuleStatus
  docParsing: PaddleOcrModuleStatus
}

export interface PaddleOcrSetupInput {
  moduleId: PaddleOcrModuleId
  apiUrl: string
  accessToken: string
}

export interface PaddleOcrClearInput {
  moduleId: PaddleOcrModuleId
}

export interface PaddleOcrPreviewPayload {
  moduleId: PaddleOcrModuleId
  apiUrl: string
  latencyMs: number
  pageCount: number
  textLineCount: number
  extractedText: string
  responsePreview: string
}

type OpenClawSkillEntry = {
  enabled?: boolean
  apiKey?: unknown
  env?: Record<string, unknown>
  config?: Record<string, unknown>
}

type PaddleOcrServiceDeps = {
  assetRoot?: string
  skillsDir?: string
  fetchImpl?: typeof fetch
  now?: () => number
  sampleImageBase64?: string
  sampleImagePath?: string
  resourceDir?: string
  validateCredentials?: (
    moduleId: PaddleOcrModuleId,
    apiUrl: string,
    accessToken: string,
  ) => Promise<void>
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PADDLEOCR_RESOURCE_ENV_KEY = 'CLAWMASTER_RESOURCE_DIR'
const PADDLEOCR_RESOURCE_RELATIVE = path.join('src-tauri', 'resources')
const PADDLEOCR_ASSET_DIRNAME = 'paddleocr-skills'
const PADDLEOCR_SAMPLE_IMAGE_RELATIVE = path.join(
  'paddleocr-preview',
  'sample_image.base64',
)
let cachedResourceDir: string | undefined
let cachedSampleImageBase64: string | undefined

const MODULE_ENDPOINT_SUFFIX: Record<PaddleOcrModuleId, string> = {
  [PADDLEOCR_TEXT_SKILL_ID]: '/ocr',
  [PADDLEOCR_DOC_SKILL_ID]: '/layout-parsing',
}

const MODULE_API_ENV_KEY: Record<PaddleOcrModuleId, string> = {
  [PADDLEOCR_TEXT_SKILL_ID]: 'PADDLEOCR_OCR_API_URL',
  [PADDLEOCR_DOC_SKILL_ID]: 'PADDLEOCR_DOC_PARSING_API_URL',
}

const MODULE_TIMEOUT_ENV_KEY: Record<PaddleOcrModuleId, string> = {
  [PADDLEOCR_TEXT_SKILL_ID]: 'PADDLEOCR_OCR_TIMEOUT',
  [PADDLEOCR_DOC_SKILL_ID]: 'PADDLEOCR_DOC_PARSING_TIMEOUT',
}

const MODULE_TIMEOUT_DEFAULT: Record<PaddleOcrModuleId, string> = {
  [PADDLEOCR_TEXT_SKILL_ID]: '120',
  [PADDLEOCR_DOC_SKILL_ID]: '600',
}

const MODULE_VALIDATION_LABEL: Record<PaddleOcrModuleId, string> = {
  [PADDLEOCR_TEXT_SKILL_ID]: 'PaddleOCR text recognition',
  [PADDLEOCR_DOC_SKILL_ID]: 'PaddleOCR document parsing',
}

function appendIfMissing(values: string[], candidate: string): void {
  const resolved = path.resolve(candidate)
  if (!values.includes(resolved)) {
    values.push(resolved)
  }
}

function collectSearchAncestors(startDir: string): string[] {
  const ancestors: string[] = []
  let current = path.resolve(startDir)
  while (true) {
    appendIfMissing(ancestors, current)
    const parent = path.dirname(current)
    if (parent === current) {
      return ancestors
    }
    current = parent
  }
}

function isBundledResourceDir(candidate: string): boolean {
  return (
    fs.existsSync(path.join(candidate, PADDLEOCR_ASSET_DIRNAME)) &&
    fs.existsSync(path.join(candidate, PADDLEOCR_SAMPLE_IMAGE_RELATIVE))
  )
}

function resolveBundledResourceDir(explicitResourceDir?: string): string {
  if (explicitResourceDir) {
    const resolved = path.resolve(explicitResourceDir)
    if (!isBundledResourceDir(resolved)) {
      throw new Error(`Bundled PaddleOCR resources are missing from ${resolved}`)
    }
    return resolved
  }

  if (cachedResourceDir !== undefined) {
    return cachedResourceDir
  }

  const candidates: string[] = []
  const resourceEnv = process.env[PADDLEOCR_RESOURCE_ENV_KEY]
  if (resourceEnv?.trim()) {
    appendIfMissing(candidates, resourceEnv.trim())
  }

  for (const baseDir of [process.cwd(), __dirname]) {
    for (const ancestor of collectSearchAncestors(baseDir)) {
      appendIfMissing(candidates, path.join(ancestor, PADDLEOCR_RESOURCE_RELATIVE))
      appendIfMissing(candidates, path.join(ancestor, 'resources'))
    }
  }

  for (const candidate of candidates) {
    if (isBundledResourceDir(candidate)) {
      cachedResourceDir = candidate
      return candidate
    }
  }

  throw new Error(
    `Bundled PaddleOCR resources are missing from this build. Checked: ${candidates.join(', ')}`,
  )
}

function getDefaultAssetRoot(resourceDir?: string): string {
  return path.join(resolveBundledResourceDir(resourceDir), PADDLEOCR_ASSET_DIRNAME)
}

function resolveSampleImagePath(
  explicitSampleImagePath?: string,
  resourceDir?: string,
): string {
  if (explicitSampleImagePath) {
    return path.resolve(explicitSampleImagePath)
  }
  return path.join(
    resolveBundledResourceDir(resourceDir),
    PADDLEOCR_SAMPLE_IMAGE_RELATIVE,
  )
}

function getSampleImageBase64(
  deps: Pick<PaddleOcrServiceDeps, 'sampleImageBase64' | 'sampleImagePath' | 'resourceDir'> = {},
): string {
  if (deps.sampleImageBase64) {
    return deps.sampleImageBase64.replace(/\s+/g, '')
  }

  if (!deps.sampleImagePath && !deps.resourceDir && cachedSampleImageBase64 !== undefined) {
    return cachedSampleImageBase64
  }

  const sampleImagePath = resolveSampleImagePath(deps.sampleImagePath, deps.resourceDir)
  try {
    const encoded = fs.readFileSync(sampleImagePath, 'utf8').replace(/\s+/g, '')
    if (!deps.sampleImagePath && !deps.resourceDir) {
      cachedSampleImageBase64 = encoded
    }
    return encoded
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Bundled PaddleOCR preview image is missing: ${sampleImagePath} (${detail})`)
  }
}

function getDefaultSkillsDir(): string {
  return path.join(getOpenclawDataDir(), 'workspace', 'skills')
}

function ensureRecord(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = parent[key]
  if (isRecord(current)) {
    return current
  }
  const next: Record<string, unknown> = {}
  parent[key] = next
  return next
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizePaddleOcrApiUrl(
  moduleId: PaddleOcrModuleId,
  value: string,
): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('API endpoint is required.')
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Enter a valid PaddleOCR API endpoint.')
  }

  const expectedSuffix = MODULE_ENDPOINT_SUFFIX[moduleId]
  const pathname = trimTrailingSlash(url.pathname || '')
  if (!pathname.endsWith(expectedSuffix)) {
    throw new Error(
      `Enter the full PaddleOCR endpoint ending with ${expectedSuffix}.`,
    )
  }

  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return trimTrailingSlash(url.toString())
}

function getSkillDir(skillsDir: string, moduleId: PaddleOcrModuleId): string {
  return path.join(skillsDir, moduleId)
}

function readSkillEntry(
  config: Record<string, unknown>,
  moduleId: PaddleOcrModuleId,
): OpenClawSkillEntry | null {
  const skills = isRecord(config.skills) ? config.skills : null
  const entries = skills && isRecord(skills.entries) ? skills.entries : null
  const entry = entries && isRecord(entries[moduleId]) ? entries[moduleId] : null
  if (!entry) return null
  return entry as OpenClawSkillEntry
}

function readModuleApiUrlFromEntry(
  entry: OpenClawSkillEntry | null,
  moduleId: PaddleOcrModuleId,
): string | undefined {
  const config = isRecord(entry?.config) ? entry.config : null
  const configUrl = config?.apiUrl
  if (typeof configUrl === 'string' && configUrl.trim()) {
    return normalizePaddleOcrApiUrl(moduleId, configUrl)
  }

  const env = isRecord(entry?.env) ? entry.env : null
  const envKey = MODULE_API_ENV_KEY[moduleId]
  const envUrl = typeof env?.[envKey] === 'string' ? env[envKey] : ''
  if (!envUrl.trim()) return undefined
  return normalizePaddleOcrApiUrl(moduleId, envUrl)
}

function readAccessTokenFromEntry(entry: OpenClawSkillEntry | null): string | undefined {
  if (!entry) return undefined
  if (typeof entry.apiKey === 'string' && entry.apiKey.trim()) return entry.apiKey.trim()
  const config = isRecord(entry.config) ? entry.config : null
  if (config && typeof config.accessToken === 'string' && config.accessToken.trim()) {
    return config.accessToken.trim()
  }
  const env = isRecord(entry.env) ? entry.env : null
  if (
    env &&
    typeof env.PADDLEOCR_ACCESS_TOKEN === 'string' &&
    env.PADDLEOCR_ACCESS_TOKEN.trim()
  ) {
    return env.PADDLEOCR_ACCESS_TOKEN.trim()
  }
  return undefined
}

function hasAccessToken(entry: OpenClawSkillEntry | null): boolean {
  return Boolean(readAccessTokenFromEntry(entry))
}

function buildModuleStatus(
  config: Record<string, unknown>,
  skillsDir: string,
  moduleId: PaddleOcrModuleId,
): PaddleOcrModuleStatus {
  const entry = readSkillEntry(config, moduleId)
  const enabled = entry?.enabled === true
  const missing = !fs.existsSync(getSkillDir(skillsDir, moduleId))
  const accessTokenConfigured = hasAccessToken(entry)
  const apiUrl = readModuleApiUrlFromEntry(entry, moduleId)
  const apiUrlConfigured = Boolean(apiUrl)

  return {
    configured: enabled && !missing && accessTokenConfigured && apiUrlConfigured,
    enabled,
    missing,
    accessTokenConfigured,
    apiUrlConfigured,
    apiUrl,
  }
}

function buildStatusFromConfig(
  config: Record<string, unknown>,
  skillsDir: string,
): PaddleOcrStatusPayload {
  const textRecognition = buildModuleStatus(
    config,
    skillsDir,
    PADDLEOCR_TEXT_SKILL_ID,
  )
  const docParsing = buildModuleStatus(config, skillsDir, PADDLEOCR_DOC_SKILL_ID)

  const enabledModules = PADDLEOCR_SKILL_IDS.filter((moduleId) =>
    moduleId === PADDLEOCR_TEXT_SKILL_ID
      ? textRecognition.enabled
      : docParsing.enabled,
  )

  const missingModules = PADDLEOCR_SKILL_IDS.filter((moduleId) =>
    moduleId === PADDLEOCR_TEXT_SKILL_ID
      ? textRecognition.missing
      : docParsing.missing,
  )

  return {
    configured: textRecognition.configured && docParsing.configured,
    enabledModules,
    missingModules,
    textRecognition,
    docParsing,
  }
}

function copyMissingRecursive(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Bundled PaddleOCR module is missing from this build: ${sourceDir}`)
  }

  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyMissingRecursive(sourcePath, targetPath)
      continue
    }
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function ensureBundledModuleMeta(skillDir: string, moduleId: PaddleOcrModuleId): void {
  const metaPath = path.join(skillDir, '_meta.json')
  if (fs.existsSync(metaPath)) return
  fs.writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        slug: moduleId,
        version: 'bundled',
        source: 'clawmaster-bundled',
        bundled: true,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function ensureBundledPaddleOcrModules(assetRoot: string, skillsDir: string): void {
  fs.mkdirSync(skillsDir, { recursive: true })
  for (const moduleId of PADDLEOCR_SKILL_IDS) {
    const sourceDir = path.join(assetRoot, moduleId)
    const targetDir = getSkillDir(skillsDir, moduleId)
    copyMissingRecursive(sourceDir, targetDir)
    ensureBundledModuleMeta(targetDir, moduleId)
  }
}

function getHttpErrorDetail(payload: unknown, fallbackText: string): string {
  if (isRecord(payload) && typeof payload.errorMsg === 'string' && payload.errorMsg.trim()) {
    return payload.errorMsg.trim()
  }
  return fallbackText.trim() || 'No response body'
}

function getApiErrorCode(payload: unknown): number {
  if (!isRecord(payload)) return 0
  const errorCode = payload.errorCode
  if (typeof errorCode === 'number' && Number.isFinite(errorCode)) return errorCode
  if (typeof errorCode === 'string') {
    const parsed = Number(errorCode)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function shortenText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…`
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function countTextLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length
}

function extractPreviewText(payload: unknown): { extractedText: string; pageCount: number } {
  if (!isRecord(payload)) {
    return { extractedText: '', pageCount: 0 }
  }

  const result = isRecord(payload.result) ? payload.result : null
  if (!result) {
    return {
      extractedText: typeof payload.text === 'string' ? payload.text.trim() : '',
      pageCount: 0,
    }
  }

  const ocrResults = Array.isArray(result.ocrResults) ? result.ocrResults : null
  if (ocrResults) {
    const pageTexts = ocrResults
      .map((page) => {
        const prunedResult =
          isRecord(page) && isRecord(page.prunedResult) ? page.prunedResult : null
        return extractStringArray(prunedResult?.rec_texts).join('\n').trim()
      })
      .filter(Boolean)
    const dataInfo = isRecord(result.dataInfo) ? result.dataInfo : null
    const numPages = typeof dataInfo?.numPages === 'number' ? dataInfo.numPages : undefined
    return {
      extractedText: pageTexts.join('\n\n'),
      pageCount: numPages && numPages > 0 ? numPages : ocrResults.length,
    }
  }

  const layoutParsingResults = Array.isArray(result.layoutParsingResults)
    ? result.layoutParsingResults
    : null
  if (layoutParsingResults) {
    const pageTexts = layoutParsingResults
      .map((page) => {
        const markdown = isRecord(page) && isRecord(page.markdown) ? page.markdown : null
        return typeof markdown?.text === 'string' ? markdown.text.trim() : ''
      })
      .filter(Boolean)
    return {
      extractedText: pageTexts.join('\n\n'),
      pageCount: layoutParsingResults.length,
    }
  }

  return {
    extractedText: typeof payload.text === 'string' ? payload.text.trim() : '',
    pageCount: 0,
  }
}

function formatResponsePreview(payload: unknown): string {
  const previewTarget = isRecord(payload) && isRecord(payload.result)
    ? payload.result
    : payload
  try {
    return shortenText(JSON.stringify(previewTarget, null, 2), 4000)
  } catch {
    return shortenText(String(previewTarget ?? ''), 4000)
  }
}

async function runPaddleOcrRequest(
  moduleId: PaddleOcrModuleId,
  apiUrl: string,
  accessToken: string,
  deps: Pick<
    PaddleOcrServiceDeps,
    'fetchImpl' | 'now' | 'sampleImageBase64' | 'sampleImagePath' | 'resourceDir'
  > = {},
): Promise<{ latencyMs: number; payload: unknown; rawText: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? Date.now
  const sampleImageBase64 = getSampleImageBase64(deps)
  const startedAt = now()
  let response: Response
  try {
    response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${accessToken}`,
        'Content-Type': 'application/json',
        'Client-Platform': 'clawmaster-bundled',
      },
      body: JSON.stringify({
        file: sampleImageBase64,
        fileType: 1,
        visualize: false,
        useDocUnwarping: false,
        useDocOrientationClassify: false,
      }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${MODULE_VALIDATION_LABEL[moduleId]} verification failed: ${detail}`)
  }

  const rawText = await response.text()
  const latencyMs = Math.max(0, now() - startedAt)
  let payload: unknown = null
  try {
    payload = rawText ? JSON.parse(rawText) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = getHttpErrorDetail(payload, rawText)
    if (response.status === 403) {
      throw new Error(`${MODULE_VALIDATION_LABEL[moduleId]} rejected the access token (403).`)
    }
    if (response.status === 429) {
      throw new Error(`${MODULE_VALIDATION_LABEL[moduleId]} quota has been exceeded (429).`)
    }
    if (response.status >= 500) {
      throw new Error(
        `${MODULE_VALIDATION_LABEL[moduleId]} service is temporarily unavailable (${response.status}): ${detail}`,
      )
    }
    throw new Error(
      `${MODULE_VALIDATION_LABEL[moduleId]} verification failed (${response.status}): ${detail}`,
    )
  }

  if (getApiErrorCode(payload) !== 0) {
    const detail =
      isRecord(payload) && typeof payload.errorMsg === 'string' && payload.errorMsg.trim()
        ? payload.errorMsg.trim()
        : 'Unknown API error'
    throw new Error(`${MODULE_VALIDATION_LABEL[moduleId]} verification failed: ${detail}`)
  }

  return {
    latencyMs,
    payload,
    rawText,
  }
}

async function validateSingleEndpoint(
  moduleId: PaddleOcrModuleId,
  apiUrl: string,
  accessToken: string,
  deps: Pick<
    PaddleOcrServiceDeps,
    'fetchImpl' | 'now' | 'sampleImageBase64' | 'sampleImagePath' | 'resourceDir'
  > = {},
): Promise<void> {
  await runPaddleOcrRequest(moduleId, apiUrl, accessToken, deps)
}

function resolveAccessToken(
  inputAccessToken: string,
  entry: OpenClawSkillEntry | null,
): string {
  const accessToken = inputAccessToken.trim() || readAccessTokenFromEntry(entry) || ''
  if (!accessToken) {
    throw new Error('Access Token is required.')
  }
  return accessToken
}

export async function validatePaddleOcrCredentials(
  moduleId: PaddleOcrModuleId,
  apiUrl: string,
  accessToken: string,
  deps: Pick<
    PaddleOcrServiceDeps,
    'fetchImpl' | 'now' | 'sampleImageBase64' | 'sampleImagePath' | 'resourceDir'
  > = {},
): Promise<void> {
  const token = accessToken.trim()
  if (!token) {
    throw new Error('Access Token is required.')
  }

  const normalizedApiUrl = normalizePaddleOcrApiUrl(moduleId, apiUrl)
  await validateSingleEndpoint(moduleId, normalizedApiUrl, token, deps)
}

export function getPaddleOcrStatus(
  deps: Pick<PaddleOcrServiceDeps, 'skillsDir'> = {},
): PaddleOcrStatusPayload {
  const config = readConfigJsonOrEmpty()
  return buildStatusFromConfig(config, deps.skillsDir ?? getDefaultSkillsDir())
}

export async function setupPaddleOcr(
  input: PaddleOcrSetupInput,
  deps: PaddleOcrServiceDeps = {},
): Promise<PaddleOcrStatusPayload> {
  const apiUrl = normalizePaddleOcrApiUrl(input.moduleId, input.apiUrl)
  const assetRoot = deps.assetRoot ?? getDefaultAssetRoot(deps.resourceDir)
  const skillsDir = deps.skillsDir ?? getDefaultSkillsDir()
  const currentConfig = readConfigJsonOrEmpty()
  const currentEntry = readSkillEntry(currentConfig, input.moduleId)
  const accessToken = resolveAccessToken(input.accessToken, currentEntry)
  const validateCredentials =
    deps.validateCredentials ?? validatePaddleOcrCredentials

  await validateCredentials(input.moduleId, apiUrl, accessToken)
  ensureBundledPaddleOcrModules(assetRoot, skillsDir)

  await updateConfigJson((config) => {
    const skills = ensureRecord(config, 'skills')
    const entries = ensureRecord(skills, 'entries')
    const existingEntry = isRecord(entries[input.moduleId]) ? entries[input.moduleId] : null
    const entry: OpenClawSkillEntry = existingEntry
      ? { ...(existingEntry as OpenClawSkillEntry) }
      : {}
    const existingEnv = isRecord(entry.env) ? { ...entry.env } : {}
    const existingConfig = isRecord(entry.config) ? { ...entry.config } : {}

    entry.enabled = true
    entry.apiKey = accessToken
    entry.env = {
      ...existingEnv,
      PADDLEOCR_ACCESS_TOKEN: accessToken,
      [MODULE_API_ENV_KEY[input.moduleId]]: apiUrl,
      [MODULE_TIMEOUT_ENV_KEY[input.moduleId]]: MODULE_TIMEOUT_DEFAULT[input.moduleId],
    }
    entry.config = {
      ...existingConfig,
      apiUrl,
      accessToken,
    }
    entries[input.moduleId] = entry
  })

  const config = readConfigJsonOrEmpty()
  return buildStatusFromConfig(config, skillsDir)
}

export async function previewPaddleOcr(
  input: PaddleOcrSetupInput,
  deps: PaddleOcrServiceDeps = {},
): Promise<PaddleOcrPreviewPayload> {
  const config = readConfigJsonOrEmpty()
  const entry = readSkillEntry(config, input.moduleId)
  const accessToken = resolveAccessToken(input.accessToken, entry)
  const apiUrl = normalizePaddleOcrApiUrl(input.moduleId, input.apiUrl)
  const result = await runPaddleOcrRequest(input.moduleId, apiUrl, accessToken, deps)
  const { extractedText, pageCount } = extractPreviewText(result.payload)

  return {
    moduleId: input.moduleId,
    apiUrl,
    latencyMs: result.latencyMs,
    pageCount,
    textLineCount: countTextLines(extractedText),
    extractedText,
    responsePreview: formatResponsePreview(result.payload),
  }
}

export async function clearPaddleOcr(
  input: PaddleOcrClearInput,
  deps: Pick<PaddleOcrServiceDeps, 'skillsDir'> = {},
): Promise<PaddleOcrStatusPayload> {
  await updateConfigJson((config) => {
    const skills = ensureRecord(config, 'skills')
    const entries = ensureRecord(skills, 'entries')
    delete entries[input.moduleId]
  })

  const config = readConfigJsonOrEmpty()
  return buildStatusFromConfig(config, deps.skillsDir ?? getDefaultSkillsDir())
}
