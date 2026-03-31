/**
 * Mirror / reachability probe (stub; matches shared/adapters/mirror.ts in architecture docs).
 * Future: npm registry probe, ClawHub mirror latency, etc.
 */
import type { AdapterResult } from '@/shared/adapters/types'
import { ok } from '@/shared/adapters/types'

export interface MirrorProbeResult {
  reachable: boolean
  latencyMs?: number
  detail?: string
}

export async function probeMirrorResult(
  _targetUrl?: string
): Promise<AdapterResult<MirrorProbeResult>> {
  return ok({ reachable: true, detail: 'not implemented' })
}
