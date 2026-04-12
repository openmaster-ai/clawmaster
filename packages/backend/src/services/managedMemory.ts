import fs from 'node:fs/promises'
import { Embeddings } from '@langchain/core/embeddings'
import { Memory } from 'powermem'
import type { MemoryRecord, SearchHit } from 'powermem'
import {
  getClawmasterDataRootForProfile,
  getLocalDataProfileKey,
} from '../storage.js'
import {
  getOpenclawPathModule,
  getOpenclawProfileSelection,
  type OpenclawProfileContext,
  type OpenclawProfileSelection,
} from '../openclawProfile.js'

const EMBEDDING_DIMENSION = 128
const DEFAULT_LIST_LIMIT = 20
const STATS_USER_COUNT_PAGE_SIZE = 500

export interface ManagedMemoryContext extends OpenclawProfileContext {
  profileSelection?: OpenclawProfileSelection
  dataRootOverride?: string
}

export interface ManagedMemoryStoreContext {
  implementation: 'powermem'
  engine: 'powermem-sqlite'
  profileKey: string
  dataRoot: string
  runtimeRoot: string
  dbPath: string
}

export interface ManagedMemoryStatusPayload extends ManagedMemoryStoreContext {
  available: true
  backend: 'service'
  storageType: string
  provisioned: boolean
}

export interface ManagedMemoryStatsPayload extends ManagedMemoryStoreContext {
  storageType: string
  totalMemories: number
  userCount: number
  oldestMemory: string | null
  newestMemory: string | null
}

export interface ManagedMemoryListPayload {
  memories: ManagedMemoryRecord[]
  total: number
  limit: number
  offset: number
}

export interface ManagedMemoryRecord {
  id: string
  memoryId: string
  content: string
  userId?: string
  agentId?: string
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  accessCount?: number
}

export interface ManagedMemorySearchHit {
  memoryId: string
  content: string
  score?: number
  userId?: string
  agentId?: string
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

interface ManagedMemoryRuntime {
  store: ManagedMemoryStoreContext
  memory: Memory
}

class DeterministicEmbeddings extends Embeddings {
  constructor() {
    super({})
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map((document) => embedText(document))
  }

  async embedQuery(document: string): Promise<number[]> {
    return embedText(document)
  }
}

const sharedEmbeddings = new DeterministicEmbeddings()
const runtimeCache = new Map<string, Promise<ManagedMemoryRuntime>>()

function normalizeTokenSource(value: string): string[] {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return []

  const words = normalized
    .split(/[^\p{L}\p{N}._-]+/u)
    .map((token) => token.trim())
    .filter(Boolean)

  const joined = normalized.replace(/\s+/g, ' ')
  const grams: string[] = []
  for (let index = 0; index < joined.length - 2; index += 1) {
    grams.push(joined.slice(index, index + 3))
  }

  return words.length > 0 ? [...words, ...grams] : [joined]
}

function hashToken(value: string, seed: number): number {
  let hash = 2166136261 ^ seed
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function embedText(value: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0)
  const tokens = normalizeTokenSource(value)

  if (tokens.length === 0) {
    vector[0] = 1
    return vector
  }

  for (const token of tokens) {
    const primary = hashToken(token, 0) % EMBEDDING_DIMENSION
    const secondary = hashToken(token, 1) % EMBEDDING_DIMENSION
    const tertiary = hashToken(token, 2) % EMBEDDING_DIMENSION
    vector[primary] += 1
    vector[secondary] += 0.5
    vector[tertiary] -= 0.25
  }

  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0))
  if (magnitude <= 0) {
    vector[0] = 1
    return vector
  }

  return vector.map((item) => item / magnitude)
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

function normalizeRecord(record: MemoryRecord): ManagedMemoryRecord {
  return {
    id: record.id,
    memoryId: record.memoryId,
    content: record.content,
    userId: record.userId || undefined,
    agentId: record.agentId || undefined,
    metadata: normalizeMetadata(record.metadata),
    createdAt: record.createdAt || undefined,
    updatedAt: record.updatedAt || undefined,
    accessCount: record.accessCount,
  }
}

