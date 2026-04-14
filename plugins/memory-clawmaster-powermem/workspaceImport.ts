import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  addManagedMemory,
  deleteManagedMemory,
  getManagedMemoryStatusPayload,
  type ManagedMemoryContext,
} from './runtime.js'

export interface ManagedMemoryImportRunSummary {
  scanned: number
  imported: number
  updated: number
  skipped: number
  duplicate: number
  failed: number
  importedMemoryCount: number
  lastImportedAt: string
}

export interface ManagedMemoryImportStatusPayload {
  runtimeRoot: string
  stateFile: string
  availableSourceCount: number
  trackedSources: number
  importedMemoryCount: number
  lastImportedAt: string | null
  lastRun: ManagedMemoryImportRunSummary | null
}

interface ManagedMemoryImportSourceState {
  key: string
  agentId: string
  sourcePath: string
  title: string
  fingerprint: string
  contentFingerprint: string
  memoryId: string | null
  updatedAt: string
  duplicateOf?: string | null
}

interface ManagedMemoryImportState {
  version: 1
  lastImportedAt: string | null
  lastRun: ManagedMemoryImportRunSummary | null
  sources: Record<string, ManagedMemoryImportSourceState>
}

interface WorkspaceMemoryDocument {
  id: string
  agentId: string
  sourcePath: string
  title: string
  content: string
}

interface WorkspaceStatusEntry {
  agentId: string
  workspaceDir: string
}

const IMPORT_STATE_FILE = 'openclaw-import-state.json'
const DEFAULT_AGENT_ID = 'main'
const execFileAsync = promisify(execFile)

function nowIso(): string {
  return new Date().toISOString()
}

function defaultImportState(): ManagedMemoryImportState {
  return {
    version: 1,
    lastImportedAt: null,
    lastRun: null,
    sources: {},
  }
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value)
}

function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function fromForwardSlashes(value: string, windowsStyle: boolean): string {
  return windowsStyle ? value.replace(/\//g, '\\') : value
}

function resolvePreferredPosixHomeForMountedManagedDataRoot(normalizedDataRoot: string): string | null {
  const homeDir = process.env['HOME']?.trim()
  if (!homeDir || !homeDir.startsWith('/home/')) {
    return null
  }
  if (!/^\/mnt\/[a-z]\/users\/[^/]+\/\.clawmaster\/data\//i.test(normalizedDataRoot)) {
    return null
  }
  return homeDir
}

function resolveOpenclawStateDirFromManagedDataRoot(dataRoot: string): string | null {
  const normalized = toForwardSlashes(dataRoot.trim())
  if (!normalized) return null

  const windowsStyle = isWindowsDrivePath(normalized)
  const preferredPosixHome = !windowsStyle
    ? resolvePreferredPosixHomeForMountedManagedDataRoot(normalized)
    : null
  const namedMatch = /^(.*)\/\.clawmaster\/data\/named\/([^/]+)$/.exec(normalized)
  if (namedMatch) {
    const homeDir = preferredPosixHome ?? fromForwardSlashes(namedMatch[1]!, windowsStyle)
    const profileName = namedMatch[2]!
    return windowsStyle
      ? path.win32.join(homeDir, `.openclaw-${profileName}`)
      : path.posix.join(homeDir, `.openclaw-${profileName}`)
  }

  const devMatch = /^(.*)\/\.clawmaster\/data\/dev$/.exec(normalized)
  if (devMatch) {
    const homeDir = preferredPosixHome ?? fromForwardSlashes(devMatch[1]!, windowsStyle)
    return windowsStyle
      ? path.win32.join(homeDir, '.openclaw-dev')
      : path.posix.join(homeDir, '.openclaw-dev')
  }

  const defaultMatch = /^(.*)\/\.clawmaster\/data\/default$/.exec(normalized)
  if (defaultMatch) {
    const homeDir = preferredPosixHome ?? fromForwardSlashes(defaultMatch[1]!, windowsStyle)
    return windowsStyle
      ? path.win32.join(homeDir, '.openclaw')
      : path.posix.join(homeDir, '.openclaw')
  }

  return null
}

export function resolveOpenclawWorkspaceDir(context: ManagedMemoryContext = {}): string {
  const stateDir = process.env['OPENCLAW_STATE_DIR']?.trim()
  if (stateDir) {
    return path.join(stateDir, 'workspace')
  }
  const derivedStateDir =
    context.dataRootOverride ? resolveOpenclawStateDirFromManagedDataRoot(context.dataRootOverride) : null
  if (derivedStateDir) {
    return path.join(derivedStateDir, 'workspace')
  }
  return path.join(process.env['HOME'] || process.cwd(), '.openclaw', 'workspace')
}

function findBalancedJsonEnd(raw: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const ch = raw[index]!
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      depth += 1
      continue
    }
    if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
  }
  return -1
}

