import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  addManagedMemory,
  deleteManagedMemory,
  listManagedMemories,
  resolveManagedMemoryStoreContext,
  searchManagedMemories,
  type ManagedMemoryContext,
} from './managedMemory.js'
import {
  getOpenclawPathModule,
  getOpenclawProfileSelection,
  type OpenclawProfileContext,
  type OpenclawProfileSelection,
} from '../openclawProfile.js'

export type WikiPageType = 'entity' | 'concept' | 'source' | 'synthesis' | 'process'
export type WikiFreshnessStatus = 'fresh' | 'aging' | 'stale'
export type WikiLifecycleState = 'just_ingested' | 'updated' | 'evolved' | 'outdated'
export type WikiIngestState = 'ingested' | 'updated' | 'skipped' | 'needs_confirmation'
export type WikiLintSeverity = 'info' | 'warning' | 'error'

export interface WikiServiceContext extends OpenclawProfileContext {
  profileSelection?: OpenclawProfileSelection
  vaultRootOverride?: string
  managedMemoryContext?: ManagedMemoryContext
  autoEvolveOnWrite?: boolean
}

export interface WikiStatusPayload {
  profileKey: string
  vaultRoot: string
  rawRoot: string
  pagesRoot: string
  metaRoot: string
  indexPath: string
  logPath: string
  schemaPath: string
  freshnessPath: string
  conflictsPath: string
  pageCount: number
  sourceCount: number
  staleCount: number
  conflictCount: number
  memory: {
    engine: string
    storagePath: string
  }
}

export interface WikiPageSummary {
  id: string
  title: string
  type: WikiPageType
  path: string
  relativePath: string
  snippet: string
  sourceCount: number
  freshnessStatus: WikiFreshnessStatus
  freshnessScore: number
  lifecycleState: WikiLifecycleState
  createdAt: string
  updatedAt: string
  evolvedAt: string
  evolveCheckedAt: string
  evolveChangedAt: string
  evolveChangeSummary: string
  evolveSource: string
  lastAccessedAt: string
  links: string[]
  backlinks: string[]
  memoryIds: string[]
}

export interface WikiPageDetail extends WikiPageSummary {
  content: string
  frontmatter: Record<string, string>
  citations: WikiCitation[]
}

export interface WikiCitation {
  title: string
  sourcePath?: string
  sourceUrl?: string
}

export interface WikiSearchResult extends WikiPageSummary {
  score: number
  matchType: 'keyword' | 'semantic'
}

export interface WikiIngestInput {
  title?: string
  content?: string
  sourceUrl?: string
  sourcePath?: string
  sourceType?: string
  pageType?: WikiPageType
  confirmUrlIngest?: boolean
}

export interface WikiIngestPayload {
  state: WikiIngestState
  confirmationRequired: boolean
  message: string
  page?: WikiPageSummary
  memoryId?: string
  pagesCreated: number
  pagesUpdated: number
  warnings: string[]
  evolve?: WikiEvolvePayload
}

export interface WikiQueryPayload {
  query: string
  usedWiki: boolean
  answer: string
  results: WikiSearchResult[]
  citations: WikiCitation[]
  offerToSave: boolean
}

export type WikiAssistReason = 'explicit_wiki' | 'knowledge_question' | 'project_context' | 'not_relevant'

export interface WikiAssistPayload extends WikiQueryPayload {
  reason: WikiAssistReason
}

export interface WikiSynthesizeInput {
  query: string
  title?: string
  limit?: number
}

export interface WikiSynthesizePayload {
  title: string
  query: string
  page: WikiPageSummary
  memoryId: string
  pagesCreated: number
  pagesUpdated: number
  sourcePageIds: string[]
  citations: WikiCitation[]
  warnings: string[]
  evolve?: WikiEvolvePayload
}

export interface WikiLintIssue {
  id: string
  severity: WikiLintSeverity
  kind: 'orphan' | 'missing-link' | 'duplicate-title' | 'stale' | 'schema'
  pageId?: string
  title: string
  detail: string
}

export interface WikiLintPayload {
  checkedAt: string
  issueCount: number
  issues: WikiLintIssue[]
}

export interface WikiEvolvePayload {
  evolvedAt: string
  pageCount: number
  staleCount: number
  conflictCount: number
  changedPageIds: string[]
  related: Record<string, string[]>
  warnings: string[]
  freshness: Record<string, {
    score: number
    status: WikiFreshnessStatus
    lastAccessedAt: string
    updatedAt: string
    checkedAt: string
  }>
}

export type WikiLinkAction = 'ingest' | 'summarize_once' | 'current_conversation_only'

export interface WikiLinkChoicePayload {
  input: string
  urls: string[]
  requiresChoice: boolean
  defaultAction: WikiLinkAction
  actions: Array<{
    id: WikiLinkAction
    label: string
    description: string
  }>
  message: string
}

interface WikiPaths {
  profileKey: string
  vaultRoot: string
  rawRoot: string
  pagesRoot: string
  metaRoot: string
  indexPath: string
  logPath: string
  schemaPath: string
  freshnessPath: string
  conflictsPath: string
}

interface WikiIngestStateEntry {
  fingerprint: string
  pageId: string
  memoryId: string
  updatedAt: string
}

interface WikiIngestStateFile {
  version: 1
  sources: Record<string, WikiIngestStateEntry>
}

interface ParsedPage {
  filePath: string
  relativePath: string
  frontmatter: Record<string, string>
  body: string
}

type WikiFreshnessMeta = Record<string, {
  score?: number
  status?: WikiFreshnessStatus
  lastAccessedAt?: string
  updatedAt?: string
  checkedAt?: string
}>

const PAGE_DIRS: Record<WikiPageType, string> = {
  entity: 'entities',
  concept: 'concepts',
  source: 'sources',
  synthesis: 'synthesis',
  process: 'processes',
}

const WIKI_STATE_FILE = 'ingest-state.json'
const DEFAULT_FRESHNESS_SCORE = 1

function nowIso(): string {
  return new Date().toISOString()
}

function getProfileKey(profileSelection: OpenclawProfileSelection): string {
  if (profileSelection.kind === 'named' && profileSelection.name) return `named:${profileSelection.name}`
  return profileSelection.kind
}

function resolveOpenclawStateDir(
  profileSelection: OpenclawProfileSelection,
  context: WikiServiceContext,
): string {
  const pathModule = getOpenclawPathModule(context.platform)
  const homeDir = context.homeDir ?? os.homedir()
  if (profileSelection.kind === 'named' && profileSelection.name) {
    return pathModule.join(homeDir, `.openclaw-${profileSelection.name}`)
  }
  if (profileSelection.kind === 'dev') {
    return pathModule.join(homeDir, '.openclaw-dev')
  }
  return pathModule.join(homeDir, '.openclaw')
}

