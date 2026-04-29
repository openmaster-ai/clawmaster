import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { Type } from '@sinclair/typebox'
import type {
  OpenClawPluginApi,
  OpenClawPluginCliContext,
} from 'openclaw/plugin-sdk/memory-core'
import type { OpenClawPluginServiceContext } from 'openclaw/plugin-sdk'
import {
  addManagedMemory,
  getManagedMemoryStatsPayload,
  deleteManagedMemory,
  getManagedMemoryStatusPayload,
  listManagedMemories,
  resetManagedMemory,
  searchManagedMemories,
  type ManagedMemoryEngine,
  type ManagedMemoryContext,
  type ManagedMemorySearchHit,
} from './runtime.js'
import {
  getManagedMemoryImportStatus,
  importOpenclawWorkspaceMemories,
  resolveOpenclawWorkspaceDir,
} from './workspaceImport.js'

type ManagedPluginConfig = {
  dataRoot: string
  engine: ManagedMemoryEngine
  userId?: string
  agentId?: string
  recallLimit: number
  recallScoreThreshold: number
  autoCapture: boolean
  autoRecall: boolean
  inferOnAdd: boolean
}

const DEFAULT_RECALL_LIMIT = 5
const DEFAULT_RECALL_SCORE_THRESHOLD = 0
const WIKI_LINK_CHOICE_TTL_MS = 30 * 60 * 1000

export function defaultManagedEngineForTest(
  platform = process.platform,
  arch = process.arch,
): ManagedMemoryEngine {
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) {
    return 'powermem-seekdb'
  }
  return 'powermem-sqlite'
}

function defaultManagedEngine(): ManagedMemoryEngine {
  return defaultManagedEngineForTest()
}

