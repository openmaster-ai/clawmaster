import type {
  ManagedMemoryBridgeStatusPayload,
  ManagedMemoryImportStatusPayload,
  ManagedMemoryListPayload,
  ManagedMemoryRecord,
  ManagedMemorySearchHit,
  ManagedMemoryStatsPayload,
  ManagedMemoryStatusPayload,
  OpenclawMemoryFilesPayload,
  OpenclawMemoryReindexPayload,
  OpenclawMemorySearchCapabilityPayload,
  OpenclawMemoryStatusPayload,
} from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { ok } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { createDangerousActionHeaders, webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'
import { parseOpenclawMemorySearchJson, type OpenclawMemoryHit } from '@/shared/memoryOpenclawParse'

function findBalancedJsonEnd(raw: string, start: number): number | null {
  const first = raw[start]
  if (first !== '{' && first !== '[') return null

  const expectedClosers: string[] = [first === '{' ? '}' : ']']
  let inString = false
  let escaped = false

  for (let index = start + 1; index < raw.length; index += 1) {
    const ch = raw[index]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      expectedClosers.push('}')
      continue
    }
    if (ch === '[') {
      expectedClosers.push(']')
      continue
    }
    if (ch === '}' || ch === ']') {
      const expected = expectedClosers.pop()
      if (expected !== ch) {
        return null
      }
      if (expectedClosers.length === 0) {
        return index
      }
    }
  }

  return null
}

function extractFirstJsonValue(raw: string): unknown | null {
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]
    if (ch !== '{' && ch !== '[') continue
    const end = findBalancedJsonEnd(raw, index)
    if (end === null) continue
    const candidate = raw.slice(index, end + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }
  return null
}

function parseStdoutJsonLoose(stdout: string): unknown {
  const t = stdout.trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    const extracted = extractFirstJsonValue(t)
    if (extracted !== null) {
      return extracted
    }
    return { raw: t }
  }
}

function hasStructuredOpenclawMemorySearchPayload(value: unknown): boolean {
  if (Array.isArray(value)) return true
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Array.isArray(record.hits ?? record.results ?? record.items ?? record.memories ?? record.matches)
}

function hasFtsUnavailableError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('fts5') && lower.includes('no such module')
}

interface TauriCapturedCommandResult {
  code: number
  stdout: string
  stderr: string
}

function isStructuredManagedDesktopJson(value: unknown): boolean {
  if (Array.isArray(value)) return true
  if (!value || typeof value !== 'object') return false
  return !('raw' in (value as Record<string, unknown>))
}

function parseManagedDesktopJson<T>(captured: TauriCapturedCommandResult): T {
  const parsedStdout = parseStdoutJsonLoose(captured.stdout)
  if (isStructuredManagedDesktopJson(parsedStdout)) {
    return parsedStdout as T
  }
  const parsedStderr = parseStdoutJsonLoose(captured.stderr)
  if (isStructuredManagedDesktopJson(parsedStderr)) {
    return parsedStderr as T
  }
  const detail = captured.stderr?.trim() || captured.stdout?.trim() || 'Managed PowerMem command failed'
  throw new Error(detail)
}

async function runTauriManagedMemoryCommand<T>(args: string[]): Promise<T> {
  const captured = await tauriInvoke<TauriCapturedCommandResult>('run_openclaw_command_captured', { args })
  return parseManagedDesktopJson<T>(captured)
}

