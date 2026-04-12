import type {
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
import { webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'
import { parseOpenclawMemorySearchJson, type OpenclawMemoryHit } from '@/shared/memoryOpenclawParse'

function parseStdoutJsonLoose(stdout: string): unknown {
  const t = stdout.trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    const m = t.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        /* ignore */
      }
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