function defaultManagedDataRoot(): string {
  return join(homedir(), '.clawmaster', 'data', 'default')
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown keys: ${unknown.join(', ')}`)
  }
}

function toRecallLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(100, Math.floor(value))
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    return parsed >= 1 ? Math.min(100, parsed) : DEFAULT_RECALL_LIMIT
  }
  return DEFAULT_RECALL_LIMIT
}

function toRecallScoreThreshold(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value))
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed))
    }
  }
  return DEFAULT_RECALL_SCORE_THRESHOLD
}

const managedPluginConfigSchema = {
  parse(value: unknown): ManagedPluginConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        dataRoot: process.env['CLAWMASTER_MANAGED_MEMORY_DATA_ROOT']?.trim() || defaultManagedDataRoot(),
        engine: defaultManagedEngine(),
        recallLimit: DEFAULT_RECALL_LIMIT,
        recallScoreThreshold: DEFAULT_RECALL_SCORE_THRESHOLD,
        autoCapture: true,
        autoRecall: true,
        inferOnAdd: false,
      }
    }

    const cfg = value as Record<string, unknown>
    assertAllowedKeys(
      cfg,
      ['dataRoot', 'engine', 'userId', 'agentId', 'recallLimit', 'recallScoreThreshold', 'autoCapture', 'autoRecall', 'inferOnAdd'],
      'memory-clawmaster-powermem config'
    )

    return {
      dataRoot:
        typeof cfg.dataRoot === 'string' && cfg.dataRoot.trim()
          ? cfg.dataRoot.trim()
          : process.env['CLAWMASTER_MANAGED_MEMORY_DATA_ROOT']?.trim() || defaultManagedDataRoot(),
      engine:
        cfg.engine === 'powermem-seekdb' || cfg.engine === 'powermem-sqlite'
          ? cfg.engine
          : defaultManagedEngine(),
      userId: typeof cfg.userId === 'string' && cfg.userId.trim() ? cfg.userId.trim() : undefined,
      agentId: typeof cfg.agentId === 'string' && cfg.agentId.trim() ? cfg.agentId.trim() : undefined,
      recallLimit: toRecallLimit(cfg.recallLimit),
      recallScoreThreshold: toRecallScoreThreshold(cfg.recallScoreThreshold),
      autoCapture: cfg.autoCapture !== false,
      autoRecall: cfg.autoRecall !== false,
      inferOnAdd: cfg.inferOnAdd === true,
    }
  },
}

function buildManagedContext(cfg: ManagedPluginConfig): ManagedMemoryContext {
  return {
    dataRootOverride: cfg.dataRoot,
    engineOverride: cfg.engine,
  }
}

function describeScopeValue(value: string | undefined): string {
  return value ? value : 'unscoped'
}

function withManagedScope<T extends object>(
  scope: {
    userId?: string
    agentId?: string
  },
  extra?: T,
): T & { userId?: string; agentId?: string } {
  return {
    ...(extra ?? {}),
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
  }
}

function lastUserMessageText(messages: unknown[] | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (!msg || typeof msg !== 'object') continue
    const role = (msg as Record<string, unknown>).role
    if (role !== 'user') continue
    const content = (msg as Record<string, unknown>).content
    if (typeof content === 'string' && content.trim().length >= 5) return content.trim()
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as Record<string, unknown>).type === 'text' &&
          typeof (block as Record<string, unknown>).text === 'string'
        ) {
          const text = String((block as Record<string, unknown>).text).trim()
          if (text.length >= 5) return text
        }
      }
    }
  }
  return ''
}

function buildManagedStatusEntries(
  cfg: ManagedPluginConfig,
  status: Awaited<ReturnType<typeof getManagedMemoryStatusPayload>>,
  managedContext: ManagedMemoryContext,
  agentId?: string,
) {
  return [
    {
      ...(agentId ? { agentId } : {}),
      status: {
        backend: status.engine,
        dirty: false,
        workspaceDir: resolveOpenclawWorkspaceDir(managedContext),
        dbPath: status.dbPath ?? status.storagePath,
        runtimeRoot: status.runtimeRoot,
      },
      scan: {
        totalFiles: status.provisioned ? 1 : 0,
      },
      managed: {
        dataRoot: cfg.dataRoot,
        engine: cfg.engine,
        storagePath: status.storagePath,
      },
    },
  ]
}

function normalizeSearchQuery(
  positionalQuery: unknown,
  opts: { query?: string },
): string {
  const fromOption = typeof opts.query === 'string' ? opts.query.trim() : ''
  if (fromOption) return fromOption
  return String(positionalQuery ?? '').trim()
}

type CommandLike = {
  name(): string
  command(name: string): CommandLike
  description(text: string): CommandLike
  option(flags: string, description: string, defaultValue?: string): CommandLike
  action(handler: (...args: unknown[]) => unknown): CommandLike
  commands?: CommandLike[]
}

function findChildCommand(command: CommandLike, name: string): CommandLike | undefined {
  return (command.commands ?? []).find((entry) => entry.name() === name)
}

export function ensureMemoryIndexCompatibilityCommandForTest(
  program: CommandLike,
  onIndex: () => Promise<void> | void,
): void {
  const existingTopLevelMemory = findChildCommand(program, 'memory')
  const memory =
    existingTopLevelMemory
    ?? program.command('memory').description('Managed memory compatibility commands')

  if (findChildCommand(memory, 'index')) {
    return
  }

  memory
    .command('index')
    .description('Ensure the managed memory runtime is ready')
    .option('--force', 'Compatibility flag')
    .option('--verbose', 'Compatibility flag')
    .action(async () => {
      await onIndex()
    })
}

function resolveCliScope(
  scope: {
    userId?: string
    agentId?: string
  },
  opts: {
    user?: string
    agent?: string
  },
): { userId?: string; agentId?: string } {
  return {
    userId: typeof opts.user === 'string' && opts.user.trim() ? opts.user.trim() : scope.userId,
    agentId: typeof opts.agent === 'string' && opts.agent.trim() ? opts.agent.trim() : scope.agentId,
  }
}

const MEMORY_RECALL_GUIDANCE =
  '## Long-term memory (PowerMem)\n' +
  'When answering about prior preferences, stable facts, or earlier decisions, use memory_recall first or consult any injected <relevant-memories>.\n' +
  '## Wiki knowledge\n' +
  'For questions that mention "wiki", "knowledge base", "what do we know", docs, research, decisions, or project context, treat the local OpenClaw Wiki as the first-choice knowledge source.\n' +
  'Consult injected <relevant-wiki> before using external tools. If no local Wiki context is injected or the local Wiki has no match, say that directly and ask whether to search externally, ingest a source, or use DeepWiki.\n' +
  'Do not call DeepWiki or repository-wiki tools for a generic "wiki" question unless the user explicitly says "DeepWiki", names a GitHub repository wiki, or asks for external repository documentation.\n' +
  'If you use Wiki knowledge, make that value visible to the user with a compact "Wiki used" note that names page/source labels, freshness, and any health warning. Do not expose internal XML tags.\n' +
  'If your answer combines multiple Wiki sources into a reusable conclusion, offer to save or update a Wiki synthesis. Never write Wiki knowledge silently.\n'

function isWikiRelevantQuestion(query: string): boolean {
  const text = query.trim().toLowerCase()
  if (text.length < 5) return false
  return [
    'wiki',
    'knowledge',
    'knowledge base',
    'what do we know',
    'known about',
    'research',
    'decision',
    'docs',
    'document',
    'article',
    'source',
    'citation',
    'project context',
    'codebase context',
    'prior',
    'previous',
    'earlier',
  ].some((token) => text.includes(token))
}

export function extractStandaloneHttpUrlForTest(input: string): string | undefined {
  const text = input.trim()
  const match = text.match(/^<?(https?:\/\/[^\s<>]+)>?$/i)
  if (!match) return undefined

  try {
    const url = new URL(match[1]!)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.href
  } catch {
    return undefined
  }
}

export function buildWikiLinkChoiceReplyForTest(url: string): string {
  return [
    `I found this link: ${url}`,
    '',
    'How should I use it?',
    '',
    '1. Ingest into Wiki - fetch it, store source provenance, update PowerMem records, and regenerate Wiki markdown.',
    '2. Summarize once - read it for this turn only without saving it to Wiki.',
    '3. Use only in this conversation - keep the URL as context and do not fetch or save it.',
    '',
    'Reply with 1, 2, or 3.',
  ].join('\n')
}

export type WikiLinkChoiceSelection = 'ingest' | 'summarize_once' | 'current_conversation_only'

export function parseWikiLinkChoiceForTest(input: string): WikiLinkChoiceSelection | undefined {
  const text = input.trim().toLowerCase()
  if (text === '1' || text === 'ingest' || text === 'ingest into wiki') return 'ingest'
  if (text === '2' || text === 'summarize' || text === 'summarize once') return 'summarize_once'
  if (
    text === '3' ||
    text === 'conversation' ||
    text === 'current conversation' ||
    text === 'use only in this conversation'
  ) {
    return 'current_conversation_only'
  }
  return undefined
}

function slugifyWikiValue(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'untitled-source'
}

function wikiPageIdForUrl(url: string, title?: string): string {
  const titleSlug = title?.trim() ? slugifyWikiValue(title) : ''
  if (titleSlug) return `sources-${titleSlug}`
  try {
    const parsed = new URL(url)
    return `sources-${slugifyWikiValue(`${parsed.hostname}${parsed.pathname}`)}`
  } catch {
    return `sources-${slugifyWikiValue(url)}`
  }
}

function resolveWikiPageIdForUrl(url: string, title: string | undefined, existing: ManagedMemorySearchHit[]): string {
  const previous = existing.find((item) => provenanceString(item.metadata, 'sourceUrl') === url)
  return previous ? metadataString(previous.metadata, 'pageId') || wikiPageIdForUrl(url, title) : wikiPageIdForUrl(url, title)
}

export function resolveWikiPageIdForUrlForTest(
  url: string,
  title: string | undefined,
  existing: ManagedMemorySearchHit[],
): string {
  return resolveWikiPageIdForUrl(url, title, existing)
}

async function findWikiUrlMemoryHits(input: {
  url: string
  scope: { userId?: string; agentId?: string }
  managedContext: ManagedMemoryContext
}): Promise<ManagedMemorySearchHit[]> {
  const [listed, searched] = await Promise.all([
    listManagedMemoriesByScope(input.scope, input.managedContext),
    searchManagedMemories(
      input.url,
      withManagedScope(input.scope, { limit: 10 }),
      input.managedContext,
    ).catch(() => []),
  ])
  const byId = new Map<string, ManagedMemorySearchHit>()
  for (const item of searched) {
    byId.set(item.memoryId, item)
  }
  for (const item of listed) {
    if (provenanceString(item.metadata, 'sourceUrl') !== input.url) continue
    byId.set(item.memoryId, item)
  }
  return [...byId.values()].sort((left, right) => {
    const leftExact = provenanceString(left.metadata, 'sourceUrl') === input.url ? 1 : 0
    const rightExact = provenanceString(right.metadata, 'sourceUrl') === input.url ? 1 : 0
    return rightExact - leftExact
  })
}

async function listManagedMemoriesByScope(
  scope: { userId?: string; agentId?: string },
  managedContext: ManagedMemoryContext,
): Promise<ManagedMemorySearchHit[]> {
  const memories: ManagedMemorySearchHit[] = []
  const limit = 100
  for (let offset = 0; offset < 10_000; offset += limit) {
    const page = await listManagedMemories(
      withManagedScope(scope, { limit, offset }),
      managedContext,
    ).catch(() => ({ memories: [], total: memories.length }))
    for (const item of page.memories) {
      memories.push({
        memoryId: item.memoryId,
        content: item.content,
        userId: item.userId,
        agentId: item.agentId,
        metadata: item.metadata,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
    }
    if (page.memories.length === 0 || offset + page.memories.length >= page.total) break
  }
  return memories
}

export async function findWikiUrlMemoryHitsForTest(input: {
  url: string
  scope: { userId?: string; agentId?: string }
  managedContext: ManagedMemoryContext
}): Promise<ManagedMemorySearchHit[]> {
  return findWikiUrlMemoryHits(input)
}

function stripHtmlForWiki(html: string): { title?: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return { title, text }
}

function summarizeFetchedWikiText(title: string, text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 40 && !item.includes('{') && !item.includes('}'))
  const unique: string[] = []
  for (const sentence of sentences) {
    if (unique.some((item) => item === sentence)) continue
    unique.push(sentence.slice(0, 260))
    if (unique.length >= 4) break
  }
  return unique.length > 0 ? unique : [`${title}: ${text.slice(0, 260)}`]
}

function wikiFrontmatterString(value: string): string {
  return JSON.stringify(value.replace(/\n/g, ' '))
}

export function buildWikiSourceMarkdownForTest(input: {
  pageId: string
  title: string
  sourceUrl: string
  content: string
  memoryId?: string
  createdAt?: string
  updatedAt: string
}): string {
  const summary = summarizeFetchedWikiText(input.title, input.content)
  const createdAt = input.createdAt ?? input.updatedAt
  const frontmatter = [
    '---',
    `id: ${wikiFrontmatterString(input.pageId)}`,
    `title: ${wikiFrontmatterString(input.title)}`,
    'type: source',
    'sourceType: url',
    `sourceUrl: ${wikiFrontmatterString(input.sourceUrl)}`,
    `createdAt: ${wikiFrontmatterString(createdAt)}`,
    `updatedAt: ${wikiFrontmatterString(input.updatedAt)}`,
    `memoryId: ${wikiFrontmatterString(input.memoryId ?? '')}`,
    'freshnessStatus: fresh',
    '---',
  ].join('\n')

  return [
    frontmatter,
    '',
    `# ${input.title}`,
    '',
    `Source URL: ${input.sourceUrl}`,
    '',
    '## Key Extract',
    '',
    ...summary.map((item) => `- ${item}`),
    '',
    '## Raw Text',
    '',
    input.content.slice(0, 12000),
    '',
  ].join('\n')
}