function isMissingManagedMemoryCommand(message: string): boolean {
  return /unknown command ['"`]?ltm['"`]?/i.test(message)
}

function resolveManagedMemoryStorageType(engine: ManagedMemoryStatusPayload['engine']): string {
  return engine === 'powermem-seekdb' ? 'seekdb' : 'sqlite'
}

function buildManagedMemoryStatusFromBridge(
  bridge: ManagedMemoryBridgeStatusPayload,
): ManagedMemoryStatusPayload {
  return {
    ...bridge.store,
    available: true,
    backend: 'service',
    storageType: resolveManagedMemoryStorageType(bridge.store.engine),
    provisioned: false,
  }
}

function buildManagedMemoryStatsFromBridge(
  bridge: ManagedMemoryBridgeStatusPayload,
): ManagedMemoryStatsPayload {
  return {
    ...bridge.store,
    storageType: resolveManagedMemoryStorageType(bridge.store.engine),
    totalMemories: 0,
    userCount: 0,
    oldestMemory: null,
    newestMemory: null,
  }
}

function buildManagedMemoryImportStatusFromBridge(
  bridge: ManagedMemoryBridgeStatusPayload,
): ManagedMemoryImportStatusPayload {
  return {
    profileKey: bridge.store.profileKey,
    runtimeRoot: bridge.store.runtimeRoot,
    stateFile: `${bridge.store.runtimeRoot}/openclaw-import-state.json`,
    availableSourceCount: 0,
    trackedSources: 0,
    importedMemoryCount: 0,
    lastImportedAt: null,
    lastRun: null,
  }
}

async function getTauriManagedMemoryBridgeStatus(): Promise<ManagedMemoryBridgeStatusPayload> {
  return tauriInvoke<ManagedMemoryBridgeStatusPayload>('get_managed_memory_bridge_status')
}

async function runTauriManagedMemoryReadWithBridgeFallback<T>(
  args: string[],
  buildFallback: (bridge: ManagedMemoryBridgeStatusPayload) => T,
): Promise<T> {
  try {
    return await runTauriManagedMemoryCommand<T>(args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!isMissingManagedMemoryCommand(message)) {
      throw error
    }
    const bridge = await getTauriManagedMemoryBridgeStatus()
    if (bridge.state === 'ready') {
      throw error
    }
    return buildFallback(bridge)
  }
}

async function tauriOpenclawMemoryStatus(): Promise<OpenclawMemoryStatusPayload> {
  const out = await tauriInvoke<{ code: number; stdout: string; stderr: string }>(
    'run_openclaw_command_captured',
    { args: ['memory', 'status', '--json'] },
  )
  return {
    exitCode: out.code,
    data: parseStdoutJsonLoose(out.stdout),
    stderr: out.stderr?.trim() || undefined,
  }
}

async function tauriOpenclawMemorySearch(
  q: string,
  agent?: string,
  maxResults = 20,
): Promise<OpenclawMemoryHit[]> {
  const max = Math.min(100, Math.max(1, maxResults))
  const args = ['memory', 'search', '--json', '--max-results', String(max)]
  if (agent?.trim()) args.push('--agent', agent.trim())
  args.push('--query', q)
  const out = await tauriInvoke<{ code: number; stdout: string; stderr: string }>(
    'run_openclaw_command_captured',
    { args },
  )
  const parsed = parseStdoutJsonLoose(out.stdout)
  if (out.code === 0 || hasStructuredOpenclawMemorySearchPayload(parsed)) {
    return parseOpenclawMemorySearchJson(out.stdout)
  }
  const detail = out.stderr?.trim() || out.stdout?.trim() || 'OpenClaw memory search failed'
  if (hasFtsUnavailableError(detail)) {
    return tauriInvoke<OpenclawMemoryHit[]>('search_openclaw_memory_fallback', {
      query: q,
      agent,
      maxResults: max,
    })
  }
  throw new Error(detail)
}

export async function openclawMemoryStatusResult(): Promise<AdapterResult<OpenclawMemoryStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriOpenclawMemoryStatus())
  }
  return webFetchJson<OpenclawMemoryStatusPayload>('/api/memory/openclaw/status')
}

export async function openclawMemorySearchCapabilityResult(): Promise<
  AdapterResult<OpenclawMemorySearchCapabilityPayload>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<OpenclawMemorySearchCapabilityPayload>('get_openclaw_memory_search_capability'),
    )
  }
  return webFetchJson<OpenclawMemorySearchCapabilityPayload>('/api/memory/openclaw/search-capability')
}