export function resolveWikiPaths(context: WikiServiceContext = {}): WikiPaths {
  const profileSelection = context.profileSelection ?? getOpenclawProfileSelection(context)
  const vaultRoot =
    context.vaultRootOverride
    ?? process.env['CLAWMASTER_WIKI_ROOT']?.trim()
    ?? path.join(resolveOpenclawStateDir(profileSelection, context), 'wiki')
  const pagesRoot = path.join(vaultRoot, 'pages')
  const metaRoot = path.join(vaultRoot, '.meta')
  return {
    profileKey: getProfileKey(profileSelection),
    vaultRoot,
    rawRoot: path.join(vaultRoot, 'raw'),
    pagesRoot,
    metaRoot,
    indexPath: path.join(vaultRoot, 'index.md'),
    logPath: path.join(vaultRoot, 'log.md'),
    schemaPath: path.join(vaultRoot, 'SCHEMA.md'),
    freshnessPath: path.join(metaRoot, 'freshness.json'),
    conflictsPath: path.join(metaRoot, 'conflicts.json'),
  }
}

function statePath(paths: WikiPaths): string {
  return path.join(paths.metaRoot, WIKI_STATE_FILE)
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) return
  await fs.writeFile(filePath, content, 'utf8')
}

export async function ensureWikiVault(context: WikiServiceContext = {}): Promise<WikiPaths> {
  const paths = resolveWikiPaths(context)
  await fs.mkdir(paths.rawRoot, { recursive: true })
  await fs.mkdir(paths.metaRoot, { recursive: true })
  await Promise.all(
    Object.values(PAGE_DIRS).map((dir) => fs.mkdir(path.join(paths.pagesRoot, dir), { recursive: true })),
  )
  await writeIfMissing(
    paths.indexPath,
    '# Wiki Index\n\nCompiled wiki articles will appear here after ingest.\n',
  )
  await writeIfMissing(
    paths.logPath,
    '# Wiki Log\n\n',
  )
  await writeIfMissing(
    paths.schemaPath,
    '# Wiki Schema\n\nPages use YAML frontmatter with id, title, type, source, freshness, and provenance fields.\n',
  )
  await writeIfMissing(paths.freshnessPath, '{}\n')
  await writeIfMissing(paths.conflictsPath, '[]\n')
  await writeIfMissing(statePath(paths), `${JSON.stringify({ version: 1, sources: {} }, null, 2)}\n`)
  return paths
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `wiki-${Date.now()}`
}

function fingerprintSource(input: {
  title: string
  content: string
  sourceUrl?: string
  sourcePath?: string
}): string {
  return createHash('sha256')
    .update(input.title)
    .update('\n')
    .update(input.sourceUrl ?? '')
    .update('\n')
    .update(input.sourcePath ?? '')
    .update('\n')
    .update(input.content)
    .digest('hex')
}

function sourceKey(input: WikiIngestInput, title: string): string {
  return input.sourceUrl?.trim() || input.sourcePath?.trim() || `title:${slugify(title)}`
}

function looksLikeUrl(value: string | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()))
}

function extractHttpUrls(value: string): string[] {
  const urls = new Set<string>()
  const pattern = /https?:\/\/[^\s<>"')\]]+/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value))) {
    const normalized = match[0].replace(/[.,;:!?]+$/, '')
    if (normalized) urls.add(normalized)
  }
  return [...urls]
}

export function classifyWikiQuestion(query: string): { useWiki: boolean; reason: WikiAssistReason } {
  const text = query.trim().toLowerCase()
  if (text.length < 5) return { useWiki: false, reason: 'not_relevant' }

  if (/\b(wiki|knowledge base|kb|what do we know|what have we learned|known about)\b/i.test(text)) {
    return { useWiki: true, reason: 'explicit_wiki' }
  }

  if (/\b(prior|previous|earlier|saved|remembered|notes?|docs?|documentation|research|sources?|articles?|citations?|decision|decisions|rationale)\b/i.test(text)) {
    return { useWiki: true, reason: 'knowledge_question' }
  }

  if (/\b(project context|codebase context|architecture|design choice|implementation plan|roadmap|issue #?\d+|pr #?\d+)\b/i.test(text)) {
    return { useWiki: true, reason: 'project_context' }
  }

  return { useWiki: false, reason: 'not_relevant' }
}

function inferTitle(input: WikiIngestInput): string {
  if (input.title?.trim()) return input.title.trim()
  if (input.sourceUrl?.trim()) {
    try {
      const url = new URL(input.sourceUrl.trim())
      return url.hostname + url.pathname.replace(/\/$/, '')
    } catch {
      return input.sourceUrl.trim()
    }
  }
  if (input.sourcePath?.trim()) return path.basename(input.sourcePath.trim())
  const firstLine = input.content?.split(/\r?\n/).find((line) => line.trim())?.trim()
  return firstLine?.replace(/^#+\s*/, '').slice(0, 80) || 'Untitled wiki article'
}

function inferPageType(input: WikiIngestInput): WikiPageType {
  return input.pageType ?? 'source'
}

function normalizeContent(input: WikiIngestInput): string {
  const content = input.content?.trim()
  if (content) return content
  if (input.sourceUrl?.trim()) return `Source URL: ${input.sourceUrl.trim()}`
  return ''
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function htmlToReadableText(html: string): { title?: string; text: string } {
  const title = decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '')
  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
  return { title: title || undefined, text }
}

async function fetchUrlContent(sourceUrl: string): Promise<{ title?: string; content: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'OpenClaw-Wiki/1.0',
      },
    })
    if (!response.ok) {
      throw new Error(`URL fetch failed with HTTP ${response.status}`)
    }
    const raw = (await response.text()).slice(0, 500_000)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('html') || /<html[\s>]/i.test(raw)) {
      const parsed = htmlToReadableText(raw)
      return {
        title: parsed.title,
        content: parsed.text || `Source URL: ${sourceUrl}`,
      }
    }
    return { content: raw.trim() || `Source URL: ${sourceUrl}` }
  } finally {
    clearTimeout(timeout)
  }
}

function renderFrontmatter(values: Record<string, string | number | boolean | null | undefined>): string {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      if (typeof value === 'number' || typeof value === 'boolean') return `${key}: ${value}`
      return `${key}: ${JSON.stringify(String(value))}`
    })
  return `---\n${lines.join('\n')}\n---\n`
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { frontmatter: {}, body: raw }
  const block = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\r?\n/, '')
  const frontmatter: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index < 0) continue
    const key = line.slice(0, index).trim()
    const rawValue = line.slice(index + 1).trim()
    if (!key) continue
    if (/^-?\d+$/.test(rawValue) && !Number.isSafeInteger(Number(rawValue))) {
      frontmatter[key] = rawValue
      continue
    }
    try {
      const parsed = JSON.parse(rawValue) as unknown
      frontmatter[key] = String(parsed)
    } catch {
      frontmatter[key] = rawValue
    }
  }
  return { frontmatter, body }
}

function renderMarkdownWithFrontmatter(
  frontmatter: Record<string, string | number | boolean | null | undefined>,
  body: string,
): string {
  return `${renderFrontmatter(frontmatter)}\n${body.replace(/^\r?\n/, '')}`
}