async function readWikiMarkdownCreatedAt(filePath: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const match = raw.match(/^createdAt:\s*(.+)$/m)
    if (!match?.[1]) return undefined
    const value = match[1].trim()
    try {
      const parsed = JSON.parse(value) as unknown
      return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : undefined
    } catch {
      return value.trim() || undefined
    }
  } catch {
    return undefined
  }
}

async function fetchWikiUrlContent(url: string): Promise<{ title: string; content: string; warnings: string[] }> {
  const warnings: string[] = []
  const response = await fetch(url, {
    headers: {
      'user-agent': 'OpenClaw Wiki Link Choice/1.0',
      accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
    },
  })
  if (!response.ok) {
    throw new Error(`URL fetch failed with HTTP ${response.status}`)
  }

  const raw = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  const parsed = contentType.includes('html') ? stripHtmlForWiki(raw) : { text: raw.trim(), title: undefined }
  const title = parsed.title || (() => {
    try {
      const parsedUrl = new URL(url)
      return basename(parsedUrl.pathname) || parsedUrl.hostname
    } catch {
      return 'Wiki Source'
    }
  })()
  const content = parsed.text || `Source URL: ${url}`
  if (content === `Source URL: ${url}`) warnings.push('empty_content')
  return { title: title.slice(0, 120), content, warnings }
}

async function ensureWikiVaultStructure(vaultRoot: string): Promise<void> {
  await Promise.all([
    fs.mkdir(join(vaultRoot, 'raw'), { recursive: true }),
    fs.mkdir(join(vaultRoot, 'pages', 'entities'), { recursive: true }),
    fs.mkdir(join(vaultRoot, 'pages', 'concepts'), { recursive: true }),
    fs.mkdir(join(vaultRoot, 'pages', 'sources'), { recursive: true }),
    fs.mkdir(join(vaultRoot, 'pages', 'synthesis'), { recursive: true }),
    fs.mkdir(join(vaultRoot, 'pages', 'processes'), { recursive: true }),
    fs.mkdir(join(vaultRoot, '.meta'), { recursive: true }),
  ])
}