function normalizeSearchHit(hit: SearchHit): ManagedMemorySearchHit {
  return {
    memoryId: hit.memoryId,
    content: hit.content,
    score: hit.score,
    userId: hit.userId || undefined,
    agentId: hit.agentId || undefined,
    metadata: normalizeMetadata(hit.metadata),
    createdAt: hit.createdAt || undefined,
    updatedAt: hit.updatedAt || undefined,
  }
}

export function resolveManagedMemoryStoreContext(
  context: ManagedMemoryContext = {}
): ManagedMemoryStoreContext {
  const profileSelection = context.profileSelection ?? getOpenclawProfileSelection(context)
  const pathModule = getOpenclawPathModule(context.platform)
  const dataRoot =
    context.dataRootOverride
    ?? getClawmasterDataRootForProfile(profileSelection, context)
  const runtimeRoot = pathModule.join(dataRoot, 'memory', 'powermem')
  const dbPath = pathModule.join(runtimeRoot, 'powermem.sqlite')

  return {
    implementation: 'powermem',
    engine: 'powermem-sqlite',
    profileKey: getLocalDataProfileKey(profileSelection),
    dataRoot,
    runtimeRoot,
    dbPath,
  }
}

async function createManagedMemoryRuntime(
  store: ManagedMemoryStoreContext
): Promise<ManagedMemoryRuntime> {
  await fs.mkdir(store.runtimeRoot, { recursive: true })
  const memory = await Memory.create({
    embeddings: sharedEmbeddings,
    config: {
      vectorStore: {
        provider: 'sqlite',
        config: { path: store.dbPath },
      },
      intelligentMemory: {
        enabled: false,
      },
    },
  })

  return { store, memory }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function isManagedMemoryProvisioned(
  context: ManagedMemoryContext = {}
): Promise<boolean> {
  const store = resolveManagedMemoryStoreContext(context)
  if (runtimeCache.has(store.dbPath)) return true
  return pathExists(store.dbPath)
}

async function countDistinctManagedMemoryUsers(memory: Memory): Promise<number> {
  const seen = new Set<string>()
  let offset = 0
  let total = 0

  while (offset === 0 || offset < total) {
    const page = await memory.getAll({
      limit: STATS_USER_COUNT_PAGE_SIZE,
      offset,
    })
    total = page.total
    for (const item of page.memories) {
      const userId = item.userId?.trim()
      if (userId) {
        seen.add(userId)
      }
    }
    if (page.memories.length === 0) {
      break
    }
    offset += page.memories.length
  }

  return seen.size
}

async function getManagedMemoryRuntime(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryRuntime> {
  const store = resolveManagedMemoryStoreContext(context)
  let runtimePromise = runtimeCache.get(store.dbPath)
  if (!runtimePromise) {
    runtimePromise = createManagedMemoryRuntime(store).catch((error) => {
      runtimeCache.delete(store.dbPath)
      throw error
    })
    runtimeCache.set(store.dbPath, runtimePromise)
  }
  return runtimePromise
}

function trimOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export async function getManagedMemoryStatusPayload(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryStatusPayload> {
  const store = resolveManagedMemoryStoreContext(context)
  const runtime = runtimeCache.has(store.dbPath) ? await getManagedMemoryRuntime(context) : null
  const provisioned = runtime ? true : await pathExists(store.dbPath)
  return {
    ...store,
    available: true,
    backend: 'service',
    storageType: runtime?.memory.getStorageType() ?? 'sqlite',
    provisioned,
  }
}

export async function getManagedMemoryStatsPayload(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryStatsPayload> {
  const store = resolveManagedMemoryStoreContext(context)
  if (!(await isManagedMemoryProvisioned(context))) {
    return {
      ...store,
      storageType: 'sqlite',
      totalMemories: 0,
      userCount: 0,
      oldestMemory: null,
      newestMemory: null,
    }
  }
  const runtime = await getManagedMemoryRuntime(context)
  const [statistics, totalMemories, userCount] = await Promise.all([
    runtime.memory.getStatistics(),
    runtime.memory.count(),
    countDistinctManagedMemoryUsers(runtime.memory),
  ])

  return {
    ...runtime.store,
    storageType: runtime.memory.getStorageType(),
    totalMemories,
    userCount,
    oldestMemory:
      typeof statistics['oldestMemory'] === 'string' ? statistics['oldestMemory'] : null,
    newestMemory:
      typeof statistics['newestMemory'] === 'string' ? statistics['newestMemory'] : null,
  }
}

export async function listManagedMemories(
  options: {
    userId?: string
    agentId?: string
    limit?: number
    offset?: number
  } = {},
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryListPayload> {
  if (!(await isManagedMemoryProvisioned(context))) {
    const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT))
    const offset = Math.max(0, options.offset ?? 0)
    return {
      memories: [],
      total: 0,
      limit,
      offset,
    }
  }
  const runtime = await getManagedMemoryRuntime(context)
  const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT))
  const offset = Math.max(0, options.offset ?? 0)
  const result = await runtime.memory.getAll({
    userId: trimOptional(options.userId),
    agentId: trimOptional(options.agentId),
    limit,
    offset,
  })

  return {
    memories: result.memories.map(normalizeRecord),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  }
}

export async function searchManagedMemories(
  query: string,
  options: {
    userId?: string
    agentId?: string
    limit?: number
  } = {},
  context: ManagedMemoryContext = {}
): Promise<ManagedMemorySearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  if (!(await isManagedMemoryProvisioned(context))) return []

  const runtime = await getManagedMemoryRuntime(context)
  const result = await runtime.memory.search(trimmed, {
    userId: trimOptional(options.userId),
    agentId: trimOptional(options.agentId),
    limit: Math.min(50, Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT)),
  })
  return result.results.map(normalizeSearchHit)
}

