import type { OpenclawPathSettings } from '@/lib/types'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

type OpenclawPathPayload = {
  configPath?: string
  stateDir?: string
}

export async function getOpenclawPathSettingsResult(): Promise<
  AdapterResult<OpenclawPathSettings>
> {
  if (getIsTauri()) {
    return fail('Custom OpenClaw paths are not wired for Tauri in this build yet.')
  }
  return webFetchJson<OpenclawPathSettings>('/api/settings/openclaw-paths')
}

export async function saveOpenclawPathSettingsResult(
  payload: OpenclawPathPayload
): Promise<AdapterResult<OpenclawPathSettings>> {
  if (getIsTauri()) {
    return fail('Custom OpenClaw paths are not wired for Tauri in this build yet.')
  }
  return webFetchJson<OpenclawPathSettings>('/api/settings/openclaw-paths', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function resetOpenclawPathSettingsResult(): Promise<
  AdapterResult<OpenclawPathSettings>
> {
  if (getIsTauri()) {
    return fail('Custom OpenClaw paths are not wired for Tauri in this build yet.')
  }
  return webFetchJson<OpenclawPathSettings>('/api/settings/openclaw-paths', {
    method: 'DELETE',
  })
}
