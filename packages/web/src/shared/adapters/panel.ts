/**
 * Panel-level clawpanel.json (stub; CP-01 in architecture).
 * Future: wire to Tauri read_panel_config / write_panel_config or Web API.
 */
import type { AdapterResult } from '@/shared/adapters/types'
import { ok } from '@/shared/adapters/types'

export type PanelConfigJson = {
  openclawDir?: string
  networkProxy?: { url?: string; proxyModelRequests?: boolean }
  nodePath?: string
} & Record<string, unknown>

export async function readPanelConfigResult(): Promise<AdapterResult<PanelConfigJson>> {
  return ok({})
}

export async function writePanelConfigResult(
  _partial: Partial<PanelConfigJson>
): Promise<AdapterResult<void>> {
  return ok(undefined)
}
