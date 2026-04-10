import type { SystemInfo } from '@/lib/types'
import { getIsTauri } from '@/shared/adapters/platform'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail } from '@/shared/adapters/types'
import { webFetchJson } from '@/shared/adapters/webHttp'

export interface LocalDataDocument {
  id: string
  module: string
  sourceType: string
  sourcePath?: string
  title: string
  content: string
  tags?: string[]
  metadata?: Record<string, unknown>
  updatedAt?: string
}

export interface LocalDataSearchResult {
  id: string
  module: string
  sourceType: string
  sourcePath?: string
  title: string
  content: string
  tags: string[]
  metadata: Record<string, unknown>
  updatedAt: string
  score: number
  snippet: string
}

export interface LocalDataStats {
  engine: NonNullable<SystemInfo['storage']>['engine']
  state: NonNullable<SystemInfo['storage']>['state']
  profileKey: string
  dataRoot: string | null
  engineRoot: string | null
  documentCount: number
  moduleCounts: Record<string, number>
  schemaVersion: number
  updatedAt: string | null
}

function desktopStorageUnavailable<T>(): AdapterResult<T> {
  return fail('Local Data actions are available in web/backend mode first. Desktop write actions will use the future Node storage worker.')
}

export async function getLocalDataStatsResult(): Promise<AdapterResult<LocalDataStats>> {
  if (getIsTauri()) return desktopStorageUnavailable()
  return webFetchJson<LocalDataStats>('/api/storage/stats')
}

export async function upsertLocalDataDocumentsResult(
  documents: LocalDataDocument[],
): Promise<AdapterResult<LocalDataStats>> {
  if (getIsTauri()) return desktopStorageUnavailable()
  return webFetchJson<LocalDataStats>('/api/storage/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents }),
  })
}

export async function searchLocalDataResult({
  query,
  module,
  limit,
}: {
  query: string
  module?: string
  limit?: number
}): Promise<AdapterResult<LocalDataSearchResult[]>> {
  if (getIsTauri()) return desktopStorageUnavailable()
  return webFetchJson<LocalDataSearchResult[]>('/api/storage/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, module, limit }),
  })
}

export async function rebuildLocalDataResult(): Promise<AdapterResult<LocalDataStats>> {
  if (getIsTauri()) return desktopStorageUnavailable()
  return webFetchJson<LocalDataStats>('/api/storage/rebuild', { method: 'POST' })
}

export async function resetLocalDataResult(): Promise<AdapterResult<LocalDataStats>> {
  if (getIsTauri()) return desktopStorageUnavailable()
  return webFetchJson<LocalDataStats>('/api/storage/reset', { method: 'POST' })
}
