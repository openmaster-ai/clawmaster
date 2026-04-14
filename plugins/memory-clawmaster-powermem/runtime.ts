import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Embeddings } from '@langchain/core/embeddings'
import {
  Memory,
  SeekDBStore,
  SQLiteStore,
  type MemoryRecord,
  type SearchHit,
  type VectorStore,
  type VectorStoreRecord,
  type VectorStoreSearchMatch,
} from 'powermem'

const EMBEDDING_DIMENSION = 128
const DEFAULT_LIST_LIMIT = 20
const SQLITE_DB_FILE = 'powermem.sqlite'
const SEEKDB_ROOT_DIR = 'seekdb'
const SEEKDB_DATABASE = 'test'
const SEEKDB_COLLECTION = 'memories'
const SEEKDB_DISTANCE = 'cosine' as const
const SEEKDB_MIGRATION_MARKER = 'powermem-seekdb-migration.json'
const SQLITE_SIDECAR_SUFFIXES = ['', '-wal', '-shm', '-journal']

export type ManagedMemoryEngine = 'powermem-sqlite' | 'powermem-seekdb'

export interface ManagedMemoryContext {
  dataRootOverride?: string
  engineOverride?: ManagedMemoryEngine
}

export interface ManagedMemoryStatusPayload {
  available: true
  backend: 'service'
  implementation: 'powermem'
  engine: ManagedMemoryEngine
  runtimeMode: 'host-managed'
  runtimeTarget: 'native'
  hostPlatform: string
  hostArch: string
  targetPlatform: string
  targetArch: string
  selectedWslDistro: string | null
  profileKey: string
  dataRoot: string
  runtimeRoot: string
  storagePath: string
  dbPath?: string
  legacyDbPath: string
  storageType: string
  provisioned: boolean
}

export interface ManagedMemoryStatsPayload extends ManagedMemoryStatusPayload {
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

interface ManagedMemoryStoreContext {
  engine: ManagedMemoryEngine
  dataRoot: string
  runtimeRoot: string
  storagePath: string
  dbPath?: string
  legacyDbPath: string
}

interface ManagedMemoryRuntime {
  store: ManagedMemoryStoreContext
  memory: Memory
  vectorStore: VectorStore
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

class ClawmasterSeekdbStore implements VectorStore {
  constructor(private readonly inner: SeekDBStore) {}

  async insert(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.inner.insert(id, vector, payload)
  }

  async getById(id: string, userId?: string, agentId?: string) {
    return this.inner.getById(id, userId, agentId)
  }

  async update(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.inner.update(id, vector, payload)
  }

  async remove(id: string): Promise<boolean> {
    return this.inner.remove(id)
  }

  async list(...args: Parameters<VectorStore['list']>) {
    return this.inner.list(...args)
  }

  async search(...args: Parameters<VectorStore['search']>) {
    return this.inner.search(...args)
  }

  async hybridSearch(...args: unknown[]) {
    const hybridSearch = (this.inner as SeekDBStore & {
      hybridSearch?: (...callArgs: unknown[]) => Promise<unknown>
    }).hybridSearch
    if (!hybridSearch) {
      return this.inner.search(
        ...(args as Parameters<VectorStore['search']>)
      )
    }
    return hybridSearch.apply(this.inner, args)
  }

  async count(...args: Parameters<VectorStore['count']>) {
    return this.inner.count(...args)
  }

  async incrementAccessCount(id: string): Promise<void> {
    await this.inner.incrementAccessCount(id)
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    await this.inner.incrementAccessCountBatch(ids)
  }

  async removeAll(...args: Parameters<VectorStore['removeAll']>) {
    await this.inner.removeAll(...args)
  }

