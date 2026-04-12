import fs from 'node:fs/promises'
import path from 'node:path'
import { execOpenclaw, extractFirstJsonObject } from '../execOpenclaw.js'
import { getOpenclawDataDir } from '../paths.js'
import { isRecord } from '../serverUtils.js'

function parseJsonLenient(raw: string): unknown {
  const t = raw.trim()
  if (!t) return null
  const candidate = t.startsWith('{') || t.startsWith('[') ? t : extractFirstJsonObject(t) ?? t
  try {
    return JSON.parse(candidate)
  } catch {
    return { raw: t }
  }
}

export interface OpenclawMemoryHit {
  id: string
  content: string
  score?: number
  path?: string
  metadata?: Record<string, unknown>
}

export interface OpenclawMemorySearchCapabilityPayload {
  mode: 'native' | 'fallback'
  reason?: 'fts5_unavailable'
  detail?: string
}

export interface OpenclawMemoryReindexPayload {
  exitCode: number
  stdout: string
  stderr?: string
}

export interface OpenclawMemoryFileEntry {
  name: string
  relativePath: string
  absolutePath: string
  size: number
  modifiedAtMs: number
  extension: string
  kind: 'sqlite' | 'journal' | 'json' | 'text' | 'other'
}

export interface OpenclawMemoryFilesPayload {
  root: string
  files: OpenclawMemoryFileEntry[]
}

interface OpenclawMemoryStatusEntry {
  agentId: string
  workspaceDir?: string
}

function normalizeHit(item: unknown, index: number): OpenclawMemoryHit | null {
  if (!isRecord(item)) return null
  const content = String(
    item.content ?? item.text ?? item.snippet ?? item.body ?? item.memory ?? item.preview ?? ''
  ).trim()
  if (!content && !item.path && !item.file && !item.id) return null
  const id = String(item.id ?? item.path ?? item.file ?? item.uri ?? `hit-${index}`)
  const scoreRaw = item.score ?? item.similarity ?? item.rank
  const score =
    typeof scoreRaw === 'number'
      ? scoreRaw
      : typeof scoreRaw === 'string' && scoreRaw.trim() !== ''
        ? Number(scoreRaw)
        : undefined
  const path = typeof item.path === 'string' ? item.path : typeof item.file === 'string' ? item.file : undefined
  return {
    id,
    content: content || path || id,
    score: Number.isFinite(score) ? score : undefined,
    path,
    metadata: isRecord(item.metadata) ? item.metadata : undefined,
  }
}

export function parseOpenclawMemorySearchJson(stdout: string): OpenclawMemoryHit[] {
  const data = parseJsonLenient(stdout)
  if (data === null) return []
  if (Array.isArray(data)) {
    return data.map(normalizeHit).filter((x): x is OpenclawMemoryHit => x !== null)
  }
  if (isRecord(data)) {
    const arr = data.hits ?? data.results ?? data.items ?? data.memories ?? data.matches
    if (Array.isArray(arr)) {
      return arr.map(normalizeHit).filter((x): x is OpenclawMemoryHit => x !== null)
    }
  }
  return []
}

function parseOpenclawMemoryStatusEntries(data: unknown): OpenclawMemoryStatusEntry[] {
  if (!Array.isArray(data)) return []
  const entries: OpenclawMemoryStatusEntry[] = []
  for (const item of data) {
    if (!isRecord(item)) continue
    const status = isRecord(item.status) ? item.status : null
    const agentId = typeof item.agentId === 'string' && item.agentId.trim() ? item.agentId.trim() : 'main'
    const workspaceDir =
      typeof status?.workspaceDir === 'string' && status.workspaceDir.trim()
        ? status.workspaceDir.trim()
        : undefined
    entries.push({ agentId, workspaceDir })
  }
  return entries
}

function hasStructuredOpenclawMemorySearchPayload(value: unknown): boolean {
  if (Array.isArray(value)) return true
  if (!isRecord(value)) return false
  return Array.isArray(value.hits ?? value.results ?? value.items ?? value.memories ?? value.matches)
}

function hasFtsUnavailableError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('fts5') && lower.includes('no such module')
}

