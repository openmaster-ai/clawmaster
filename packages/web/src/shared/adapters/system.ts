import type { SystemInfo } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

export async function detectSystemResult(): Promise<AdapterResult<SystemInfo>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<SystemInfo>('detect_system'))
  }
  return webFetchJson<SystemInfo>('/api/system/detect')
}