function parseJsonLenient(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    // fall through
  }

  const starts: number[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]
    if (ch === '{' || ch === '[') starts.push(index)
  }
  for (const start of starts) {
    const end = findBalancedJsonEnd(raw, start)
    if (end < 0) continue
    try {
      return JSON.parse(raw.slice(start, end)) as unknown
    } catch {
      // continue
    }
  }
  return null
}

function parseOpenclawMemoryStatusEntries(data: unknown): WorkspaceStatusEntry[] {
  if (!Array.isArray(data)) return []
  const entries: WorkspaceStatusEntry[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const status =
      record.status && typeof record.status === 'object' && !Array.isArray(record.status)
        ? (record.status as Record<string, unknown>)
        : null
    const agentId =
      typeof record.agentId === 'string' && record.agentId.trim() ? record.agentId.trim() : DEFAULT_AGENT_ID
    const workspaceDir =
      typeof status?.workspaceDir === 'string' && status.workspaceDir.trim()
        ? status.workspaceDir.trim()
        : ''
    if (!workspaceDir) continue
    entries.push({ agentId, workspaceDir })
  }
  return entries
}

function dedupeWorkspaceStatusEntries(entries: WorkspaceStatusEntry[]): WorkspaceStatusEntry[] {
  const deduped = new Map<string, WorkspaceStatusEntry>()
  for (const entry of entries) {
    deduped.set(`${entry.agentId}:${entry.workspaceDir}`, entry)
  }
  return Array.from(deduped.values())
}