function resolveMemorySearchProbeDetail(result: {
  code: number
  stdout: string
  stderr: string
}): string | undefined {
  const detail = result.stderr.trim() || result.stdout.trim()
  return detail || undefined
}

async function collectMarkdownFiles(dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectMarkdownFiles(fullPath, out)
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(fullPath)
    }
  }
}

function extractSnippet(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const lower = normalized.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx < 0) return normalized.slice(0, 240)
  const start = Math.max(0, idx - 80)
  const end = Math.min(normalized.length, idx + Math.max(query.length, 40) + 120)
  return normalized.slice(start, end)
}

function countOccurrences(text: string, query: string): number {
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  if (!needle) return 0
  let index = 0
  let count = 0
  while (true) {
    const next = haystack.indexOf(needle, index)
    if (next < 0) break
    count += 1
    index = next + needle.length
  }
  return count
}

async function resolveWorkspaceDirs(agent?: string): Promise<string[]> {
  const status = await getOpenclawMemoryStatusPayload()
  const entries = parseOpenclawMemoryStatusEntries(status.data)
  const dirs = entries
    .filter((entry) => !agent || entry.agentId === agent)
    .map((entry) => entry.workspaceDir)
    .filter((value): value is string => Boolean(value))
  if (dirs.length > 0) {
    return Array.from(new Set(dirs))
  }
  return [path.join(getOpenclawDataDir(), 'workspace')]
}

export async function searchWorkspaceMemoryFiles(
  query: string,
  workspaceDirs: string[],
  maxResults = 20
): Promise<OpenclawMemoryHit[]> {
  const max = Math.min(100, Math.max(1, maxResults))
  const markdownFiles: string[] = []
  for (const workspaceDir of workspaceDirs) {
    const rootMemoryFile = path.join(workspaceDir, 'MEMORY.md')
    try {
      const stat = await fs.stat(rootMemoryFile)
      if (stat.isFile()) markdownFiles.push(rootMemoryFile)
    } catch {
      /* ignore */
    }
    await collectMarkdownFiles(path.join(workspaceDir, 'memory'), markdownFiles)
  }

  const hits: Array<OpenclawMemoryHit & { rank: number }> = []
  for (const filePath of markdownFiles) {
    let content = ''
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch {
      continue
    }
    const bodyMatches = countOccurrences(content, query)
    const pathMatches = countOccurrences(filePath, query)
    const totalMatches = bodyMatches + pathMatches
    if (totalMatches < 1) continue
    hits.push({
      id: filePath,
      content: extractSnippet(content, query) || filePath,
      path: filePath,
      score: totalMatches,
      metadata: { fallback: true, matchCount: totalMatches },
      rank: totalMatches,
    })
  }

  hits.sort((a, b) => b.rank - a.rank || a.path!.localeCompare(b.path!, 'en'))
  return hits.slice(0, max).map(({ rank: _rank, ...hit }) => hit)
}

export async function searchOpenclawMemoryFallback(
  query: string,
  options?: { agent?: string; maxResults?: number }
): Promise<OpenclawMemoryHit[]> {
  const workspaceDirs = await resolveWorkspaceDirs(options?.agent?.trim() || undefined)
  return searchWorkspaceMemoryFiles(query, workspaceDirs, options?.maxResults ?? 20)
}

export function resolveOpenclawMemorySearchOutput(result: {
  code: number
  stdout: string
  stderr: string
}): OpenclawMemoryHit[] {
  const parsed = parseJsonLenient(result.stdout)
  if (result.code === 0 || hasStructuredOpenclawMemorySearchPayload(parsed)) {
    return parseOpenclawMemorySearchJson(result.stdout)
  }
  throw new Error(result.stderr || result.stdout || 'OpenClaw memory search failed')
}

export function resolveOpenclawMemorySearchCapability(result: {
  code: number
  stdout: string
  stderr: string
}): OpenclawMemorySearchCapabilityPayload {
  const parsed = parseJsonLenient(result.stdout)
  if (result.code === 0 || hasStructuredOpenclawMemorySearchPayload(parsed)) {
    return { mode: 'native' }
  }
  const detail = resolveMemorySearchProbeDetail(result)
  if (detail && hasFtsUnavailableError(detail)) {
    return {
      mode: 'fallback',
      reason: 'fts5_unavailable',
      detail,
    }
  }
  return {
    mode: 'native',
    detail,
  }
}

