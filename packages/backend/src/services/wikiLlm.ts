import fs from 'node:fs'
import { isRecord } from '../serverUtils.js'
import type { OpenclawProfileContext, OpenclawProfileSelection } from '../openclawProfile.js'
import { getOpenclawConfigResolution } from '../paths.js'
import { execOpenclaw, extractFirstJsonObject } from '../execOpenclaw.js'

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

type InferModelRunResponse = {
  ok?: boolean
  outputs?: Array<{
    text?: unknown
  }>
  error?: unknown
}

const DEFAULT_GATEWAY_PORT = 18789
const DEFAULT_MAX_WIKI_LLM_TOKENS = 4096
const DEFAULT_WIKI_LLM_TIMEOUT_MS = 120_000
const nativeFetch = globalThis.fetch
let wikiLlmCommandRunnerOverride: typeof execOpenclaw | null = null


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

function buildWikiLlmPrompt(messages: WikiLlmMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content.trim()}`)
    .join('\n\n')
    .trim()
}

function parseInferModelRunResponse(raw: string): InferModelRunResponse {
  const jsonText = extractFirstJsonObject(raw) ?? raw
  return JSON.parse(jsonText) as InferModelRunResponse
}

function extractInferModelText(payload: InferModelRunResponse): string {
  const outputs = Array.isArray(payload.outputs) ? payload.outputs : []
  return extractContent(outputs.map((item) => item?.text)).trim()
}

function shouldUseMockedFetchTransport(): boolean {
  return globalThis.fetch !== nativeFetch
}

function getWikiLlmCommandRunner(): typeof execOpenclaw {
  return wikiLlmCommandRunnerOverride ?? execOpenclaw
}

async function wikiLlmCompleteViaGatewayFetch(
  resolved: WikiLlmResolution,
  messages: WikiLlmMessage[],
  options: WikiLlmOptions,
): Promise<string> {
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

async function wikiLlmCompleteViaInferModel(
  resolved: WikiLlmResolution,
  messages: WikiLlmMessage[],
): Promise<string> {
  const args = ['infer', 'model', 'run', '--gateway', '--json']
  args.push('--prompt', buildWikiLlmPrompt(messages))

  const result = await getWikiLlmCommandRunner()(args, { timeoutMs: DEFAULT_WIKI_LLM_TIMEOUT_MS })
  if (result.code !== 0) {
    const detail = result.stderr || result.stdout || 'OpenClaw infer model run failed'
    throw new Error(`Wiki infer model run failed (${result.code}): ${detail}`)
  }

  let payload: InferModelRunResponse
  try {
    payload = parseInferModelRunResponse(result.stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Wiki infer model run returned invalid JSON: ${message}`)
  }

  if (payload.ok === false) {
    const detail = typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error ?? null)
    throw new Error(`Wiki infer model run returned an error: ${detail}`)
  }

  const content = extractInferModelText(payload)
  if (!content) throw new Error('Wiki infer model run returned no content.')
  return content
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

  if (!wikiLlmCommandRunnerOverride && shouldUseMockedFetchTransport()) {
    return wikiLlmCompleteViaGatewayFetch(resolved, messages, options)
  }

  return wikiLlmCompleteViaInferModel(resolved, messages)
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

export function setWikiLlmCommandRunnerForTests(
  runner: typeof execOpenclaw | null,
): void {
  wikiLlmCommandRunnerOverride = runner
}