function extractWikiLinks(content: string): string[] {
  const links = new Set<string>()
  const pattern = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content))) {
    const link = match[1]?.trim()
    if (link) links.add(link)
  }
  return [...links]
}

function makeSnippet(content: string, query = ''): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (!query.trim()) return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
  const lower = compact.toLowerCase()
  const needle = query.trim().toLowerCase()
  const index = lower.indexOf(needle)
  if (index < 0) return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
  const start = Math.max(0, index - 70)
  const end = Math.min(compact.length, index + needle.length + 90)
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`
}

function freshnessStatus(score: number): WikiFreshnessStatus {
  if (score < 0.35) return 'stale'
  if (score < 0.7) return 'aging'
  return 'fresh'
}

function lifecycleState(frontmatter: Record<string, string>, freshness: WikiFreshnessStatus): WikiLifecycleState {
  if (freshness === 'stale') return 'outdated'

  if (frontmatter.evolveChangedAt) return 'evolved'

  const createdMs = Date.parse(frontmatter.createdAt || '')
  const nowMs = Date.now()
  if (Number.isFinite(createdMs) && nowMs - createdMs < 86_400_000) {
    return 'just_ingested'
  }

  const createdAt = frontmatter.createdAt || ''
  const updatedAt = frontmatter.updatedAt || ''
  if (createdAt && updatedAt && createdAt !== updatedAt) {
    return 'updated'
  }

  return 'updated'
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function countSources(frontmatter: Record<string, string>, body: string): number {
  const explicitCount = frontmatter.sourceCount ? parseNumber(frontmatter.sourceCount, 0) : 0
  if (explicitCount > 0) return explicitCount

  const sources = new Set<string>()
  if (frontmatter.sourceUrl) sources.add(frontmatter.sourceUrl)
  if (frontmatter.sourcePath) sources.add(frontmatter.sourcePath)
  const sourceSection = body.match(/^## Sources\s*\n+([\s\S]*?)(?:\n##\s|\n#\s|$)/m)?.[1] ?? ''
  for (const line of sourceSection.matchAll(/^(?:[-*]|\d+\.)\s+(.+)$/gm)) {
    const source = line[1]?.trim()
    if (source) sources.add(source)
  }
  return sources.size
}

function parseCitations(frontmatter: Record<string, string>): WikiCitation[] {
  if (frontmatter.sourceUrls || frontmatter.sourcePaths) {
    const urls = (frontmatter.sourceUrls ?? '').split('|').map((item) => item.trim()).filter(Boolean)
    const paths = (frontmatter.sourcePaths ?? '').split('|').map((item) => item.trim()).filter(Boolean)
    const titles = (frontmatter.sourceTitles ?? '').split('|').map((item) => item.trim()).filter(Boolean)
    const count = Math.max(urls.length, paths.length, titles.length)
    return Array.from({ length: count }, (_, index) => ({
      title: titles[index] || urls[index] || paths[index] || 'Source',
      sourceUrl: urls[index],
      sourcePath: paths[index],
    })).filter((citation) => citation.sourceUrl || citation.sourcePath)
  }
  const citation: WikiCitation = {
    title: frontmatter.sourceTitle || frontmatter.title || 'Source',
    sourcePath: frontmatter.sourcePath || undefined,
    sourceUrl: frontmatter.sourceUrl || undefined,
  }
  return citation.sourcePath || citation.sourceUrl ? [citation] : []
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readIngestState(paths: WikiPaths): Promise<WikiIngestStateFile> {
  const parsed = await readJsonFile<WikiIngestStateFile>(statePath(paths), { version: 1, sources: {} })
  return {
    version: 1,
    sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
  }
}

async function writeIngestState(paths: WikiPaths, state: WikiIngestStateFile): Promise<void> {
  await writeJsonFile(statePath(paths), state)
}

async function collectMarkdownFiles(root: string, out: string[]): Promise<void> {
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const filePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await collectMarkdownFiles(filePath, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(filePath)
    }
  }
}

async function readParsedPages(context: WikiServiceContext = {}): Promise<ParsedPage[]> {
  const paths = await ensureWikiVault(context)
  const files: string[] = []
  await collectMarkdownFiles(paths.pagesRoot, files)
  const pages = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseFrontmatter(raw)
      return {
        filePath,
        relativePath: path.relative(paths.vaultRoot, filePath),
        ...parsed,
      }
    }),
  )
  return pages
}

function pageTypeFromRelativePath(relativePath: string): WikiPageType {
  const normalized = relativePath.replace(/\\/g, '/')
  for (const [type, dir] of Object.entries(PAGE_DIRS) as Array<[WikiPageType, string]>) {
    if (normalized.includes(`/pages/${dir}/`) || normalized.startsWith(`pages/${dir}/`)) return type
  }
  return 'source'
}

function summarizeParsedPages(pages: ParsedPage[], query = '', freshnessMeta: WikiFreshnessMeta = {}): WikiPageSummary[] {
  const titleToId = new Map<string, string>()
  for (const page of pages) {
    const id = page.frontmatter.id || slugify(page.frontmatter.title || path.basename(page.filePath, '.md'))
    const title = page.frontmatter.title || id
    titleToId.set(title, id)
    titleToId.set(id, id)
  }

  const backlinksById = new Map<string, Set<string>>()
  for (const page of pages) {
    const fromId = page.frontmatter.id || slugify(page.frontmatter.title || path.basename(page.filePath, '.md'))
    for (const link of extractWikiLinks(page.body)) {
      const targetId = titleToId.get(link) ?? slugify(link)
      if (!backlinksById.has(targetId)) backlinksById.set(targetId, new Set())
      backlinksById.get(targetId)!.add(fromId)
    }
  }

  return pages.map((page) => {
    const id = page.frontmatter.id || slugify(page.frontmatter.title || path.basename(page.filePath, '.md'))
    const title = page.frontmatter.title || id
    const type = (page.frontmatter.type as WikiPageType | undefined) ?? pageTypeFromRelativePath(page.relativePath)
    const meta = freshnessMeta[id]
    const score = typeof meta?.score === 'number'
      ? meta.score
      : parseNumber(page.frontmatter.freshnessScore, DEFAULT_FRESHNESS_SCORE)
    const resolvedFreshness = meta?.status ?? (page.frontmatter.freshnessStatus as WikiFreshnessStatus | undefined) ?? freshnessStatus(score)
    const evolvedAt = page.frontmatter.evolveChangedAt || ''
    return {
      id,
      title,
      type,
      path: page.filePath,
      relativePath: page.relativePath,
      snippet: makeSnippet(page.body.replace(/^# .+$/m, ''), query),
      sourceCount: countSources(page.frontmatter, page.body),
      freshnessStatus: resolvedFreshness,
      freshnessScore: score,
      lifecycleState: lifecycleState(page.frontmatter, resolvedFreshness),
      createdAt: page.frontmatter.createdAt || '',
      updatedAt: page.frontmatter.updatedAt || page.frontmatter.createdAt || '',
      evolvedAt,
      evolveCheckedAt: meta?.checkedAt || page.frontmatter.evolveCheckedAt || '',
      evolveChangedAt: page.frontmatter.evolveChangedAt || '',
      evolveChangeSummary: page.frontmatter.evolveChangeSummary || '',
      evolveSource: page.frontmatter.evolveSource || '',
      lastAccessedAt: meta?.lastAccessedAt || page.frontmatter.lastAccessedAt || '',
      links: extractWikiLinks(page.body),
      backlinks: [...(backlinksById.get(id) ?? new Set())],
      memoryIds: page.frontmatter.memoryId ? [page.frontmatter.memoryId] : [],
    }
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title))
}

function renderWikiPage(input: {
  id: string
  title: string
  type: WikiPageType
  sourceType: string
  sourcePath?: string
  sourceUrl?: string
  content: string
  memoryId: string
  fingerprint: string
  createdAt: string
  updatedAt: string
}): string {
  const fm = renderFrontmatter({
    id: input.id,
    title: input.title,
    type: input.type,
    sourceType: input.sourceType,
    sourcePath: input.sourcePath,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.title,
    memoryId: input.memoryId,
    fingerprint: input.fingerprint,
    durability: 'durable',
    category: input.type === 'process' ? 'procedure' : 'reference',
    freshnessScore: DEFAULT_FRESHNESS_SCORE,
    freshnessStatus: 'fresh',
    sourceCount: input.sourcePath || input.sourceUrl ? 1 : 0,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
  const sources = input.sourceUrl
    ? `\n## Sources\n\n- ${input.sourceUrl}\n`
    : input.sourcePath
      ? `\n## Sources\n\n- ${input.sourcePath}\n`
      : ''
  return `${fm}\n# ${input.title}\n\n${input.content.trim()}\n${sources}`
}