  async close(): Promise<void> {
    // Avoid seekdb embedded teardown from the OpenClaw plugin process for now.
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

function resolveManagedMemoryStorageType(engine: ManagedMemoryEngine): string {
  return engine === 'powermem-seekdb' ? 'seekdb' : 'sqlite'
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

function normalizeVectorStoreSearchMatch(match: VectorStoreSearchMatch): ManagedMemorySearchHit {
  return {
    memoryId: match.id,
    content: match.content,
    score: match.score,
    userId: match.userId || undefined,
    agentId: match.agentId || undefined,
    metadata: normalizeMetadata(match.metadata),
    createdAt: match.createdAt || undefined,
    updatedAt: match.updatedAt || undefined,
  }
}

function toRuntimeCacheKey(store: ManagedMemoryStoreContext): string {
  return `${store.engine}:${store.storagePath}`
}

function toPowermemPayload(record: VectorStoreRecord): Record<string, unknown> {
  const metadata = normalizeMetadata(record.metadata)
  if (record.scope && metadata.scope === undefined) {
    metadata.scope = record.scope
  }
  if (record.accessCount !== undefined && metadata.access_count === undefined) {
    metadata.access_count = record.accessCount
  }
  return {
    data: record.content,
    user_id: record.userId ?? null,
    agent_id: record.agentId ?? null,
    run_id: record.runId ?? null,
    actor_id: record.actorId ?? null,
    hash: record.hash ?? `${record.id}-legacy`,
    created_at: record.createdAt ?? new Date().toISOString(),
    updated_at: record.updatedAt ?? record.createdAt ?? new Date().toISOString(),
    category: record.category ?? null,
    metadata,
  }
}

function resolveManagedMemoryStoreContext(
  context: ManagedMemoryContext = {},
): ManagedMemoryStoreContext {
  const dataRoot = context.dataRootOverride?.trim()
  if (!dataRoot) {
    throw new Error('Managed memory dataRootOverride is required')
  }
  const runtimeRoot = join(dataRoot, 'memory', 'powermem')
  const legacyDbPath = join(runtimeRoot, SQLITE_DB_FILE)
  const engine = context.engineOverride ?? 'powermem-sqlite'
  const storagePath = engine === 'powermem-seekdb'
    ? join(runtimeRoot, SEEKDB_ROOT_DIR)
    : legacyDbPath
  return {
    engine,
    dataRoot,
    runtimeRoot,
    storagePath,
    dbPath: engine === 'powermem-sqlite' ? storagePath : undefined,
    legacyDbPath,
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function writeSeekdbMigrationMarker(
  store: ManagedMemoryStoreContext,
  payload: Record<string, unknown>,
): Promise<void> {
  await fs.writeFile(join(store.runtimeRoot, SEEKDB_MIGRATION_MARKER), JSON.stringify(payload, null, 2), 'utf8')
}

async function migrateLegacySqliteIfNeeded(
  store: ManagedMemoryStoreContext,
  seekdbStore: VectorStore,
): Promise<void> {
  if (store.engine !== 'powermem-seekdb') return

  const markerPath = join(store.runtimeRoot, SEEKDB_MIGRATION_MARKER)
  if (await pathExists(markerPath)) return
  if (!(await pathExists(store.legacyDbPath))) return

  const sqliteStore = new SQLiteStore(store.legacyDbPath)
  let migratedCount = 0
  let insertedCount = 0
  let updatedCount = 0
  const existingCountAtStart = await seekdbStore.count()
  try {
    let offset = 0
    let total = 0

    while (offset === 0 || offset < total) {
      const page = await sqliteStore.list({}, 200, offset, {
        sortBy: 'created_at',
        order: 'asc',
      })
      total = page.total

      for (const record of page.records) {
        const vector = record.embedding ?? embedText(record.content)
        const payload = toPowermemPayload(record)
        const existing = await seekdbStore
          .getById(record.id, record.userId, record.agentId)
          .catch(() => null)
        if (existing) {
          await seekdbStore.update(record.id, vector, payload)
          updatedCount += 1
        } else {
          await seekdbStore.insert(record.id, vector, payload)
          insertedCount += 1
        }
        migratedCount += 1
      }

      if (page.records.length === 0) break
      offset += page.records.length
    }
  } finally {
    await sqliteStore.close()
  }

  await writeSeekdbMigrationMarker(store, {
    migratedAt: new Date().toISOString(),
    mode: 'sqlite-to-seekdb',
    migratedCount,
    insertedCount,
    updatedCount,
    existingCountAtStart,
    sourcePath: store.legacyDbPath,
  })
}

export async function migrateLegacySqliteIfNeededForTest(
  context: ManagedMemoryContext,
  seekdbStore: VectorStore,
): Promise<void> {
  const store = resolveManagedMemoryStoreContext(context)
  await fs.mkdir(store.runtimeRoot, { recursive: true })
  await migrateLegacySqliteIfNeeded(store, seekdbStore)
}

async function removeLegacySqliteFiles(store: ManagedMemoryStoreContext): Promise<void> {
  await Promise.all(
    SQLITE_SIDECAR_SUFFIXES.map(async (suffix) => {
      try {
        await fs.rm(`${store.legacyDbPath}${suffix}`, { force: true })
      } catch {
        // Ignore missing legacy sidecars after seekdb promotion.
      }
    }),
  )
}

async function hasManagedMemoryData(store: ManagedMemoryStoreContext): Promise<boolean> {
  if (await pathExists(store.storagePath)) return true
  if (store.engine === 'powermem-seekdb' && await pathExists(store.legacyDbPath)) return true
  return false
}

async function createManagedMemoryRuntime(
  store: ManagedMemoryStoreContext,
): Promise<ManagedMemoryRuntime> {
  await fs.mkdir(store.runtimeRoot, { recursive: true })

  if (store.engine === 'powermem-seekdb') {
    await fs.mkdir(store.storagePath, { recursive: true })
    const vectorStore = new ClawmasterSeekdbStore(
      await SeekDBStore.create({
        path: store.storagePath,
        database: SEEKDB_DATABASE,
        collectionName: SEEKDB_COLLECTION,
        dimension: EMBEDDING_DIMENSION,
        distance: SEEKDB_DISTANCE,
      }),
    )
    await migrateLegacySqliteIfNeeded(store, vectorStore)
    const memory = await Memory.create({
      embeddings: sharedEmbeddings,
      store: vectorStore,
      config: {
        intelligentMemory: {
          enabled: false,
        },
      },
    })
    return { store, memory, vectorStore }
  }

  const vectorStore = new SQLiteStore(store.storagePath)
  const memory = await Memory.create({
    embeddings: sharedEmbeddings,
    store: vectorStore,
    config: {
      intelligentMemory: {
        enabled: false,
      },
    },
  })
  return { store, memory, vectorStore }
}

async function getManagedMemoryRuntime(
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryRuntime> {
  const store = resolveManagedMemoryStoreContext(context)
  const cacheKey = toRuntimeCacheKey(store)
  let runtimePromise = runtimeCache.get(cacheKey)
  if (!runtimePromise) {
    runtimePromise = createManagedMemoryRuntime(store).catch((error) => {
      runtimeCache.delete(cacheKey)
      throw error
    })
    runtimeCache.set(cacheKey, runtimePromise)
  }
  return runtimePromise
}

async function isManagedMemoryProvisioned(
  context: ManagedMemoryContext = {},
): Promise<boolean> {
  const store = resolveManagedMemoryStoreContext(context)
  if (runtimeCache.has(toRuntimeCacheKey(store))) return true
  return hasManagedMemoryData(store)
}

async function countDistinctManagedMemoryUsers(memory: Memory): Promise<number> {
  const seen = new Set<string>()
  let offset = 0
  let total = 0

  while (offset === 0 || offset < total) {
    const page = await memory.getAll({
      limit: 500,
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

function trimOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function isReadonlySearchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('readonly database') || lower.includes('sqlite_readonly')
}

export async function getManagedMemoryStatusPayload(
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryStatusPayload> {
  const store = resolveManagedMemoryStoreContext(context)
  const runtime = runtimeCache.has(toRuntimeCacheKey(store)) ? await getManagedMemoryRuntime(context) : null
  const provisioned = runtime ? true : await hasManagedMemoryData(store)
  return {
    available: true,
    backend: 'service',
    implementation: 'powermem',
    engine: store.engine,
    runtimeMode: 'host-managed',
    runtimeTarget: 'native',
    hostPlatform: process.platform,
    hostArch: process.arch,
    targetPlatform: process.platform,
    targetArch: process.arch,
    selectedWslDistro: null,
    profileKey: 'default',
    dataRoot: store.dataRoot,
    runtimeRoot: store.runtimeRoot,
    storagePath: store.storagePath,
    dbPath: store.dbPath,
    legacyDbPath: store.legacyDbPath,
    storageType: runtime?.memory.getStorageType() ?? resolveManagedMemoryStorageType(store.engine),
    provisioned,
  }
}

export async function getManagedMemoryStatsPayload(
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryStatsPayload> {
  const status = await getManagedMemoryStatusPayload(context)
  if (!status.provisioned) {
    return {
      ...status,
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
    ...status,
    storageType: runtime.memory.getStorageType(),
    totalMemories,
    userCount,
    oldestMemory: typeof statistics['oldestMemory'] === 'string' ? statistics['oldestMemory'] : null,
    newestMemory: typeof statistics['newestMemory'] === 'string' ? statistics['newestMemory'] : null,
  }
}

export async function listManagedMemories(
  options: {
    userId?: string
    agentId?: string
    limit?: number
    offset?: number
  } = {},
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryListPayload> {
  const limit = Math.min(100, Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT))
  const offset = Math.max(0, options.offset ?? 0)

  if (!(await isManagedMemoryProvisioned(context))) {
    return {
      memories: [],
      total: 0,
      limit,
      offset,
    }
  }

  const runtime = await getManagedMemoryRuntime(context)
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
  context: ManagedMemoryContext = {},
): Promise<ManagedMemorySearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  if (!(await isManagedMemoryProvisioned(context))) return []

  const runtime = await getManagedMemoryRuntime(context)
  const userId = trimOptional(options.userId)
  const agentId = trimOptional(options.agentId)
  const limit = Math.min(50, Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT))
  try {
    const result = await runtime.memory.search(trimmed, {
      userId,
      agentId,
      limit,
    })
    return result.results.map(normalizeSearchHit)
  } catch (error) {
    if (!isReadonlySearchError(error)) throw error
    const queryEmbedding = await sharedEmbeddings.embedQuery(trimmed)
    const matches = await runtime.vectorStore.search(queryEmbedding, { userId, agentId }, limit)
    return matches.map(normalizeVectorStoreSearchMatch)
  }
}

export async function addManagedMemory(
  input: {
    content: string
    userId?: string
    agentId?: string
    metadata?: Record<string, unknown>
  },
  context: ManagedMemoryContext = {},
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
  if (runtime.store.engine === 'powermem-seekdb') {
    await removeLegacySqliteFiles(runtime.store)
  }
  return normalizeRecord(created)
}

export async function deleteManagedMemory(
  memoryId: string,
  context: ManagedMemoryContext = {},
): Promise<boolean> {
  const trimmed = memoryId.trim()
  if (!trimmed) {
    throw new Error('Managed memory id is required')
  }
  if (!(await isManagedMemoryProvisioned(context))) return false

  const runtime = await getManagedMemoryRuntime(context)
  const deleted = await runtime.memory.delete(trimmed)
  if (runtime.store.engine === 'powermem-seekdb' && deleted) {
    await removeLegacySqliteFiles(runtime.store)
  }
  return deleted
}

export async function resetManagedMemory(
  context: ManagedMemoryContext = {},
): Promise<ManagedMemoryStatsPayload> {
  if (!(await isManagedMemoryProvisioned(context))) {
    return getManagedMemoryStatsPayload(context)
  }
  const runtime = await getManagedMemoryRuntime(context)
  await runtime.memory.reset()
  if (runtime.store.engine === 'powermem-seekdb') {
    await removeLegacySqliteFiles(runtime.store)
  }
  return getManagedMemoryStatsPayload(context)
}

export async function closeManagedMemoryRuntimesForTests(): Promise<void> {
  const runtimes = Array.from(runtimeCache.values())
  runtimeCache.clear()
  await Promise.allSettled(
    runtimes.map(async (runtimePromise) => {
      const runtime = await runtimePromise
      await runtime.memory.close()
    }),
  )
}