async function readJsonObjectFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function readJsonArrayFile(filePath: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeWikiMetaFiles(vaultRoot: string, pageId: string, updatedAt: string): Promise<void> {
  const freshnessPath = join(vaultRoot, '.meta', 'freshness.json')
  const conflictsPath = join(vaultRoot, '.meta', 'conflicts.json')
  const freshness = await readJsonObjectFile(freshnessPath)
  freshness[pageId] = { score: 1, status: 'fresh', updatedAt, lastAccessedAt: updatedAt }
  const conflicts = await readJsonArrayFile(conflictsPath)

  await Promise.all([
    fs.writeFile(
      freshnessPath,
      `${JSON.stringify(freshness, null, 2)}\n`,
      'utf8',
    ),
    fs.writeFile(conflictsPath, `${JSON.stringify(conflicts, null, 2)}\n`, 'utf8'),
    fs.writeFile(
      join(vaultRoot, 'SCHEMA.md'),
      '# Wiki Schema\n\nPowerMem is the source of truth. Markdown pages are generated article surfaces.\n',
      'utf8',
    ),
  ])
}

export async function writeWikiMetaFilesForTest(vaultRoot: string, pageId: string, updatedAt: string): Promise<void> {
  await writeWikiMetaFiles(vaultRoot, pageId, updatedAt)
}

function resolveWikiVaultRoot(managedContext: ManagedMemoryContext): string {
  return join(resolveOpenclawWorkspaceDir(managedContext), '..', 'wiki')
}

export function resolveWikiVaultRootForTest(managedContext: ManagedMemoryContext): string {
  return resolveWikiVaultRoot(managedContext)
}

async function updateWikiIndexFile(vaultRoot: string, title: string, pageId: string): Promise<void> {
  const indexPath = join(vaultRoot, 'index.md')
  const entry = `- [[${title}]] (${pageId})`
  let existing = '# Wiki Index\n'
  try {
    existing = await fs.readFile(indexPath, 'utf8')
  } catch {
    // A new vault has no index yet.
  }
  const withoutExisting = existing
    .split('\n')
    .filter((line) => !line.includes(`(${pageId})`))
    .join('\n')
    .trimEnd()
  await fs.writeFile(indexPath, `${withoutExisting || '# Wiki Index'}\n\n${entry}\n`, 'utf8')
}

async function ingestWikiUrlFromPlugin(input: {
  url: string
  scope: { userId?: string; agentId?: string }
  managedContext: ManagedMemoryContext
  vaultRoot?: string
}): Promise<{ title: string; pageId: string; memoryId: string; pagePath: string; warnings: string[] }> {
  const vaultRoot = input.vaultRoot ?? resolveWikiVaultRoot(input.managedContext)
  const fetched = await fetchWikiUrlContent(input.url)
  const updatedAt = new Date().toISOString()
  const sourceFingerprint = createHash('sha256').update(input.url).digest('hex')

  await ensureWikiVaultStructure(vaultRoot)

  const existing = await findWikiUrlMemoryHits(input)
  const pageId = resolveWikiPageIdForUrl(input.url, fetched.title, existing)
  const pageSlug = pageId.replace(/^sources-/, '')
  const rawPath = join(vaultRoot, 'raw', `${pageSlug}.md`)
  const pagePath = join(vaultRoot, 'pages', 'sources', `${pageSlug}.md`)
  const createdAt = await readWikiMarkdownCreatedAt(pagePath) ?? updatedAt
  for (const item of existing) {
    if (
      metadataString(item.metadata, 'pageId') === pageId ||
      provenanceString(item.metadata, 'sourceUrl') === input.url
    ) {
      await deleteManagedMemory(item.memoryId, input.managedContext)
    }
  }

  const memory = await addManagedMemory(
    {
      content: fetched.content.slice(0, 12000),
      ...withManagedScope(input.scope),
      metadata: {
        scope: 'wiki',
        sourceType: 'url',
        durability: 'derived',
        category: 'source',
        pageId,
        sectionId: `${pageId}#raw-text`,
        freshnessStatus: 'fresh',
        lintStatus: 'unchecked',
        quality: 0.8,
        provenance: {
          sourceType: 'url',
          sourceUrl: input.url,
          title: fetched.title,
          sourceFingerprint,
          ingestedBy: 'openclaw-webui-link-choice',
        },
      },
    },
    input.managedContext,
  )

  const markdown = buildWikiSourceMarkdownForTest({
    pageId,
    title: fetched.title,
    sourceUrl: input.url,
    content: fetched.content,
    memoryId: memory.memoryId,
    createdAt,
    updatedAt,
  })
  await Promise.all([
    fs.writeFile(rawPath, markdown, 'utf8'),
    fs.writeFile(pagePath, markdown, 'utf8'),
    updateWikiIndexFile(vaultRoot, fetched.title, pageId),
    fs.appendFile(join(vaultRoot, 'log.md'), `- ${updatedAt}: Ingested [[${fetched.title}]] from ${input.url}\n`, 'utf8'),
    writeWikiMetaFiles(vaultRoot, pageId, updatedAt),
  ])

  return {
    title: fetched.title,
    pageId,
    memoryId: memory.memoryId,
    pagePath,
    warnings: fetched.warnings,
  }
}

async function summarizeWikiUrlOnce(url: string): Promise<{ title: string; bullets: string[]; warnings: string[] }> {
  const fetched = await fetchWikiUrlContent(url)
  return {
    title: fetched.title,
    bullets: summarizeFetchedWikiText(fetched.title, fetched.content),
    warnings: fetched.warnings,
  }
}

function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value.trim() : ''
}