function renderGeneratedWikiPage(input: {
  id: string
  title: string
  type: WikiPageType
  content: string
  memoryId: string
  fingerprint: string
  sourcePages: WikiPageDetail[]
  createdAt: string
  updatedAt: string
}): string {
  const citations = input.sourcePages
    .flatMap((page) => page.citations)
    .filter((citation) => citation.sourceUrl || citation.sourcePath)
  const fm = renderFrontmatter({
    id: input.id,
    title: input.title,
    type: input.type,
    sourceType: 'synthesis',
    sourceTitle: input.title,
    sourceTitles: citations.map((citation) => citation.title).join('|'),
    sourceUrls: citations.map((citation) => citation.sourceUrl ?? '').join('|'),
    sourcePaths: citations.map((citation) => citation.sourcePath ?? '').join('|'),
    memoryId: input.memoryId,
    fingerprint: input.fingerprint,
    durability: 'durable',
    category: 'synthesis',
    freshnessScore: DEFAULT_FRESHNESS_SCORE,
    freshnessStatus: 'fresh',
    sourceCount: citations.length || input.sourcePages.length,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
  const sourceLines = input.sourcePages.map((page, index) => {
    const citation = page.citations[0]
    const source = citation?.sourceUrl || citation?.sourcePath || page.relativePath
    return `${index + 1}. [[${page.title}]] - ${source}`
  })
  return `${fm}\n# ${input.title}\n\n${input.content.trim()}\n\n## Sources\n\n${sourceLines.join('\n')}\n`
}

async function writeIndex(paths: WikiPaths, pages: WikiPageSummary[]): Promise<void> {
  const grouped = new Map<WikiPageType, WikiPageSummary[]>()
  for (const page of pages) {
    if (!grouped.has(page.type)) grouped.set(page.type, [])
    grouped.get(page.type)!.push(page)
  }
  const sections = [...grouped.entries()].map(([type, items]) => {
    const lines = items.map((page) => `- [[${page.title}]] - ${page.freshnessStatus}, ${page.updatedAt || 'unknown'}`)
    return `## ${type}\n\n${lines.join('\n')}`
  })
  await fs.writeFile(paths.indexPath, `# Wiki Index\n\n${sections.join('\n\n')}\n`, 'utf8')
}

async function appendLog(paths: WikiPaths, line: string): Promise<void> {
  await fs.appendFile(paths.logPath, `- ${nowIso()} ${line}\n`, 'utf8')
}

async function runAutoEvolveOnWrite(
  context: WikiServiceContext,
  warnings: string[],
): Promise<WikiEvolvePayload | undefined> {
  if (!context.autoEvolveOnWrite) return undefined
  try {
    return await evolveWiki({ ...context, autoEvolveOnWrite: false })
  } catch {
    warnings.push('auto_evolve_failed')
    return undefined
  }
}

function managedContext(context: WikiServiceContext): ManagedMemoryContext {
  return context.managedMemoryContext ?? {
    profileSelection: context.profileSelection,
    homeDir: context.homeDir,
    platform: context.platform,
  }
}

export async function getWikiStatus(context: WikiServiceContext = {}): Promise<WikiStatusPayload> {
  const paths = await ensureWikiVault(context)
  const pages = summarizeParsedPages(await readParsedPages(context))
  const conflicts = await readJsonFile<unknown[]>(paths.conflictsPath, [])
  const memoryStore = resolveManagedMemoryStoreContext(managedContext(context))
  return {
    profileKey: paths.profileKey,
    vaultRoot: paths.vaultRoot,
    rawRoot: paths.rawRoot,
    pagesRoot: paths.pagesRoot,
    metaRoot: paths.metaRoot,
    indexPath: paths.indexPath,
    logPath: paths.logPath,
    schemaPath: paths.schemaPath,
    freshnessPath: paths.freshnessPath,
    conflictsPath: paths.conflictsPath,
    pageCount: pages.length,
    sourceCount: pages.reduce((sum, page) => sum + page.sourceCount, 0),
    staleCount: pages.filter((page) => page.freshnessStatus === 'stale').length,
    conflictCount: conflicts.length,
    memory: {
      engine: memoryStore.engine,
      storagePath: memoryStore.storagePath,
    },
  }
}

export async function listWikiPages(context: WikiServiceContext = {}): Promise<WikiPageSummary[]> {
  const paths = resolveWikiPaths(context)
  const freshnessMeta = await readJsonFile<WikiFreshnessMeta>(paths.freshnessPath, {})
  return summarizeParsedPages(await readParsedPages(context), '', freshnessMeta)
}

export async function getWikiPage(pageId: string, context: WikiServiceContext = {}): Promise<WikiPageDetail> {
  const paths = resolveWikiPaths(context)
  const freshnessMeta = await readJsonFile<WikiFreshnessMeta>(paths.freshnessPath, {})
  const pages = await readParsedPages(context)
  const summaries = summarizeParsedPages(pages, '', freshnessMeta)
  const summary = summaries.find((page) => page.id === pageId || slugify(page.title) === pageId)
  if (!summary) throw new Error(`Wiki page not found: ${pageId}`)
  const parsed = pages.find((page) => page.filePath === summary.path)
  if (!parsed) throw new Error(`Wiki page file not found: ${pageId}`)
  return {
    ...summary,
    content: parsed.body,
    frontmatter: parsed.frontmatter,
    citations: parseCitations(parsed.frontmatter),
  }
}

function keywordScore(page: WikiPageSummary, query: string, content: string): number {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return 0
  const title = page.title.toLowerCase()
  const haystack = `${title}\n${content.toLowerCase()}`
  let score = 0
  if (title === normalized) score += 100
  if (title.includes(normalized)) score += 45
  if (haystack.includes(normalized)) score += 20
  for (const token of normalized.split(/[^a-z0-9._-]+/).filter(Boolean)) {
    if (title.includes(token)) score += 12
    if (haystack.includes(token)) score += 4
  }
  return score
}

function numberFromUnknown(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function recordRankBoost(metadata: Record<string, unknown>, page: WikiPageSummary): number {
  const freshness = metadata.freshness && typeof metadata.freshness === 'object'
    ? numberFromUnknown((metadata.freshness as Record<string, unknown>).score, page.freshnessScore)
    : page.freshnessScore
  const quality = metadata.quality && typeof metadata.quality === 'object'
    ? numberFromUnknown((metadata.quality as Record<string, unknown>).confidence, 0.5)
    : 0.5
  const accessCount = numberFromUnknown(metadata.access_count, 0)
  const durabilityBoost = metadata.durability === 'durable' ? 6 : 0
  const sourceTypeBoost = metadata.sourceType === 'manual' ? 2 : metadata.sourceType === 'url' ? 1 : 0
  const scopeBoost = metadata.scope === 'wiki' ? 8 : 0
  return scopeBoost + durabilityBoost + sourceTypeBoost + freshness * 10 + quality * 8 + Math.log1p(accessCount)
}

export async function searchWiki(
  query: string,
  options: { limit?: number } = {},
  context: WikiServiceContext = {},
): Promise<WikiSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const limit = Math.max(1, Math.min(50, options.limit ?? 12))
  const paths = resolveWikiPaths(context)
  const freshnessMeta = await readJsonFile<WikiFreshnessMeta>(paths.freshnessPath, {})
  const parsedPages = await readParsedPages(context)
  const summaries = summarizeParsedPages(parsedPages, trimmed, freshnessMeta)
  const contentByPath = new Map(parsedPages.map((page) => [page.filePath, page.body]))

  const results = new Map<string, WikiSearchResult>()
  for (const page of summaries) {
    const score = keywordScore(page, trimmed, contentByPath.get(page.path) ?? '')
    if (score <= 0) continue
    results.set(page.id, {
      ...page,
      score,
      matchType: 'keyword',
    })
  }

  const semanticHits = await searchManagedMemories(trimmed, { limit }, managedContext(context)).catch(() => [])
  for (const hit of semanticHits) {
    const metadata = hit.metadata ?? {}
    const pageId = typeof metadata.pageId === 'string' ? metadata.pageId : ''
    const page = pageId ? summaries.find((item) => item.id === pageId) : undefined
    if (!page) continue
    const semanticScore = Math.round((hit.score ?? 0) * 100 + recordRankBoost(metadata, page))
    const current = results.get(page.id)
    if (!current || semanticScore > current.score) {
      results.set(page.id, {
        ...page,
        score: semanticScore,
        matchType: 'semantic',
      })
    }
  }

  return [...results.values()]
    .sort((left, right) => right.score - left.score || right.freshnessScore - left.freshnessScore)
    .slice(0, limit)
}

export async function ingestWikiSource(
  input: WikiIngestInput,
  context: WikiServiceContext = {},
): Promise<WikiIngestPayload> {
  const sourceUrlFromContent = !input.sourceUrl?.trim() && !input.sourcePath?.trim() && looksLikeUrl(input.content)
    ? input.content!.trim()
    : undefined
  const ingestInput: WikiIngestInput = sourceUrlFromContent
    ? { ...input, sourceUrl: sourceUrlFromContent, content: undefined, sourceType: input.sourceType ?? 'url' }
    : input
  const isUrl = looksLikeUrl(ingestInput.sourceUrl)
  let title = inferTitle(ingestInput)
  let content = normalizeContent(ingestInput)
  const warnings: string[] = []
  if (isUrl && !ingestInput.confirmUrlIngest) {
    return {
      state: 'needs_confirmation',
      confirmationRequired: true,
      message: 'URL ingest requires explicit confirmation. Choose ingest, summarize once, or use for this conversation only.',
      pagesCreated: 0,
      pagesUpdated: 0,
      warnings: ['url_ingest_requires_confirmation'],
    }
  }

  if (ingestInput.sourceUrl?.trim() && ingestInput.confirmUrlIngest && (!ingestInput.content?.trim() || content === `Source URL: ${ingestInput.sourceUrl.trim()}`)) {
    try {
      const fetched = await fetchUrlContent(ingestInput.sourceUrl.trim())
      content = fetched.content
      if (!ingestInput.title?.trim() && fetched.title) title = fetched.title.slice(0, 120)
    } catch {
      warnings.push('url_fetch_failed')
      content = `Source URL: ${ingestInput.sourceUrl.trim()}`
    }
  }

  if (!content) {
    throw new Error('Wiki ingest requires content or a source URL')
  }

  const paths = await ensureWikiVault(context)
  const state = await readIngestState(paths)
  const pageType = inferPageType(ingestInput)
  const key = sourceKey(ingestInput, title)
  const previous = state.sources[key]
  const existingPage = previous?.pageId
    ? (await listWikiPages(context)).find((item) => item.id === previous.pageId)
    : undefined
  const defaultPageId = `${PAGE_DIRS[pageType]}-${slugify(title)}`
  const defaultPagePath = path.join(paths.pagesRoot, PAGE_DIRS[pageType], `${slugify(title)}.md`)
  const pageId = existingPage?.id ?? previous?.pageId ?? defaultPageId
  const pagePath = existingPage?.path ?? defaultPagePath
  const fingerprint = fingerprintSource({
    title,
    content,
    sourceUrl: ingestInput.sourceUrl,
    sourcePath: ingestInput.sourcePath,
  })
  if (previous?.fingerprint === fingerprint && await pathExists(pagePath)) {
    const page = (await listWikiPages(context)).find((item) => item.id === previous.pageId)
    return {
      state: 'skipped',
      confirmationRequired: false,
      message: 'Wiki source is already current.',
      page,
      memoryId: previous.memoryId,
      pagesCreated: 0,
      pagesUpdated: 0,
      warnings: [],
    }
  }

  const now = nowIso()
  const created = await addManagedMemory(
    {
      content,
      metadata: {
        sourceType: ingestInput.sourceType || (ingestInput.sourceUrl ? 'url' : ingestInput.sourcePath ? 'file' : 'manual'),
        scope: 'wiki',
        durability: 'durable',
        category: pageType === 'process' ? 'procedure' : 'reference',
        provenance: {
          sourceType: ingestInput.sourceType || (ingestInput.sourceUrl ? 'url' : ingestInput.sourcePath ? 'file' : 'manual'),
          sourcePath: ingestInput.sourcePath,
          sourceUrl: ingestInput.sourceUrl,
          sourceFingerprint: fingerprint,
          importedAt: now,
          createdBy: 'user',
        },
        quality: {
          confidence: 0.8,
          recallPriority: pageType === 'source' ? 0.7 : 0.8,
        },
        pageId,
        sectionId: 'body',
        freshness: {
          score: DEFAULT_FRESHNESS_SCORE,
          status: 'fresh',
          updatedAt: now,
        },
        lint: {
          status: 'unchecked',
        },
      },
    },
    managedContext(context),
  )

  if (previous?.memoryId && previous.memoryId !== created.memoryId) {
    await deleteManagedMemory(previous.memoryId, managedContext(context)).catch(() => undefined)
  }

  const existed = await pathExists(pagePath)
  await fs.writeFile(
    pagePath,
    renderWikiPage({
      id: pageId,
      title,
      type: pageType,
      sourceType: ingestInput.sourceType || (ingestInput.sourceUrl ? 'url' : ingestInput.sourcePath ? 'file' : 'manual'),
      sourcePath: ingestInput.sourcePath,
      sourceUrl: ingestInput.sourceUrl,
      content,
      memoryId: created.memoryId,
      fingerprint,
      createdAt: existingPage?.createdAt || previous?.updatedAt || now,
      updatedAt: now,
    }),
    'utf8',
  )
  state.sources[key] = {
    fingerprint,
    pageId,
    memoryId: created.memoryId,
    updatedAt: now,
  }
  await writeIngestState(paths, state)
  const pages = await listWikiPages(context)
  await writeIndex(paths, pages)
  await appendLog(paths, `${existed ? 'Updated' : 'Created'} [[${title}]] from ${ingestInput.sourceUrl || ingestInput.sourcePath || 'manual input'}.`)
  const evolve = await runAutoEvolveOnWrite(context, warnings)
  const refreshedPages = evolve ? await listWikiPages(context) : pages

  return {
    state: existed ? 'updated' : 'ingested',
    confirmationRequired: false,
    message: existed ? 'Wiki article updated.' : 'Wiki article created.',
    page: refreshedPages.find((page) => page.id === pageId),
    memoryId: created.memoryId,
    pagesCreated: existed ? 0 : 1,
    pagesUpdated: existed ? 1 : 0,
    warnings,
    evolve,
  }
}

function shouldUseWikiForQuestion(query: string): boolean {
  return classifyWikiQuestion(query).useWiki
}

export async function queryWiki(
  query: string,
  options: { limit?: number } = {},
  context: WikiServiceContext = {},
): Promise<WikiQueryPayload> {
  const trimmed = query.trim()
  if (!trimmed) throw new Error('Wiki query is required')
  const results = await searchWiki(trimmed, { limit: options.limit ?? 6 }, context)
  const usedWiki = shouldUseWikiForQuestion(trimmed) || results.length > 0
  if (!usedWiki || results.length === 0) {
    return {
      query: trimmed,
      usedWiki: false,
      answer: 'No relevant wiki article was found. Use normal conversation context, or ingest sources into the Wiki first.',
      results: [],
      citations: [],
      offerToSave: false,
    }
  }

  const citations: WikiCitation[] = []
  for (const result of results.slice(0, 3)) {
    const page = await getWikiPage(result.id, context)
    citations.push(...page.citations)
  }
  const top = results.slice(0, 3)
  const answer = [
    `Wiki found ${results.length} relevant article${results.length === 1 ? '' : 's'}.`,
    ...top.map((page, index) => `${index + 1}. [[${page.title}]] - ${page.snippet}`),
  ].join('\n')

  return {
    query: trimmed,
    usedWiki: true,
    answer,
    results,
    citations,
    offerToSave: true,
  }
}

export async function assistWithWiki(
  question: string,
  options: { limit?: number } = {},
  context: WikiServiceContext = {},
): Promise<WikiAssistPayload> {
  const query = question.trim()
  if (!query) throw new Error('Wiki assist question is required')
  const decision = classifyWikiQuestion(query)
  if (!decision.useWiki) {
    return {
      query,
      usedWiki: false,
      reason: decision.reason,
      answer: 'Wiki context was not used because the question does not appear to require prior knowledge, docs, research, decisions, or project context.',
      results: [],
      citations: [],
      offerToSave: false,
    }
  }

  return {
    ...(await queryWiki(query, options, context)),
    reason: decision.reason,
  }
}

export function planWikiLinkChoice(input: string): WikiLinkChoicePayload {
  const text = input.trim()
  const urls = extractHttpUrls(text)
  const actions: WikiLinkChoicePayload['actions'] = [
    {
      id: 'ingest',
      label: 'Ingest into Wiki',
      description: 'Fetch the URL, store provenance in managed PowerMem, and compile or update wiki markdown pages.',
    },
    {
      id: 'summarize_once',
      label: 'Summarize once',
      description: 'Use the URL for a one-time answer without writing it into durable Wiki knowledge.',
    },
    {
      id: 'current_conversation_only',
      label: 'Use only now',
      description: 'Use the link only as transient context for the current conversation.',
    },
  ]

  return {
    input: text,
    urls,
    requiresChoice: urls.length > 0,
    defaultAction: 'current_conversation_only',
    actions,
    message: urls.length > 0
      ? 'A pasted link needs an explicit choice before Wiki ingestion.'
      : 'No HTTP URL was detected.',
  }
}

function importantTokens(query: string): string[] {
  const stopWords = new Set([
    'about',
    'after',
    'again',
    'against',
    'all',
    'and',
    'are',
    'can',
    'for',
    'from',
    'how',
    'into',
    'know',
    'the',
    'this',
    'what',
    'when',
    'where',
    'wiki',
    'with',
  ])
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token))
}