async function loadWorkspaceStatusEntriesFromOpenclaw(): Promise<WorkspaceStatusEntry[]> {
  const envJson = process.env['OPENCLAW_MEMORY_STATUS_JSON']?.trim()
  if (envJson) {
    return dedupeWorkspaceStatusEntries(parseOpenclawMemoryStatusEntries(parseJsonLenient(envJson)))
  }

  const cliEntry = process.argv[1]?.trim()
  if (!cliEntry) return []

  let cliPath = cliEntry
  if (!path.isAbsolute(cliPath)) {
    cliPath = path.resolve(process.cwd(), cliPath)
  }

  try {
    const stat = await fs.stat(cliPath)
    if (!stat.isFile()) return []
  } catch {
    return []
  }

  try {
    const result = await execFileAsync(process.execPath, [cliPath, 'memory', 'status', '--json'], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    })
    const combined = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`
    return dedupeWorkspaceStatusEntries(parseOpenclawMemoryStatusEntries(parseJsonLenient(combined)))
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer }
    const combined = `${String(failure.stdout ?? '')}\n${String(failure.stderr ?? '')}`
    return dedupeWorkspaceStatusEntries(parseOpenclawMemoryStatusEntries(parseJsonLenient(combined)))
  }
}

function titleFromWorkspaceMemoryFile(sourcePath: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading
  return path.basename(sourcePath, path.extname(sourcePath))
}

async function collectMarkdownFiles(dir: string, out: string[]): Promise<void> {
  let entries: fs.Dirent[]
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

async function listWorkspaceMemoryDocuments(
  context: ManagedMemoryContext = {},
): Promise<WorkspaceMemoryDocument[]> {
  const documents: WorkspaceMemoryDocument[] = []
  const workspaceEntries = await loadWorkspaceStatusEntriesFromOpenclaw()
  const effectiveEntries = workspaceEntries.length > 0
    ? workspaceEntries
    : [{ agentId: DEFAULT_AGENT_ID, workspaceDir: resolveOpenclawWorkspaceDir(context) }]

  for (const entry of effectiveEntries) {
    const markdownFiles: string[] = []
    const rootMemoryFile = path.join(entry.workspaceDir, 'MEMORY.md')

    try {
      const stat = await fs.stat(rootMemoryFile)
      if (stat.isFile()) {
        markdownFiles.push(rootMemoryFile)
      }
    } catch {
      // ignore missing root memory file
    }

    await collectMarkdownFiles(path.join(entry.workspaceDir, 'memory'), markdownFiles)

    const dedupedPaths = Array.from(new Set(markdownFiles)).sort((left, right) => left.localeCompare(right, 'en'))
    for (const sourcePath of dedupedPaths) {
      let raw = ''
      try {
        raw = await fs.readFile(sourcePath, 'utf8')
      } catch {
        continue
      }
      const content = raw.trim()
      if (!content) continue
      documents.push({
        id: `${entry.agentId}:${sourcePath}`,
        agentId: entry.agentId,
        sourcePath,
        title: titleFromWorkspaceMemoryFile(sourcePath, content),
        content,
      })
    }
  }

  return documents
}

function fingerprintImportDocument(input: WorkspaceMemoryDocument): string {
  return createHash('sha256')
    .update(input.agentId)
    .update('\n')
    .update(input.sourcePath)
    .update('\n')
    .update(input.content)
    .digest('hex')
}

function contentFingerprintImportDocument(input: WorkspaceMemoryDocument): string {
  return createHash('sha256')
    .update(input.agentId)
    .update('\n')
    .update(input.content)
    .digest('hex')
}

async function resolveImportStatePath(context: ManagedMemoryContext = {}): Promise<string> {
  const status = await getManagedMemoryStatusPayload(context)
  return path.join(status.runtimeRoot, IMPORT_STATE_FILE)
}

function normalizeImportState(input: unknown): ManagedMemoryImportState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaultImportState()
  }

  const record = input as Record<string, unknown>
  const rawSources =
    record['sources'] && typeof record['sources'] === 'object' && !Array.isArray(record['sources'])
      ? (record['sources'] as Record<string, unknown>)
      : {}

  const sources: Record<string, ManagedMemoryImportSourceState> = {}
  for (const [key, value] of Object.entries(rawSources)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    const sourcePath = typeof item['sourcePath'] === 'string' ? item['sourcePath'].trim() : ''
    const fingerprint = typeof item['fingerprint'] === 'string' ? item['fingerprint'].trim() : ''
    if (!sourcePath || !fingerprint) continue
    sources[key] = {
      key,
      agentId: typeof item['agentId'] === 'string' && item['agentId'].trim() ? item['agentId'].trim() : DEFAULT_AGENT_ID,
      sourcePath,
      title:
        typeof item['title'] === 'string' && item['title'].trim()
          ? item['title'].trim()
          : path.basename(sourcePath, path.extname(sourcePath)),
      fingerprint,
      contentFingerprint:
        typeof item['contentFingerprint'] === 'string' && item['contentFingerprint'].trim()
          ? item['contentFingerprint'].trim()
          : fingerprint,
      memoryId: typeof item['memoryId'] === 'string' && item['memoryId'].trim() ? item['memoryId'].trim() : null,
      updatedAt: typeof item['updatedAt'] === 'string' ? item['updatedAt'] : nowIso(),
      duplicateOf: typeof item['duplicateOf'] === 'string' && item['duplicateOf'].trim() ? item['duplicateOf'].trim() : null,
    }
  }

  return {
    version: 1,
    lastImportedAt: typeof record['lastImportedAt'] === 'string' ? record['lastImportedAt'] : null,
    lastRun:
      record['lastRun'] && typeof record['lastRun'] === 'object' && !Array.isArray(record['lastRun'])
        ? (record['lastRun'] as ManagedMemoryImportRunSummary)
        : null,
    sources,
  }
}

async function readImportState(context: ManagedMemoryContext = {}): Promise<ManagedMemoryImportState> {
  try {
    const raw = await fs.readFile(await resolveImportStatePath(context), 'utf8')
    return normalizeImportState(JSON.parse(raw) as unknown)
  } catch {
    return defaultImportState()
  }
}

async function writeImportState(
  state: ManagedMemoryImportState,
  context: ManagedMemoryContext = {},
): Promise<void> {
  const statePath = await resolveImportStatePath(context)
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function summarizeImportState(
  state: ManagedMemoryImportState,
  context: ManagedMemoryContext = {},
  availableSourceCount = 0,
): Promise<ManagedMemoryImportStatusPayload> {
  const stateFile = await resolveImportStatePath(context)
  const trackedSources = Object.keys(state.sources).length
  const importedMemoryCount = Object.values(state.sources).filter((entry) => Boolean(entry.memoryId)).length
  return {
    runtimeRoot: path.dirname(stateFile),
    stateFile,
    availableSourceCount,
    trackedSources,
    importedMemoryCount,
    lastImportedAt: state.lastImportedAt,
    lastRun: state.lastRun,
  }
}

export async function getManagedMemoryImportStatus(
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryImportStatusPayload> {
  const [state, documents] = await Promise.all([
    readImportState(context),
    listWorkspaceMemoryDocuments(context),
  ])
  return summarizeImportState(state, context, documents.length)
}

export async function importOpenclawWorkspaceMemories(
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryImportStatusPayload> {
  const [previousState, documents] = await Promise.all([
    readImportState(context),
    listWorkspaceMemoryDocuments(context),
  ])

  const now = nowIso()
  const nextSources: Record<string, ManagedMemoryImportSourceState> = {}
  const activeFingerprints = new Map<string, string>()
  const currentSourceKeys = new Set(documents.map((document) => document.id))
  for (const [key, value] of Object.entries(previousState.sources)) {
    if (value.memoryId) {
      activeFingerprints.set(value.contentFingerprint, key)
    }
  }

  let imported = 0
  let updated = 0
  let skipped = 0
  let duplicate = 0
  let failed = 0

  for (const document of documents) {
    const sourceKey = document.id
    const fingerprint = fingerprintImportDocument(document)
    const contentFingerprint = contentFingerprintImportDocument(document)
    const previous = previousState.sources[sourceKey]

    if (previous?.fingerprint === fingerprint && previous.memoryId) {
      skipped += 1
      nextSources[sourceKey] = {
        ...previous,
        title: document.title,
        updatedAt: now,
      }
      activeFingerprints.set(contentFingerprint, sourceKey)
      continue
    }

    const duplicateOwner = activeFingerprints.get(contentFingerprint)
    if (duplicateOwner && duplicateOwner !== sourceKey) {
      const duplicateOwnerState = previousState.sources[duplicateOwner]
      if (!previous && duplicateOwnerState?.memoryId && !currentSourceKeys.has(duplicateOwner)) {
        try {
          const created = await addManagedMemory(
            {
              content: document.content,
              agentId: document.agentId,
              metadata: {
                importedFrom: 'openclaw-workspace',
                sourceType: 'workspace_markdown',
                sourcePath: document.sourcePath,
                title: document.title,
                fingerprint,
                importedAt: now,
              },
            },
            context,
          )

          if (duplicateOwnerState.memoryId !== created.memoryId) {
            await deleteManagedMemory(duplicateOwnerState.memoryId, context).catch(() => undefined)
          }

          nextSources[sourceKey] = {
            key: sourceKey,
            agentId: document.agentId,
            sourcePath: document.sourcePath,
            title: document.title,
            fingerprint,
            contentFingerprint,
            memoryId: created.memoryId,
            updatedAt: now,
            duplicateOf: null,
          }
          activeFingerprints.set(contentFingerprint, sourceKey)
          imported += 1
          continue
        } catch {
          failed += 1
          continue
        }
      }
      duplicate += 1
      if (previous?.memoryId) {
        try {
          await deleteManagedMemory(previous.memoryId, context)
        } catch {
          // Ignore stale delete failures while collapsing duplicate workspace entries.
        }
      }
      nextSources[sourceKey] = {
        key: sourceKey,
        agentId: document.agentId,
        sourcePath: document.sourcePath,
        title: document.title,
        fingerprint,
        contentFingerprint,
        memoryId: null,
        updatedAt: now,
        duplicateOf: duplicateOwner,
      }
      continue
    }

    try {
      const created = await addManagedMemory(
        {
          content: document.content,
          agentId: document.agentId,
          metadata: {
            importedFrom: 'openclaw-workspace',
            sourceType: 'workspace_markdown',
            sourcePath: document.sourcePath,
            title: document.title,
            fingerprint,
            importedAt: now,
          },
        },
        context,
      )

      if (previous?.memoryId && previous.memoryId !== created.memoryId) {
        await deleteManagedMemory(previous.memoryId, context)
      }

      nextSources[sourceKey] = {
        key: sourceKey,
        agentId: document.agentId,
        sourcePath: document.sourcePath,
        title: document.title,
        fingerprint,
        contentFingerprint,
        memoryId: created.memoryId,
        updatedAt: now,
        duplicateOf: null,
      }
      activeFingerprints.set(contentFingerprint, sourceKey)
      if (previous?.memoryId) {
        updated += 1
      } else {
        imported += 1
      }
    } catch {
      failed += 1
      if (previous) {
        nextSources[sourceKey] = {
          ...previous,
          title: document.title,
          updatedAt: now,
        }
      }
    }
  }

  for (const [key, previous] of Object.entries(previousState.sources)) {
    if (nextSources[key]) continue
    if (previous.memoryId) {
      try {
        await deleteManagedMemory(previous.memoryId, context)
      } catch {
        // ignore stale delete failures
      }
    }
  }

  const nextState: ManagedMemoryImportState = {
    version: 1,
    lastImportedAt: now,
    lastRun: {
      scanned: documents.length,
      imported,
      updated,
      skipped,
      duplicate,
      failed,
      importedMemoryCount: Object.values(nextSources).filter((entry) => Boolean(entry.memoryId)).length,
      lastImportedAt: now,
    },
    sources: nextSources,
  }

  await writeImportState(nextState, context)
  return summarizeImportState(nextState, context, documents.length)
}