function provenanceString(metadata: Record<string, unknown>, key: string): string {
  const provenance = metadata.provenance
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return ''
  const value = (provenance as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function nestedMetadataString(metadata: Record<string, unknown>, objectKey: string, valueKey: string): string {
  const value = metadata[objectKey]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const nested = (value as Record<string, unknown>)[valueKey]
  return typeof nested === 'string' ? nested.trim() : ''
}

function isWikiMemory(item: ManagedMemorySearchHit): boolean {
  return metadataString(item.metadata, 'scope') === 'wiki' || Boolean(metadataString(item.metadata, 'pageId'))
}

function wikiFreshnessLabel(item: ManagedMemorySearchHit): string {
  return metadataString(item.metadata, 'freshnessStatus') || nestedMetadataString(item.metadata, 'freshness', 'status') || 'unknown'
}

function formatWikiMemory(item: ManagedMemorySearchHit, index: number): string {
  const pageId = metadataString(item.metadata, 'pageId') || item.memoryId
  const sourceType = metadataString(item.metadata, 'sourceType') || provenanceString(item.metadata, 'sourceType') || 'wiki'
  const sourceUrl = provenanceString(item.metadata, 'sourceUrl')
  const sourcePath = provenanceString(item.metadata, 'sourcePath')
  const source = sourceUrl || sourcePath || pageId
  const freshness = wikiFreshnessLabel(item)
  const score = item.score === undefined ? '' : `, score ${Math.round(item.score * 100)}%`
  const content = item.content.replace(/\s+/g, ' ').trim()
  return `${index + 1}. [${pageId}] (${sourceType}, freshness ${freshness}${score}) ${content}${source ? `\n   Source: ${source}` : ''}`
}

function formatPlainMemory(item: ManagedMemorySearchHit): string {
  return `- ${item.content.replace(/\s+/g, ' ').trim()}`
}

function formatWikiAwarenessInstruction(wikiItems: ManagedMemorySearchHit[]): string {
  const pageIds = [...new Set(wikiItems.map((item) => metadataString(item.metadata, 'pageId') || item.memoryId))]
  const freshnesses = [...new Set(wikiItems.map(wikiFreshnessLabel))]
  const sourceCount = new Set(wikiItems.map((item) => provenanceString(item.metadata, 'sourceUrl') || provenanceString(item.metadata, 'sourcePath') || metadataString(item.metadata, 'pageId') || item.memoryId)).size
  return [
    `Wiki signal: ${pageIds.length} page(s), ${sourceCount} source(s), freshness ${freshnesses.join('/') || 'unknown'}.`,
    'Local OpenClaw Wiki is the first-choice source for this request. Use these pages before external search or DeepWiki.',
    'If these pages materially shape your answer, include a short user-visible line like: "Wiki used: 2 pages, freshness aging. Sources: [page-id], [page-id]."',
    'Treat stale freshness or conflicts as Wiki health signals: mention them briefly so the user understands the knowledge base is maintained over time.',
    'If you synthesize across multiple pages into reusable knowledge, offer to save/update a Wiki synthesis; do not auto-save.',
  ].join('\n')
}

export function buildAutoRecallContextForTest(
  query: string,
  results: ManagedMemorySearchHit[],
  limit = DEFAULT_RECALL_LIMIT,
): { prependContext?: string; wikiCount: number; memoryCount: number } {
  const wikiItems = isWikiRelevantQuestion(query)
    ? results.filter(isWikiMemory).slice(0, limit)
    : []
  const memoryItems = results.filter((item) => !isWikiMemory(item)).slice(0, limit)
  const sections: string[] = []

  if (wikiItems.length > 0) {
    sections.push(
      `<relevant-wiki>\nThe following Wiki pages or sections may be relevant. Cite page/source labels when using them:\n${formatWikiAwarenessInstruction(wikiItems)}\n${wikiItems.map(formatWikiMemory).join('\n')}\n</relevant-wiki>`,
    )
  }
  if (memoryItems.length > 0) {
    sections.push(
      `<relevant-memories>\nThe following memories may be relevant to this conversation:\n${memoryItems.map(formatPlainMemory).join('\n')}\n</relevant-memories>`,
    )
  }

  return {
    ...(sections.length > 0 ? { prependContext: sections.join('\n\n') } : {}),
    wikiCount: wikiItems.length,
    memoryCount: memoryItems.length,
  }
}

const plugin = {
  id: 'memory-clawmaster-powermem',
  name: 'Memory (ClawMaster PowerMem)',
  description: 'ClawMaster-managed long-term memory powered by the PowerMem TypeScript SDK.',
  kind: 'memory' as const,
  configSchema: managedPluginConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = managedPluginConfigSchema.parse(api.pluginConfig)
    const managedContext = buildManagedContext(cfg)
    const scope = {
      userId: cfg.userId,
      agentId: cfg.agentId,
    }

    api.logger.info(
      `memory-clawmaster-powermem: plugin registered (dataRoot: ${cfg.dataRoot}, engine: ${cfg.engine}, user: ${describeScopeValue(scope.userId)}, agent: ${describeScopeValue(scope.agentId)})`,
    )
    const pendingWikiLinks = new Map<string, { url: string; createdAt: number }>()
    const dispatchKey = (event: { sessionKey?: string; senderId?: string; channel?: string }) =>
      event.sessionKey || [event.channel, event.senderId].filter(Boolean).join(':') || 'default'

    api.registerTool(
      {
        name: 'memory_recall',
        label: 'Memory Recall',
        description: 'Search ClawMaster-managed PowerMem long-term memory.',
        parameters: Type.Object({
          query: Type.String({ description: 'Search query' }),
          limit: Type.Optional(Type.Number({ description: 'Maximum results' })),
          scoreThreshold: Type.Optional(Type.Number({ description: 'Minimum score from 0 to 1' })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const limit =
            typeof params.limit === 'number'
              ? Math.max(1, Math.min(100, Math.floor(params.limit)))
              : cfg.recallLimit
          const scoreThreshold =
            typeof params.scoreThreshold === 'number'
              ? Math.max(0, Math.min(1, params.scoreThreshold))
              : cfg.recallScoreThreshold
          const query = String(params.query ?? '')

          try {
            const results = (await searchManagedMemories(
              query,
              withManagedScope(scope, {
                limit: Math.min(100, Math.max(limit * 2, limit + 10)),
              }),
              managedContext,
            ))
              .filter((item) => (item.score ?? 0) >= scoreThreshold)
              .slice(0, limit)

            if (results.length === 0) {
              return {
                content: [{ type: 'text', text: 'No relevant memories found.' }],
                details: { count: 0 },
              }
            }

            const text = results
              .map((item, index) => `${index + 1}. ${item.content} (${((item.score ?? 0) * 100).toFixed(0)}%)`)
              .join('\n')

            return {
              content: [{ type: 'text', text: `Found ${results.length} memories:\n\n${text}` }],
              details: {
                count: results.length,
                memories: results.map((item) => ({
                  id: item.memoryId,
                  text: item.content,
                  score: item.score,
                })),
              },
            }
          } catch (error) {
            api.logger.warn(`memory-clawmaster-powermem: recall failed: ${String(error)}`)
            return {
              content: [{ type: 'text', text: `Memory search failed: ${error instanceof Error ? error.message : String(error)}` }],
              details: { error: String(error) },
            }
          }
        },
      },
      { name: 'memory_recall' },
    )

    api.on('before_dispatch', async (event: unknown) => {
      const e = event as { content?: string; body?: string; sessionKey?: string; senderId?: string; channel?: string }
      const text = typeof e.content === 'string' ? e.content : typeof e.body === 'string' ? e.body : ''
      const key = dispatchKey(e)
      const pending = pendingWikiLinks.get(key)
      if (pending && Date.now() - pending.createdAt > WIKI_LINK_CHOICE_TTL_MS) {
        pendingWikiLinks.delete(key)
      }

      const choice = parseWikiLinkChoiceForTest(text)
      if (choice && pendingWikiLinks.has(key)) {
        const link = pendingWikiLinks.get(key)!
        pendingWikiLinks.delete(key)

        if (choice === 'current_conversation_only') {
          return {
            handled: true,
            text: `Okay. I will keep ${link.url} only in this conversation. I did not fetch it or save it to Wiki.`,
          }
        }

        if (choice === 'summarize_once') {
          try {
            const summary = await summarizeWikiUrlOnce(link.url)
            return {
              handled: true,
              text: [
                `Fetched for this turn only: ${summary.title}`,
                '',
                ...summary.bullets.map((item) => `- ${item}`),
                '',
                'No Wiki records or markdown pages were created.',
                ...(summary.warnings.length > 0 ? [`Warnings: ${summary.warnings.join(', ')}`] : []),
              ].join('\n'),
            }
          } catch (error) {
            return {
              handled: true,
              text: `I could not summarize ${link.url}: ${error instanceof Error ? error.message : String(error)}`,
            }
          }
        }

        try {
          const ingested = await ingestWikiUrlFromPlugin({
            url: link.url,
            scope,
            managedContext,
          })
          return {
            handled: true,
            text: [
              `Ingested into Wiki: ${ingested.title}`,
              '',
              `- Page: [${ingested.pageId}]`,
              `- Memory: ${ingested.memoryId}`,
              `- Markdown: ${ingested.pagePath}`,
              ...(ingested.warnings.length > 0 ? [`- Warnings: ${ingested.warnings.join(', ')}`] : []),
            ].join('\n'),
          }
        } catch (error) {
          return {
            handled: true,
            text: `I could not ingest ${link.url} into Wiki: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      }

      const url = extractStandaloneHttpUrlForTest(text)
      if (!url) return

      pendingWikiLinks.set(key, { url, createdAt: Date.now() })
      return {
        handled: true,
        text: buildWikiLinkChoiceReplyForTest(url),
      }
    })

    api.registerTool(
      {
        name: 'memory_store',
        label: 'Memory Store',
        description: 'Store a stable fact, preference, or reusable note in long-term memory.',
        parameters: Type.Object({
          text: Type.String({ description: 'Information to remember' }),
          importance: Type.Optional(Type.Number({ description: 'Importance between 0 and 1' })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const text = String(params.text ?? '').trim()
          const importance = typeof params.importance === 'number' ? params.importance : 0.7

          try {
            const created = await addManagedMemory(
              {
                content: text,
                ...withManagedScope(scope),
                metadata: { importance },
              },
              managedContext,
            )

            return {
              content: [{ type: 'text', text: `Stored: ${created.content.slice(0, 80)}${created.content.length > 80 ? '...' : ''}` }],
              details: {
                action: 'created',
                id: created.memoryId,
              },
            }
          } catch (error) {
            api.logger.warn(`memory-clawmaster-powermem: store failed: ${String(error)}`)
            return {
              content: [{ type: 'text', text: `Failed to store memory: ${error instanceof Error ? error.message : String(error)}` }],
              details: { error: String(error) },
            }
          }
        },
      },
      { name: 'memory_store' },
    )

    api.registerTool(
      {
        name: 'memory_forget',
        label: 'Memory Forget',
        description: 'Delete one or more managed long-term memories.',
        parameters: Type.Object({
          query: Type.Optional(Type.String({ description: 'Search query to find a memory to remove' })),
          memoryId: Type.Optional(Type.String({ description: 'Explicit memory ID' })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const query = typeof params.query === 'string' ? params.query.trim() : ''
          const memoryId = typeof params.memoryId === 'string' ? params.memoryId.trim() : ''

          try {
            if (memoryId) {
              await deleteManagedMemory(memoryId, managedContext)
              return {
                content: [{ type: 'text', text: `Memory ${memoryId} forgotten.` }],
                details: { action: 'deleted', id: memoryId },
              }
            }

            if (query) {
              const candidates = await searchManagedMemories(
                query,
                withManagedScope(scope, { limit: 5 }),
                managedContext,
              )
              if (candidates.length === 0) {
                return {
                  content: [{ type: 'text', text: 'No matching memories found.' }],
                  details: { found: 0 },
                }
              }
              if (candidates.length === 1 && (candidates[0]?.score ?? 0) > 0.9) {
                await deleteManagedMemory(candidates[0]!.memoryId, managedContext)
                return {
                  content: [{ type: 'text', text: `Forgotten: "${candidates[0]!.content.slice(0, 60)}..."` }],
                  details: { action: 'deleted', id: candidates[0]!.memoryId },
                }
              }
              const list = candidates
                .map((item) => `- [${item.memoryId.slice(0, 8)}] ${item.content.slice(0, 60)}...`)
                .join('\n')
              return {
                content: [{ type: 'text', text: `Found ${candidates.length} candidates. Specify memoryId:\n${list}` }],
                details: {
                  action: 'candidates',
                  candidates: candidates.map((item) => ({
                    id: item.memoryId,
                    text: item.content,
                    score: item.score,
                  })),
                },
              }
            }

            return {
              content: [{ type: 'text', text: 'Provide query or memoryId.' }],
              details: { error: 'missing_param' },
            }
          } catch (error) {
            api.logger.warn(`memory-clawmaster-powermem: forget failed: ${String(error)}`)
            return {
              content: [{ type: 'text', text: `Failed to forget: ${error instanceof Error ? error.message : String(error)}` }],
              details: { error: String(error) },
            }
          }
        },
      },
      { name: 'memory_forget' },
    )

    api.registerCli(
      ({ program }: OpenClawPluginCliContext) => {
        const ltm = program.command('ltm').description('ClawMaster-managed PowerMem memory commands')

        ltm
          .command('status')
          .description('Show managed PowerMem status')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const status = await getManagedMemoryStatusPayload(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(status, null, 2))
                return
              }
              console.log(`PowerMem: ${status.provisioned ? 'healthy' : 'ready'} (${status.dbPath ?? status.storagePath})`)
            } catch (error) {
              console.error('Managed PowerMem status failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('stats')
          .description('Show managed PowerMem statistics')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const stats = await getManagedMemoryStatsPayload(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(stats, null, 2))
                return
              }
              console.log(`PowerMem stats: ${stats.totalMemories} memories, ${stats.userCount} users`)
            } catch (error) {
              console.error('Managed PowerMem stats failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('search')
          .description('Search managed memories')
          .argument('[query]', 'Search query')
          .option('--query <query>', 'Search query')
          .option('--limit <n>', 'Max results', '5')
          .option('--user <userId>', 'User filter')
          .option('--agent <agentId>', 'Agent filter')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[1] ?? {}) as {
              limit?: string
              query?: string
              user?: string
              agent?: string
              json?: boolean
            }
            const query = normalizeSearchQuery(args[0], opts)
            const limit = Number.parseInt(opts.limit ?? '5', 10)
            const resolvedScope = resolveCliScope(scope, opts)
            const results = await searchManagedMemories(
              query,
              withManagedScope(resolvedScope, { limit }),
              managedContext,
            )
            if (opts.json) {
              console.log(JSON.stringify(results, null, 2))
              return
            }
            console.log(JSON.stringify(results, null, 2))
          })

        ltm
          .command('list')
          .description('List managed memories')
          .option('--limit <n>', 'Max results', '20')
          .option('--offset <n>', 'Offset', '0')
          .option('--user <userId>', 'User filter')
          .option('--agent <agentId>', 'Agent filter')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as {
              limit?: string
              offset?: string
              user?: string
              agent?: string
              json?: boolean
            }
            try {
              const resolvedScope = resolveCliScope(scope, opts)
              const result = await listManagedMemories(
                {
                  limit: Number.parseInt(opts.limit ?? '20', 10),
                  offset: Number.parseInt(opts.offset ?? '0', 10),
                  userId: resolvedScope.userId,
                  agentId: resolvedScope.agentId,
                },
                managedContext,
              )
              if (opts.json) {
                console.log(JSON.stringify(result, null, 2))
                return
              }
              console.log(JSON.stringify(result.memories, null, 2))
            } catch (error) {
              console.error('Managed PowerMem list failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('health')
          .description('Check managed PowerMem status')
          .action(async () => {
            try {
              const status = await getManagedMemoryStatusPayload(managedContext)
              console.log(`PowerMem: ${status.provisioned ? 'healthy' : 'ready'} (${status.storagePath})`)
            } catch (error) {
              console.error('Managed PowerMem health check failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('add')
          .description('Manually add a managed memory')
          .argument('<text>', 'Content to store')
          .option('--user <userId>', 'User id override')
          .option('--agent <agentId>', 'Agent id override')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const text = String(args[0] ?? '').trim()
            const opts = (args[1] ?? {}) as { user?: string; agent?: string; json?: boolean }
            try {
              const resolvedScope = resolveCliScope(scope, opts)
              const created = await addManagedMemory(
                {
                  content: text,
                  ...withManagedScope(resolvedScope),
                },
                managedContext,
              )
              if (opts.json) {
                console.log(JSON.stringify(created, null, 2))
                return
              }
              console.log(`Stored memory ${created.memoryId}`)
            } catch (error) {
              console.error('Managed PowerMem add failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('delete')
          .description('Delete a managed memory')
          .argument('<memoryId>', 'Managed memory id')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const memoryId = String(args[0] ?? '').trim()
            const opts = (args[1] ?? {}) as { json?: boolean }
            try {
              const deleted = await deleteManagedMemory(memoryId, managedContext)
              if (opts.json) {
                console.log(JSON.stringify({ deleted }, null, 2))
                return
              }
              console.log(deleted ? `Deleted memory ${memoryId}` : `Memory ${memoryId} was already removed`)
            } catch (error) {
              console.error('Managed PowerMem delete failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('reset')
          .description('Reset managed PowerMem storage')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const stats = await resetManagedMemory(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(stats, null, 2))
                return
              }
              console.log(`Managed PowerMem reset complete (${stats.totalMemories} memories remaining)`)
            } catch (error) {
              console.error('Managed PowerMem reset failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('import-status')
          .description('Show OpenClaw workspace import status')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const status = await getManagedMemoryImportStatus(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(status, null, 2))
                return
              }
              console.log(
                `Import status: ${status.importedMemoryCount}/${status.availableSourceCount} sources tracked`,
              )
            } catch (error) {
              console.error('Managed PowerMem import status failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('import')
          .description('Import OpenClaw workspace memories into managed PowerMem')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const imported = await importOpenclawWorkspaceMemories(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(imported, null, 2))
                return
              }
              console.log(
                `Imported workspace memories: ${imported.lastRun?.imported ?? 0} new, ${imported.lastRun?.updated ?? 0} updated, ${imported.lastRun?.skipped ?? 0} unchanged, ${imported.importedMemoryCount} tracked.`,
              )
            } catch (error) {
              console.error('Managed PowerMem import failed:', error)
              process.exitCode = 1
            }
          })

        const existingTopLevelMemory = findChildCommand(program as CommandLike, 'memory')

        if (!existingTopLevelMemory) {
          const memory = program.command('memory').description('Managed memory compatibility commands')

          memory
            .command('status')
            .description('Show managed memory status')
            .option('--json', 'Output JSON')
            .action(async (...args: unknown[]) => {
              const opts = (args[0] ?? {}) as { json?: boolean }
              try {
                const status = await getManagedMemoryStatusPayload(managedContext)
                const payload = buildManagedStatusEntries(cfg, status, managedContext, scope.agentId)
                if (opts.json) {
                  console.log(JSON.stringify(payload, null, 2))
                  return
                }
                console.log(JSON.stringify(payload, null, 2))
              } catch (error) {
                console.error('Managed memory status failed:', error)
                process.exitCode = 1
              }
            })

          memory
            .command('search')
            .description('Search managed memories')
            .argument('[query]', 'Search query')
            .option('--query <query>', 'Search query')
            .option('--max-results <n>', 'Max results', '20')
            .option('--agent <agentId>', 'Agent filter')
            .option('--json', 'Output JSON')
            .action(async (...args: unknown[]) => {
              const opts = (args[1] ?? {}) as {
                query?: string
                maxResults?: string
                agent?: string
                json?: boolean
              }
              const query = normalizeSearchQuery(args[0], opts)
              const limit = Number.parseInt(opts.maxResults ?? '20', 10)
              try {
                const results = await searchManagedMemories(
                  query,
                  withManagedScope(
                    {
                      userId: scope.userId,
                      agentId: opts.agent?.trim() || scope.agentId,
                    },
                    { limit },
                  ),
                  managedContext,
                )
                if (opts.json) {
                  console.log(JSON.stringify(results, null, 2))
                  return
                }
                console.log(JSON.stringify(results, null, 2))
              } catch (error) {
                console.error('Managed memory search failed:', error)
                process.exitCode = 1
              }
            })
        }

        ensureMemoryIndexCompatibilityCommandForTest(program as CommandLike, async () => {
          try {
            const imported = await importOpenclawWorkspaceMemories(managedContext)
            const status = await getManagedMemoryStatusPayload(managedContext)
            console.log(
              `Managed PowerMem index ready (${status.engine}, ${status.dbPath ?? status.storagePath})`
            )
            console.log(
              `Imported workspace memories: ${imported.lastRun?.imported ?? 0} new, ${imported.lastRun?.updated ?? 0} updated, ${imported.lastRun?.skipped ?? 0} unchanged, ${imported.importedMemoryCount} tracked.`,
            )
          } catch (error) {
            console.error('Managed memory index check failed:', error)
            process.exitCode = 1
          }
        })
      },
      { commands: ['ltm', 'memory'] },
    )

    if (cfg.autoRecall) {
      api.on('before_agent_start', async (event: unknown) => {
        const e = event as { prompt?: string; messages?: unknown[] }
        const query =
          (typeof e.prompt === 'string' && e.prompt.trim().length >= 5
            ? e.prompt.trim()
            : lastUserMessageText(e.messages)) || ''
        if (query.length < 5) {
          return { prependSystemContext: MEMORY_RECALL_GUIDANCE }
        }

        try {
          const results = (await searchManagedMemories(
            query,
            withManagedScope(scope, {
              limit: Math.min(100, Math.max(cfg.recallLimit * 2, cfg.recallLimit + 10)),
            }),
            managedContext,
          ))
            .filter((item) => (item.score ?? 0) >= cfg.recallScoreThreshold)

          const recallContext = buildAutoRecallContextForTest(query, results, cfg.recallLimit)
          return {
            prependSystemContext: MEMORY_RECALL_GUIDANCE,
            ...(recallContext.prependContext
              ? {
                  prependContext: recallContext.prependContext,
                }
              : {}),
          }
        } catch (error) {
          api.logger.warn(`memory-clawmaster-powermem: recall failed: ${String(error)}`)
          return { prependSystemContext: MEMORY_RECALL_GUIDANCE }
        }
      })
    }

    if (cfg.autoCapture) {
      api.on('agent_end', async (event: unknown) => {
        const e = event as { messages?: unknown[]; success?: boolean }
        if (!e.success || !Array.isArray(e.messages) || e.messages.length === 0) {
          return
        }

        try {
          const texts: string[] = []
          for (const msg of e.messages) {
            if (!msg || typeof msg !== 'object') continue
            const msgObj = msg as Record<string, unknown>
            const role = msgObj.role
            if (role !== 'user' && role !== 'assistant') continue
            const content = msgObj.content
            if (typeof content === 'string') {
              texts.push(content)
              continue
            }
            if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === 'object' &&
                  (block as Record<string, unknown>).type === 'text' &&
                  typeof (block as Record<string, unknown>).text === 'string'
                ) {
                  texts.push((block as Record<string, unknown>).text as string)
                }
              }
            }
          }

          const sanitized = texts
            .map((item) => item.trim())
            .filter((item) => item.length >= 10)
            .filter((item) => !item.includes('<relevant-memories>') && !item.includes('<relevant-wiki>') && !(item.startsWith('<') && item.includes('</')))
          if (sanitized.length === 0) return

          const combined = sanitized.join('\n\n')
          const chunks: string[] = []
          for (let index = 0; index < combined.length && chunks.length < 3; index += 6000) {
            chunks.push(combined.slice(index, index + 6000))
          }

          let stored = 0
          for (const chunk of chunks) {
            await addManagedMemory(
              {
                content: chunk,
                ...withManagedScope(scope),
                metadata: { source: 'openclaw-gateway-auto-capture' },
              },
              managedContext,
            )
            stored += 1
          }
          if (stored > 0) {
            api.logger.info(`memory-clawmaster-powermem: auto-captured ${stored} memory chunk(s)`)
          }
        } catch (error) {
          api.logger.warn(`memory-clawmaster-powermem: capture failed: ${String(error)}`)
        }
      })
    }

    api.registerService({
      id: 'memory-clawmaster-powermem',
      start: async (_ctx: OpenClawPluginServiceContext) => {
        try {
          const status = await getManagedMemoryStatusPayload(managedContext)
          api.logger.info(
            `memory-clawmaster-powermem: initialized (engine: ${status.engine}, runtimeRoot: ${status.runtimeRoot}, provisioned: ${status.provisioned})`,
          )
        } catch (error) {
          api.logger.warn(`memory-clawmaster-powermem: initialization check failed: ${String(error)}`)
        }
      },
    })
  },
}

export default plugin
