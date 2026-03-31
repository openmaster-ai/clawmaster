import type { PluginsListPayload } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'
import {
  parsePluginsJsonString,
  parsePluginsPlainText,
} from '@/shared/openclawPluginsParse'

async function listPluginsTauri(): Promise<PluginsListPayload> {
  try {
    const out = await tauriInvoke<string>('run_openclaw_command', {
      args: ['plugins', 'list', '--json'],
    })
    const rows = parsePluginsJsonString(out)
    if (rows.length > 0) return { plugins: rows, rawCliOutput: null }
  } catch {
    /* Retry as plain text */
  }
  const out = await tauriInvoke<string>('run_openclaw_command', {
    args: ['plugins', 'list'],
  })
  const rows = parsePluginsPlainText(out)
  return {
    plugins: rows,
    rawCliOutput: rows.length === 0 ? out : null,
  }
}

export async function listPluginsResult(): Promise<AdapterResult<PluginsListPayload>> {
  if (getIsTauri()) {
    return fromPromise(async () => listPluginsTauri())
  }
  return webFetchJson<PluginsListPayload>('/api/plugins')
}

export async function setPluginEnabledResult(
  id: string,
  enabled: boolean
): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const sub = enabled ? 'enable' : 'disable'
      await tauriInvoke<string>('run_openclaw_command', {
        args: ['plugins', sub, id.trim()],
      })
    })
  }
  return webFetchVoid('/api/plugins/set-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id.trim(), enabled }),
  })
}

export async function installPluginResult(id: string): Promise<AdapterResult<void>> {
  const pluginId = id.trim()
  if (getIsTauri()) {
    return fromPromise(async () => {
      await tauriInvoke<string>('run_openclaw_command', {
        args: ['plugins', 'install', pluginId],
      })
    })
  }
  return webFetchVoid('/api/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: pluginId }),
  })
}