export async function openclawMemorySearchResult(
  q: string,
  options?: { agent?: string; maxResults?: number },
): Promise<AdapterResult<OpenclawMemoryHit[]>> {
  const query = q.trim()
  if (!query) return ok([])
  if (getIsTauri()) {
    return fromPromise(() => tauriOpenclawMemorySearch(query, options?.agent, options?.maxResults))
  }
  const params = new URLSearchParams({ q: query })
  if (options?.agent) params.set('agent', options.agent)
  if (options?.maxResults) params.set('max', String(options.maxResults))
  return webFetchJson<OpenclawMemoryHit[]>(`/api/memory/openclaw/search?${params}`)
}

export async function openclawMemoryFilesResult(): Promise<AdapterResult<OpenclawMemoryFilesPayload>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<OpenclawMemoryFilesPayload>('list_openclaw_memory_files'))
  }
  return webFetchJson<OpenclawMemoryFilesPayload>('/api/memory/openclaw/files')
}

export async function reindexOpenclawMemoryResult(): Promise<AdapterResult<OpenclawMemoryReindexPayload>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<OpenclawMemoryReindexPayload>('reindex_openclaw_memory'))
  }
  return webFetchJson<OpenclawMemoryReindexPayload>('/api/memory/openclaw/reindex', {
    method: 'POST',
  })
}

export async function deleteOpenclawMemoryFileResult(relativePath: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<void>('delete_openclaw_memory_file', { relativePath }))
  }
  return webFetchVoid('/api/memory/openclaw/files/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relativePath }),
  })
}

export async function managedMemoryStatusResult(): Promise<AdapterResult<ManagedMemoryStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      runTauriManagedMemoryReadWithBridgeFallback<ManagedMemoryStatusPayload>(
        ['ltm', 'status', '--json'],
        buildManagedMemoryStatusFromBridge,
      ),
    )
  }
  return webFetchJson<ManagedMemoryStatusPayload>('/api/memory/managed/status')
}

export async function managedMemoryBridgeStatusResult(): Promise<AdapterResult<ManagedMemoryBridgeStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<ManagedMemoryBridgeStatusPayload>('get_managed_memory_bridge_status'))
  }
  return webFetchJson<ManagedMemoryBridgeStatusPayload>('/api/memory/managed/bridge/status')
}

export async function syncManagedMemoryBridgeResult(): Promise<AdapterResult<ManagedMemoryBridgeStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<ManagedMemoryBridgeStatusPayload>('sync_managed_memory_bridge'))
  }
  return webFetchJson<ManagedMemoryBridgeStatusPayload>('/api/memory/managed/bridge/sync', {
    method: 'POST',
    headers: createDangerousActionHeaders(),
  })
}

export async function managedMemoryStatsResult(): Promise<AdapterResult<ManagedMemoryStatsPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      runTauriManagedMemoryReadWithBridgeFallback<ManagedMemoryStatsPayload>(
        ['ltm', 'stats', '--json'],
        buildManagedMemoryStatsFromBridge,
      ),
    )
  }
  return webFetchJson<ManagedMemoryStatsPayload>('/api/memory/managed/stats')
}

export async function managedMemoryImportStatusResult(): Promise<AdapterResult<ManagedMemoryImportStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      runTauriManagedMemoryReadWithBridgeFallback<ManagedMemoryImportStatusPayload>(
        ['ltm', 'import-status', '--json'],
        buildManagedMemoryImportStatusFromBridge,
      ),
    )
  }
  return webFetchJson<ManagedMemoryImportStatusPayload>('/api/memory/managed/import/status')
}

export async function importOpenclawManagedMemoryResult(): Promise<AdapterResult<ManagedMemoryImportStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      runTauriManagedMemoryCommand<ManagedMemoryImportStatusPayload>(['ltm', 'import', '--json']),
    )
  }
  return webFetchJson<ManagedMemoryImportStatusPayload>('/api/memory/managed/import/openclaw', {
    method: 'POST',
  })
}