export async function getOpenclawMemoryStatusPayload(): Promise<{
  exitCode: number
  data: unknown
  stderr?: string
}> {
  const r = await execOpenclaw(['memory', 'status', '--json'])
  const data = parseJsonLenient(r.stdout)
  return {
    exitCode: r.code,
    data,
    stderr: r.stderr || undefined,
  }
}

export async function searchOpenclawMemoryJson(
  query: string,
  options?: { agent?: string; maxResults?: number }
): Promise<OpenclawMemoryHit[]> {
  const max = Math.min(100, Math.max(1, options?.maxResults ?? 20))
  const args = ['memory', 'search', '--json', '--max-results', String(max)]
  if (options?.agent?.trim()) {
    args.push('--agent', options.agent.trim())
  }
  args.push('--query', query)
  const result = await execOpenclaw(args)
  try {
    return resolveOpenclawMemorySearchOutput(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (hasFtsUnavailableError(detail)) {
      return searchOpenclawMemoryFallback(query, options)
    }
    throw error
  }
}

export async function getOpenclawMemorySearchCapability(): Promise<OpenclawMemorySearchCapabilityPayload> {
  const result = await execOpenclaw([
    'memory',
    'search',
    '--json',
    '--max-results',
    '1',
    '--query',
    '__clawmaster_probe__',
  ])
  return resolveOpenclawMemorySearchCapability(result)
}

export async function reindexOpenclawMemory(): Promise<OpenclawMemoryReindexPayload> {
  const result = await execOpenclaw(['memory', 'index', '--force', '--verbose'])
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || 'OpenClaw memory reindex failed')
  }
  return {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr || undefined,
  }
}

function getOpenclawMemoryRoot(): string {
  return path.join(getOpenclawDataDir(), 'memory')
}

function classifyMemoryFile(fileName: string): OpenclawMemoryFileEntry['kind'] {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.sqlite') || lower.endsWith('.db')) return 'sqlite'
  if (lower.endsWith('.wal') || lower.endsWith('.shm') || lower.endsWith('.journal')) return 'journal'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.md')) return 'text'
  return 'other'
}

async function collectOpenclawMemoryFiles(
  root: string,
  dir: string,
  out: OpenclawMemoryFileEntry[],
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectOpenclawMemoryFiles(root, fullPath, out)
      continue
    }
    if (!entry.isFile()) continue
    const stat = await fs.stat(fullPath)
    const relativePath = path.relative(root, fullPath) || entry.name
    const extension = path.extname(entry.name).replace(/^\./, '')
    out.push({
      name: entry.name,
      relativePath,
      absolutePath: fullPath,
      size: stat.size,
      modifiedAtMs: stat.mtimeMs,
      extension,
      kind: classifyMemoryFile(entry.name),
    })
  }
}

export async function listOpenclawMemoryFiles(): Promise<OpenclawMemoryFilesPayload> {
  const root = getOpenclawMemoryRoot()
  try {
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) {
      return { root, files: [] }
    }
  } catch {
    return { root, files: [] }
  }

  const files: OpenclawMemoryFileEntry[] = []
  await collectOpenclawMemoryFiles(root, root, files)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'))
  return { root, files }
}

function resolveMemoryRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim()
  if (!trimmed) {
    throw new Error('Memory file path is required')
  }
  const normalized = path.normalize(trimmed)
  if (
    normalized.startsWith('..') ||
    path.isAbsolute(normalized) ||
    normalized.includes(`..${path.sep}`)
  ) {
    throw new Error('Invalid memory file path')
  }
  return path.join(getOpenclawMemoryRoot(), normalized)
}

export async function deleteOpenclawMemoryFile(relativePath: string): Promise<void> {
  const target = resolveMemoryRelativePath(relativePath)
  await fs.unlink(target)
}
