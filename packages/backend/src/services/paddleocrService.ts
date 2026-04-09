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

type OpenClawSkillEntry = {
  enabled?: boolean
  apiKey?: unknown
  env?: Record<string, unknown>
  config?: Record<string, unknown>
}

type PaddleOcrServiceDeps = {
  assetRoot?: string
  skillsDir?: string
  validateCredentials?: (
    moduleId: PaddleOcrModuleId,
    apiUrl: string,
    accessToken: string,
  ) => Promise<void>
}

const SAMPLE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5nLJ8AAAAASUVORK5CYII='

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ASSET_ROOT = path.resolve(
  __dirname,
  '../../../../src-tauri/resources/paddleocr-skills',
)

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

function hasAccessToken(entry: OpenClawSkillEntry | null): boolean {
  if (!entry) return false
  if (typeof entry.apiKey === 'string' && entry.apiKey.trim()) return true
  const config = isRecord(entry.config) ? entry.config : null
  if (config && typeof config.accessToken === 'string' && config.accessToken.trim()) return true
  const env = isRecord(entry.env) ? entry.env : null
  return Boolean(
    env &&
      typeof env.PADDLEOCR_ACCESS_TOKEN === 'string' &&
      env.PADDLEOCR_ACCESS_TOKEN.trim(),
  )
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

async function validateSingleEndpoint(
  moduleId: PaddleOcrModuleId,
  apiUrl: string,
  accessToken: string,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${accessToken}`,
        'Content-Type': 'application/json',
        'Client-Platform': 'clawmaster-bundled',
      },
      body: JSON.stringify({
        file: SAMPLE_IMAGE_BASE64,
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

  if (isRecord(payload) && Number(payload.errorCode ?? 0) !== 0) {
    const detail =
      typeof payload.errorMsg === 'string' && payload.errorMsg.trim()
        ? payload.errorMsg.trim()
        : 'Unknown API error'
    throw new Error(`${MODULE_VALIDATION_LABEL[moduleId]} verification failed: ${detail}`)
  }
}

export async function validatePaddleOcrCredentials(
  moduleId: PaddleOcrModuleId,
  apiUrl: string,
  accessToken: string,
): Promise<void> {
  const token = accessToken.trim()
  if (!token) {
    throw new Error('Access Token is required.')
  }

  const normalizedApiUrl = normalizePaddleOcrApiUrl(moduleId, apiUrl)
  await validateSingleEndpoint(moduleId, normalizedApiUrl, token)
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
  const accessToken = input.accessToken.trim()
  if (!accessToken) {
    throw new Error('Access Token is required.')
  }

  const apiUrl = normalizePaddleOcrApiUrl(input.moduleId, input.apiUrl)
  const assetRoot = deps.assetRoot ?? DEFAULT_ASSET_ROOT
  const skillsDir = deps.skillsDir ?? getDefaultSkillsDir()
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