export async function managedMemoryListResult(options?: {
  userId?: string
  agentId?: string
  limit?: number
  offset?: number
}): Promise<AdapterResult<ManagedMemoryListPayload>> {
  if (getIsTauri()) {
    const args = ['ltm', 'list', '--json']
    if (options?.limit) args.push('--limit', String(options.limit))
    if (options?.offset) args.push('--offset', String(options.offset))
    if (options?.userId) args.push('--user', options.userId)
    if (options?.agentId) args.push('--agent', options.agentId)
    return fromPromise(() =>
      runTauriManagedMemoryReadWithBridgeFallback<ManagedMemoryListPayload>(args, () => ({
        memories: [],
        total: 0,
        limit: options?.limit ?? 20,
        offset: options?.offset ?? 0,
      })),
    )
  }
  const params = new URLSearchParams()
  if (options?.userId) params.set('userId', options.userId)
  if (options?.agentId) params.set('agentId', options.agentId)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))
  const suffix = params.size > 0 ? `?${params}` : ''
  return webFetchJson<ManagedMemoryListPayload>(`/api/memory/managed/list${suffix}`)
}

export async function managedMemorySearchResult(
  query: string,
  options?: {
    userId?: string
    agentId?: string
    limit?: number
  },
): Promise<AdapterResult<ManagedMemorySearchHit[]>> {
  const trimmed = query.trim()
  if (!trimmed) return ok([])
  if (getIsTauri()) {
    const args = ['ltm', 'search', '--json', '--query', trimmed]
    if (options?.limit) args.push('--limit', String(options.limit))
    if (options?.userId) args.push('--user', options.userId)
    if (options?.agentId) args.push('--agent', options.agentId)
    return fromPromise(async () => {
      try {
        return await runTauriManagedMemoryCommand<ManagedMemorySearchHit[]>(args)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!isMissingManagedMemoryCommand(message)) {
          throw error
        }
        const bridge = await getTauriManagedMemoryBridgeStatus()
        if (bridge.state === 'ready') {
          throw error
        }
        return []
      }
    })
  }
  return webFetchJson<ManagedMemorySearchHit[]>('/api/memory/managed/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: trimmed,
      userId: options?.userId,
      agentId: options?.agentId,
      limit: options?.limit,
    }),
  })
}

export async function addManagedMemoryResult(input: {
  content: string
  userId?: string
  agentId?: string
  metadata?: Record<string, unknown>
}): Promise<AdapterResult<ManagedMemoryRecord>> {
  if (getIsTauri()) {
    const args = ['ltm', 'add', '--json']
    if (input.userId) args.push('--user', input.userId)
    if (input.agentId) args.push('--agent', input.agentId)
    args.push('--', input.content)
    return fromPromise(() => runTauriManagedMemoryCommand<ManagedMemoryRecord>(args))
  }
  return webFetchJson<ManagedMemoryRecord>('/api/memory/managed/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function deleteManagedMemoryResult(memoryId: string): Promise<AdapterResult<{ deleted: boolean }>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      runTauriManagedMemoryCommand<{ deleted: boolean }>(['ltm', 'delete', '--json', memoryId]),
    )
  }
  return webFetchJson<{ deleted: boolean }>('/api/memory/managed/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memoryId }),
  })
}

export async function resetManagedMemoryResult(): Promise<AdapterResult<ManagedMemoryStatsPayload>> {
  if (getIsTauri()) {
    return fromPromise(() => runTauriManagedMemoryCommand<ManagedMemoryStatsPayload>(['ltm', 'reset', '--json']))
  }
  return webFetchJson<ManagedMemoryStatsPayload>('/api/memory/managed/reset', {
    method: 'POST',
    headers: createDangerousActionHeaders(),
  })
}