function titleCaseTopic(value: string): string {
  const cleaned = value
    .replace(/\bwhat\s+do\s+we\s+know\s+about\b/gi, '')
    .replace(/\bwiki\b/gi, '')
    .replace(/[?!.,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const topic = cleaned || value.trim() || 'Wiki Synthesis'
  return topic.split(/\s+/).map((word) => {
    const upper = word.toUpperCase()
    if (['AI', 'API', 'LLM', 'MCP', 'RAG'].includes(upper)) return upper
    return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`
  }).join(' ')
}

function splitSentences(content: string): string[] {
  return content
    .replace(/^# .+$/gm, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 50 && sentence.length <= 360)
}

function scoreSentence(sentence: string, tokens: string[]): number {
  const lower = sentence.toLowerCase()
  return tokens.reduce((score, token) => score + (lower.includes(token) ? 1 : 0), 0)
}

function selectSynthesisBullets(sourcePages: WikiPageDetail[], query: string): string[] {
  const tokens = importantTokens(query)
  const candidates = sourcePages.flatMap((page) => (
    splitSentences(page.content).map((sentence) => ({
      sentence,
      page,
      score: scoreSentence(sentence, tokens),
    }))
  ))
  const seen = new Set<string>()
  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length)
    .filter((candidate) => {
      const key = candidate.sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 120)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
    .map((candidate) => `- ${candidate.sentence} ([[${candidate.page.title}]])`)
}

function renderSynthesisBody(input: {
  title: string
  query: string
  sourcePages: WikiPageDetail[]
}): string {
  const bullets = selectSynthesisBullets(input.sourcePages, input.query)
  const sourceNotes = input.sourcePages.map((page) => `- [[${page.title}]]: ${page.snippet}`)
  return [
    '## Generated Synthesis',
    '',
    `This page synthesizes Wiki sources for: **${input.query}**.`,
    '',
    '## Key Points',
    '',
    ...(bullets.length > 0 ? bullets : ['- The available sources were relevant but did not expose enough extractable focused claims for a stronger synthesis.']),
    '',
    '## Source Notes',
    '',
    ...sourceNotes,
  ].join('\n')
}

export async function synthesizeWiki(
  input: WikiSynthesizeInput,
  context: WikiServiceContext = {},
): Promise<WikiSynthesizePayload> {
  const query = input.query.trim()
  if (!query) throw new Error('Wiki synthesis query is required')
  const limit = Math.max(1, Math.min(8, input.limit ?? 5))
  const results = await searchWiki(query, { limit }, context)
  const title = titleCaseTopic(input.title?.trim() || query)
  const pageId = `synthesis-${slugify(title)}`
  const sourceResults = results.filter((result) => result.id !== pageId)
  if (sourceResults.length === 0) throw new Error('Wiki synthesis requires at least one matching source')

  const sourcePages = await Promise.all(sourceResults.slice(0, limit).map((result) => getWikiPage(result.id, context)))
  const paths = await ensureWikiVault(context)
  const pagePath = path.join(paths.pagesRoot, PAGE_DIRS.synthesis, `${slugify(title)}.md`)
  const previous = await pathExists(pagePath) ? await getWikiPage(pageId, context).catch(() => null) : null
  const content = renderSynthesisBody({ title, query, sourcePages })
  const fingerprint = fingerprintSource({
    title,
    content,
    sourcePath: sourcePages.map((page) => page.id).join('|'),
  })
  const now = nowIso()
  const created = await addManagedMemory(
    {
      content,
      metadata: {
        sourceType: 'synthesis',
        scope: 'wiki',
        durability: 'durable',
        category: 'synthesis',
        provenance: {
          sourceType: 'synthesis',
          sourcePageIds: sourcePages.map((page) => page.id),
          sourceFingerprint: fingerprint,
          importedAt: now,
          createdBy: 'wiki-synthesis',
        },
        quality: {
          confidence: 0.72,
          recallPriority: 0.85,
        },
        pageId,
        sectionId: 'body',
        freshness: {
          score: DEFAULT_FRESHNESS_SCORE,
          status: 'fresh',
          updatedAt: now,
        },
        lint: {
          status: 'unchecked',
        },
      },
    },
    managedContext(context),
  )
  if (previous?.memoryIds[0] && previous.memoryIds[0] !== created.memoryId) {
    await deleteManagedMemory(previous.memoryIds[0], managedContext(context)).catch(() => undefined)
  }

  const existed = await pathExists(pagePath)
  await fs.writeFile(
    pagePath,
    renderGeneratedWikiPage({
      id: pageId,
      title,
      type: 'synthesis',
      content,
      memoryId: created.memoryId,
      fingerprint,
      sourcePages,
      createdAt: previous?.frontmatter.createdAt || now,
      updatedAt: now,
    }),
    'utf8',
  )
  const pages = await listWikiPages(context)
  await writeIndex(paths, pages)
  await appendLog(paths, `${existed ? 'Updated' : 'Created'} generated synthesis [[${title}]] from ${sourcePages.length} source page(s).`)
  const citations = sourcePages.flatMap((sourcePage) => sourcePage.citations)
  const warnings: string[] = citations.length === 0 ? ['synthesis_has_no_source_citations'] : []
  const evolve = await runAutoEvolveOnWrite(context, warnings)
  const refreshedPages = evolve ? await listWikiPages(context) : pages
  const page = refreshedPages.find((item) => item.id === pageId)
  if (!page) throw new Error(`Generated wiki page was not indexed: ${pageId}`)
  return {
    title,
    query,
    page,
    memoryId: created.memoryId,
    pagesCreated: existed ? 0 : 1,
    pagesUpdated: existed ? 1 : 0,
    sourcePageIds: sourcePages.map((sourcePage) => sourcePage.id),
    citations,
    warnings,
    evolve,
  }
}

export async function lintWiki(context: WikiServiceContext = {}): Promise<WikiLintPayload> {
  const paths = await ensureWikiVault(context)
  const parsed = await readParsedPages(context)
  const pages = summarizeParsedPages(parsed)
  const issues = computeWikiLintIssues(parsed, pages)

  await writeJsonFile(paths.conflictsPath, issues.filter(isWikiConflictIssue))
  return {
    checkedAt: nowIso(),
    issueCount: issues.length,
    issues,
  }
}

function isWikiConflictIssue(issue: WikiLintIssue): boolean {
  return issue.kind === 'duplicate-title' || issue.kind === 'missing-link' || issue.kind === 'stale'
}

function computeWikiLintIssues(parsed: ParsedPage[], pages: WikiPageSummary[]): WikiLintIssue[] {
  const issues: WikiLintIssue[] = []
  const titleCounts = new Map<string, WikiPageSummary[]>()
  for (const page of pages) {
    const key = page.title.toLowerCase()
    if (!titleCounts.has(key)) titleCounts.set(key, [])
    titleCounts.get(key)!.push(page)

    if (page.links.length === 0 && page.backlinks.length === 0) {
      issues.push({
        id: `orphan:${page.id}`,
        severity: 'warning',
        kind: 'orphan',
        pageId: page.id,
        title: 'Orphan page',
        detail: `${page.title} has no wiki links or backlinks.`,
      })
    }
    if (page.freshnessStatus === 'stale') {
      issues.push({
        id: `stale:${page.id}`,
        severity: 'warning',
        kind: 'stale',
        pageId: page.id,
        title: 'Stale page',
        detail: `${page.title} has a stale freshness score.`,
      })
    }
  }

  const titles = new Set(pages.map((page) => page.title).concat(pages.map((page) => page.id)))
  for (const page of pages) {
    for (const link of page.links) {
      if (titles.has(link)) continue
      issues.push({
        id: `missing:${page.id}:${slugify(link)}`,
        severity: 'warning',
        kind: 'missing-link',
        pageId: page.id,
        title: 'Missing linked page',
        detail: `${page.title} links to missing page ${link}.`,
      })
    }
  }

  for (const [title, matches] of titleCounts.entries()) {
    if (matches.length < 2) continue
    issues.push({
      id: `duplicate:${slugify(title)}`,
      severity: 'error',
      kind: 'duplicate-title',
      title: 'Duplicate title',
      detail: `${matches.length} wiki pages share the title ${matches[0]!.title}.`,
    })
  }

  for (const parsedPage of parsed) {
    const title = parsedPage.frontmatter.title
    const id = parsedPage.frontmatter.id
    if (!title || !id) {
      issues.push({
        id: `schema:${parsedPage.relativePath}`,
        severity: 'error',
        kind: 'schema',
        title: 'Schema violation',
      detail: `${parsedPage.relativePath} is missing required id or title frontmatter.`,
      })
    }
  }

  return issues
}

export async function evolveWiki(context: WikiServiceContext = {}): Promise<WikiEvolvePayload> {
  const paths = await ensureWikiVault(context)
  const parsed = await readParsedPages(context)
  const evolvedAt = nowIso()
  const freshness: WikiEvolvePayload['freshness'] = {}
  const changedPageIds: string[] = []
  const related: Record<string, string[]> = {}

  for (const page of parsed) {
    const updatedAt = page.frontmatter.updatedAt || evolvedAt
    const lastAccessedAt = page.frontmatter.lastAccessedAt || updatedAt
    const updatedMs = Date.parse(updatedAt)
    const evolvedMs = Date.parse(evolvedAt)
    const ageDays = Number.isFinite(updatedMs)
      ? Math.max(0, ((Number.isFinite(evolvedMs) ? evolvedMs : Date.now()) - updatedMs) / 86_400_000)
      : 0
    const importance = parseNumber(page.frontmatter.importance, 0.7)
    const decayRate = 0.16 * (1 - importance * 0.8)
    const score = Math.max(0, Math.min(1, importance * Math.exp(-decayRate * ageDays)))
    const roundedScore = Number(score.toFixed(4))
    const status = ageDays < 1 ? 'fresh' : freshnessStatus(roundedScore)
    const id = page.frontmatter.id || slugify(page.frontmatter.title || page.relativePath)
    freshness[id] = {
      score: roundedScore,
      status,
      lastAccessedAt,
      updatedAt,
      checkedAt: evolvedAt,
    }
    related[id] = []
  }

  const summaries = summarizeParsedPages(parsed)
  const summaryById = new Map(summaries.map((page) => [page.id, page]))
  for (const page of summaries) {
    const linked = new Set<string>()
    for (const link of page.links.concat(page.backlinks)) {
      const target = summaryById.get(link) ?? summaries.find((candidate) => candidate.title === link)
      if (target && target.id !== page.id) linked.add(target.id)
    }
    related[page.id] = [...linked].sort()
  }

  const currentIssues = computeWikiLintIssues(parsed, summaries)
  const conflicts = currentIssues.filter(isWikiConflictIssue)
  const issuesByPage = new Map<string, typeof conflicts>()
  for (const issue of conflicts) {
    if (!issue.pageId) continue
    issuesByPage.set(issue.pageId, [...(issuesByPage.get(issue.pageId) ?? []), issue])
  }

  for (const page of parsed) {
    const id = page.frontmatter.id || slugify(page.frontmatter.title || page.relativePath)
    const item = freshness[id]
    if (!item) continue
    const previousScore = parseNumber(page.frontmatter.freshnessScore, DEFAULT_FRESHNESS_SCORE)
    const previousStatus = page.frontmatter.freshnessStatus
    const previousRelated = page.frontmatter.relatedPageIds || ''
    const nextRelated = (related[id] ?? []).join('|')
    const pageIssues = issuesByPage.get(id) ?? []
    const previousIssueCount = parseNumber(page.frontmatter.evolveIssueCount, 0)
    const changes: string[] = []

    if (previousStatus && previousStatus !== item.status) {
      changes.push(`Freshness changed from ${previousStatus} to ${item.status}.`)
    } else if (!previousStatus) {
      changes.push(`Freshness initialized as ${item.status}.`)
    }
    if (Math.abs(previousScore - item.score) >= 0.01) {
      changes.push(`Freshness score changed from ${Number(previousScore.toFixed(4))} to ${item.score}.`)
    }
    if (previousRelated !== nextRelated) {
      changes.push(nextRelated ? `Related pages updated: ${nextRelated}.` : 'Related pages cleared.')
    }
    if (previousIssueCount !== pageIssues.length) {
      changes.push(pageIssues.length > 0 ? `Health issues detected: ${pageIssues.map((issue) => issue.kind).join(', ')}.` : 'Health issues cleared.')
    }
    if (!page.frontmatter.evolveSource) {
      changes.push('Evolution evidence initialized.')
    }

    const changedByEvolve = changes.length > 0
    const nextFrontmatter = {
      ...page.frontmatter,
      freshnessScore: item.score,
      freshnessStatus: item.status,
      lastAccessedAt: item.lastAccessedAt,
      relatedPageIds: nextRelated,
      evolveIssueCount: pageIssues.length,
      evolveSource: 'freshness-score, wiki-links, backlinks, lint-health',
      ...(changedByEvolve
        ? {
            evolveChangedAt: evolvedAt,
            evolveChangeSummary: changes.join(' '),
          }
        : {}),
    }
    if (
      changedByEvolve ||
      Math.abs(previousScore - item.score) >= 0.01 ||
      page.frontmatter.freshnessStatus !== item.status ||
      page.frontmatter.relatedPageIds !== nextRelated ||
      previousIssueCount !== pageIssues.length
    ) {
      await fs.writeFile(page.filePath, renderMarkdownWithFrontmatter(nextFrontmatter, page.body), 'utf8')
      if (changedByEvolve) changedPageIds.push(id)
    }
  }

  const evolvedParsed = await readParsedPages(context)
  const evolvedPages = summarizeParsedPages(evolvedParsed, '', freshness)
  const evolvedIssues = computeWikiLintIssues(evolvedParsed, evolvedPages)
  const evolvedConflicts = evolvedIssues.filter(isWikiConflictIssue)
  await writeJsonFile(paths.freshnessPath, freshness)
  await writeJsonFile(paths.conflictsPath, evolvedConflicts)
  await writeJsonFile(path.join(paths.metaRoot, 'related.json'), related)
  await writeIndex(paths, evolvedPages)
  await appendLog(paths, `Evolved ${Object.keys(freshness).length} wiki page(s); ${changedPageIds.length} markdown page(s) updated.`)

  return {
    evolvedAt,
    pageCount: Object.keys(freshness).length,
    staleCount: Object.values(freshness).filter((item) => item.status === 'stale').length,
    conflictCount: evolvedConflicts.length,
    changedPageIds,
    related,
    warnings: evolvedConflicts.length > 0 ? ['wiki_conflicts_detected'] : [],
    freshness,
  }
}

export async function recentWikiManagedMemories(
  limit = 20,
  context: WikiServiceContext = {},
) {
  const listed = await listManagedMemories({ limit }, managedContext(context))
  return listed.memories.filter((memory) => typeof memory.metadata.pageId === 'string')
}