export async function addManagedMemory(
  input: {
    content: string
    userId?: string
    agentId?: string
    metadata?: Record<string, unknown>
  },
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryRecord> {
  const content = input.content.trim()
  if (!content) {
    throw new Error('Managed memory content is required')
  }

  const runtime = await getManagedMemoryRuntime(context)
  const result = await runtime.memory.add(content, {
    userId: trimOptional(input.userId),
    agentId: trimOptional(input.agentId),
    metadata: normalizeMetadata(input.metadata),
  })
  const created = result.memories[0]
  if (!created) {
    throw new Error('powermem did not return the created memory record')
  }
  return normalizeRecord(created)
}

export async function deleteManagedMemory(
  memoryId: string,
  context: ManagedMemoryContext = {}
): Promise<boolean> {
  const trimmed = memoryId.trim()
  if (!trimmed) {
    throw new Error('Managed memory id is required')
  }
  if (!(await isManagedMemoryProvisioned(context))) {
    return false
  }

  const runtime = await getManagedMemoryRuntime(context)
  return runtime.memory.delete(trimmed)
}

export async function resetManagedMemory(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryStatsPayload> {
  if (!(await isManagedMemoryProvisioned(context))) {
    return getManagedMemoryStatsPayload(context)
  }
  const runtime = await getManagedMemoryRuntime(context)
  await runtime.memory.reset()
  return getManagedMemoryStatsPayload(context)
}

export async function closeManagedMemoryRuntimesForTests(): Promise<void> {
  const runtimes = Array.from(runtimeCache.values())
  runtimeCache.clear()
  await Promise.allSettled(
    runtimes.map(async (runtimePromise) => {
      const runtime = await runtimePromise
      await runtime.memory.close()
    })
  )
}
