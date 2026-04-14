import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  addManagedMemory,
  deleteManagedMemory,
  resolveManagedMemoryStoreContext,
  type ManagedMemoryContext,
} from './managedMemory.js'
import { listWorkspaceMemoryDocuments } from './memoryOpenclaw.js'

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
  profileKey: string
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

const IMPORT_STATE_FILE = 'openclaw-import-state.json'

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
    const agentId = typeof item['agentId'] === 'string' ? item['agentId'].trim() : 'main'
    const title = typeof item['title'] === 'string' ? item['title'].trim() : path.basename(sourcePath)
    if (!sourcePath || !fingerprint) continue
    sources[key] = {
      key,
      agentId,
      sourcePath,
      title,
      fingerprint,
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

function fingerprintImportDocument(input: {
  agentId: string
  sourcePath: string
  content: string
}): string {
  return createHash('sha256')
    .update(input.agentId)
    .update('\n')
    .update(input.sourcePath)
    .update('\n')
    .update(input.content)
    .digest('hex')
}

function resolveImportStatePath(context: ManagedMemoryContext = {}): string {
  const store = resolveManagedMemoryStoreContext(context)
  return path.join(store.runtimeRoot, IMPORT_STATE_FILE)
}

async function readImportState(context: ManagedMemoryContext = {}): Promise<ManagedMemoryImportState> {
  try {
    const raw = await fs.readFile(resolveImportStatePath(context), 'utf8')
    return normalizeImportState(JSON.parse(raw) as unknown)
  } catch {
    return defaultImportState()
  }
}

async function writeImportState(
  state: ManagedMemoryImportState,
  context: ManagedMemoryContext = {}
): Promise<void> {
  const statePath = resolveImportStatePath(context)
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function summarizeImportState(
  state: ManagedMemoryImportState,
  context: ManagedMemoryContext = {},
  availableSourceCount = 0
): ManagedMemoryImportStatusPayload {
  const store = resolveManagedMemoryStoreContext(context)
  const trackedSources = Object.keys(state.sources).length
  const importedMemoryCount = Object.values(state.sources).filter((entry) => Boolean(entry.memoryId)).length
  return {
    profileKey: store.profileKey,
    runtimeRoot: store.runtimeRoot,
    stateFile: resolveImportStatePath(context),
    availableSourceCount,
    trackedSources,
    importedMemoryCount,
    lastImportedAt: state.lastImportedAt,
    lastRun: state.lastRun,
  }
}

export async function getManagedMemoryImportStatus(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryImportStatusPayload> {
  const [state, documents] = await Promise.all([
    readImportState(context),
    listWorkspaceMemoryDocuments({
      openclawDataRootOverride: context.openclawDataRootOverride,
    }),
  ])
  return summarizeImportState(state, context, documents.length)
}

export async function importOpenclawWorkspaceMemories(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryImportStatusPayload> {
  const [previousState, documents] = await Promise.all([
    readImportState(context),
    listWorkspaceMemoryDocuments({
      openclawDataRootOverride: context.openclawDataRootOverride,
    }),
  ])

  const now = nowIso()
  const nextSources: Record<string, ManagedMemoryImportSourceState> = {}
  const activeFingerprints = new Map<string, string>()
  for (const [key, value] of Object.entries(previousState.sources)) {
    if (value.memoryId) {
      activeFingerprints.set(value.fingerprint, key)
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
    const previous = previousState.sources[sourceKey]

    if (previous?.fingerprint === fingerprint && previous.memoryId) {
      skipped += 1
      nextSources[sourceKey] = {
        ...previous,
        title: document.title,
        updatedAt: now,
      }
      activeFingerprints.set(fingerprint, sourceKey)
      continue
    }

    const duplicateOwner = activeFingerprints.get(fingerprint)
    if (duplicateOwner && duplicateOwner !== sourceKey) {
      duplicate += 1
      nextSources[sourceKey] = {
        key: sourceKey,
        agentId: document.agentId,
        sourcePath: document.sourcePath,
        title: document.title,
        fingerprint,
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
        context
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
        memoryId: created.memoryId,
        updatedAt: now,
        duplicateOf: null,
      }
      activeFingerprints.set(fingerprint, sourceKey)
      if (previous?.memoryId) updated += 1
      else imported += 1
    } catch {
      failed += 1
      if (previous) {
        nextSources[sourceKey] = previous
      }
    }
  }

  for (const [sourceKey, previous] of Object.entries(previousState.sources)) {
    if (nextSources[sourceKey]) continue
    if (previous.memoryId) {
      await deleteManagedMemory(previous.memoryId, context)
    }
  }

  const lastRun: ManagedMemoryImportRunSummary = {
    scanned: documents.length,
    imported,
    updated,
    skipped,
    duplicate,
    failed,
    importedMemoryCount: Object.values(nextSources).filter((entry) => Boolean(entry.memoryId)).length,
    lastImportedAt: now,
  }

  const nextState: ManagedMemoryImportState = {
    version: 1,
    lastImportedAt: now,
    lastRun,
    sources: nextSources,
  }
  await writeImportState(nextState, context)

  return summarizeImportState(nextState, context, documents.length)
}
