import fs from 'node:fs'
import type { OpenclawProfileContext, OpenclawProfileSelection } from '../openclawProfile.js'
import { getOpenclawConfigResolution } from '../paths.js'
import { extractFirstJsonObject } from '../execOpenclaw.js'

export type WikiLlmRole = 'system' | 'user' | 'assistant'

export interface WikiLlmMessage {
  role: WikiLlmRole
  content: string
}

export interface WikiLlmOptions {
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface WikiLlmResolution {
  enabled: boolean
  disabledReason?: string
  model?: string
  gatewayUrl: string
  authToken?: string
  maxTokensPerOperation: number
}

export interface WikiLlmContext extends OpenclawProfileContext {
  profileSelection?: OpenclawProfileSelection
}

type GatewayChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
}

const DEFAULT_GATEWAY_PORT = 18789
const DEFAULT_MAX_WIKI_LLM_TOKENS = 4096

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeGatewayHost(bind: string | undefined): string {
  const value = bind?.trim()
  if (!value || value === 'loopback' || value === '0.0.0.0') return '127.0.0.1'
  if (value === '::' || value === '[::]') return '[::1]'
  if (value.includes(':') && !value.startsWith('[') && !value.endsWith(']')) return `[${value}]`
  return value
}

function numberFromUnknown(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && Number.isFinite(Number(value))
      ? Number(value)
      : fallback
}

function stringPath(root: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = root
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : undefined
}

function readConfigForContext(context: WikiLlmContext = {}): Record<string, unknown> {
  const resolution = getOpenclawConfigResolution({
    homeDir: context.homeDir,
    platform: context.platform,
    profileSelection: context.profileSelection,
  })
  if (!fs.existsSync(resolution.configPath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(resolution.configPath, 'utf8')) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function extractContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (isRecord(item) && typeof item.text === 'string') return item.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function clampMaxTokens(requested: number | undefined, cap: number): number {
  const normalized = numberFromUnknown(requested, Math.min(1024, cap))
  return Math.max(64, Math.min(cap, Math.round(normalized)))
}

function appendPathSuffix(baseUrl: string, suffix: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${normalizedBase}${normalizedSuffix}`
}

export function resolveWikiLlm(context: WikiLlmContext = {}): WikiLlmResolution {
  const config = readConfigForContext(context)
  const model = stringPath(config, ['agents', 'defaults', 'model', 'primary'])
  const gateway = isRecord(config.gateway) ? config.gateway : {}
  const auth = isRecord(gateway.auth) ? gateway.auth : {}
  const rawMaxTokens =
    config.maxWikiLlmTokensPerOperation
    ?? (isRecord(config.wiki) ? config.wiki.maxWikiLlmTokensPerOperation : undefined)
  const maxTokensPerOperation = Math.max(
    256,
    Math.min(32_768, Math.round(numberFromUnknown(rawMaxTokens, DEFAULT_MAX_WIKI_LLM_TOKENS))),
  )
  const port = Math.max(1, Math.min(65_535, Math.round(numberFromUnknown(gateway.port, DEFAULT_GATEWAY_PORT))))
  const gatewayUrl = `http://${normalizeGatewayHost(typeof gateway.bind === 'string' ? gateway.bind : undefined)}:${port}`
  const authMode = typeof auth.mode === 'string' ? auth.mode.trim() : ''
  const authToken = authMode === 'token' && typeof auth.token === 'string' && auth.token.trim()
    ? auth.token.trim()
    : undefined

  if (!model) {
    return {
      enabled: false,
      disabledReason: 'No default model is configured for wiki LLM operations.',
      gatewayUrl,
      maxTokensPerOperation,
    }
  }

  return {
    enabled: true,
    model,
    gatewayUrl,
    authToken,
    maxTokensPerOperation,
  }
}

export function wikiLlmEnabled(context: WikiLlmContext = {}): boolean {
  return resolveWikiLlm(context).enabled
}

export async function wikiLlmComplete(
  messages: WikiLlmMessage[],
  options: WikiLlmOptions = {},
  context: WikiLlmContext = {},
): Promise<string> {
  const resolved = resolveWikiLlm(context)
  if (!resolved.enabled || !resolved.model) {
    throw new Error(resolved.disabledReason || 'Wiki LLM is not enabled.')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (resolved.authToken) {
    headers.Authorization = `Bearer ${resolved.authToken}`
  }

  const response = await fetch(appendPathSuffix(resolved.gatewayUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers,
    signal: options.signal,
    body: JSON.stringify({
      model: resolved.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: clampMaxTokens(options.maxTokens, resolved.maxTokensPerOperation),
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Wiki gateway completion failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const payload = await response.json() as GatewayChatCompletionResponse
  const content = extractContent(payload.choices?.[0]?.message?.content).trim()
  if (!content) throw new Error('Wiki gateway completion returned no content.')
  return content
}

export async function wikiLlmCompleteStructured<T>(
  messages: WikiLlmMessage[],
  schema: unknown,
  options: WikiLlmOptions = {},
  context: WikiLlmContext = {},
): Promise<T> {
  const raw = await wikiLlmComplete(
    [
      {
        role: 'system',
        content: `Return only valid JSON that matches this schema shape: ${JSON.stringify(schema)}`,
      },
      ...messages,
    ],
    options,
    context,
  )
  const jsonText = extractFirstJsonObject(raw) ?? raw
  try {
    return JSON.parse(jsonText) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Wiki gateway structured completion returned invalid JSON: ${message}`)
  }
}
