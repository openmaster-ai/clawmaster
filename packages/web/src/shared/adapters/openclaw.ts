import type {
  AgentConfig,
  AgentInfo,
  ChannelVerifyResult,
  ChannelConfig,
  ChannelInfo,
  ModelInfo,
  OpenClawBinding,
  OpenClawChannelEntry,
  OpenClawConfig,
  OpenClawModelRef,
} from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'
import { unwrapDoubleNestedModelsInRoot } from '@/shared/unwrapDoubleNestedModels'
import {
  assertSafeProviderCatalogBaseUrl,
  buildProviderCatalogRequest,
  normalizeProviderCatalogResponse,
  type ProviderCatalogModel,
} from '@/shared/providerCatalog'
import i18n from '@/i18n'

export async function getConfigResult(): Promise<AdapterResult<OpenClawConfig>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      // Rust OpenClawConfig uses serde(flatten); invoke returns flattened JSON.
      return tauriInvoke<OpenClawConfig>('get_config')
    })
  }
  return webFetchJson<OpenClawConfig>('/api/config')
}

/** Replace entire config file (same as PUT /api/config and Tauri save_config). */
export async function saveFullConfigResult(config: OpenClawConfig): Promise<AdapterResult<void>> {
  const out = unwrapDoubleNestedModelsInRoot(config as Record<string, unknown>) as OpenClawConfig
  if (getIsTauri()) {
    return fromPromise(async () => {
      await tauriInvoke('save_config', { config: out })
    })
  }
  return webFetchVoid('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(out),
  })
}

export async function setConfigResult(path: string, value: unknown): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const updated = { ...current }
      const keys = path.split('.')
      let obj: Record<string, unknown> = updated as Record<string, unknown>
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        const next = obj[k]
        const nested =
          next && typeof next === 'object' && !Array.isArray(next)
            ? (next as Record<string, unknown>)
            : {}
        obj[k] = nested
        obj = nested
      }
      obj[keys[keys.length - 1]] = value as unknown
      await tauriInvoke('save_config', { config: updated })
    })
  }
  return webFetchVoid(`/api/config/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

export async function resolvePluginRootResult(input: {
  pluginId: string
  candidates?: string[]
}): Promise<AdapterResult<string | null>> {
  const pluginId = input.pluginId.trim()
  if (!pluginId) return fail(i18n.t('adapters.missingProviderId'))
  if (!/^[a-zA-Z0-9._-]+$/.test(pluginId)) return fail(i18n.t('adapters.invalidProviderId'))
  const candidates = (input.candidates ?? []).filter((candidate) => typeof candidate === 'string' && candidate.trim())

  if (getIsTauri()) {
    return fromPromise(async () => {
      return tauriInvoke<string | null>('resolve_plugin_root', {
        pluginId,
        candidates,
      })
    })
  }

  const result = await webFetchJson<{ path: string | null }>('/api/config/resolve-plugin-root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pluginId, candidates }),
  })
  if (!result.success) return fail(result.error ?? i18n.t('common.requestFailed'))
  return ok(result.data?.path ?? null)
}

export function channelsFromConfig(config: OpenClawConfig): ChannelInfo[] {
  const channels = config.channels || {}
  return Object.entries(channels).map(([id, ch]) => ({
    id,
    name: id,
    type: id,
    enabled: ch.enabled !== false,
    connected: ch.enabled !== false,
  }))
}

function modelEntryLabel(entry: string | OpenClawModelRef): string {
  if (typeof entry === 'string') return entry
  return entry.name || entry.id || 'model'
}

export function modelsFromConfig(config: OpenClawConfig): ModelInfo[] {
  const providers = config.models?.providers || {}
  const models: ModelInfo[] = []
  for (const [provider, cfg] of Object.entries(providers)) {
    if (!cfg.models?.length) continue
    for (const model of cfg.models) {
      const label = modelEntryLabel(model)
      models.push({
        id: `${provider}/${label}`,
        name: label,
        provider,
        enabled: true,
      })
    }
  }
  return models
}

export function agentsFromConfig(config: OpenClawConfig): AgentInfo[] {
  const agents = config.agents?.list || []
  return agents.map((a) => ({
    id: a.id,
    name: a.name || a.id,
    model: a.model || config.agents?.defaults?.model?.primary || 'unknown',
    workspace: a.workspace || a.agentDir || config.agents?.defaults?.workspace || 'unknown',
  }))
}

export async function getChannelsResult(): Promise<AdapterResult<ChannelInfo[]>> {
  const c = await getConfigResult()
  if (!c.success || c.data === undefined) return fail(c.error ?? i18n.t('adapters.configLoadFailed'))
  return ok(channelsFromConfig(c.data))
}

export async function getModelsResult(): Promise<AdapterResult<ModelInfo[]>> {
  if (getIsTauri()) {
    const c = await getConfigResult()
    if (!c.success || c.data === undefined) return fail(c.error ?? i18n.t('adapters.configLoadFailed'))
    return ok(modelsFromConfig(c.data))
  }
  return webFetchJson<ModelInfo[]>('/api/models')
}

function parseCurlStatusOutput(raw: string) {
  const marker = '\n__CLAWMASTER_STATUS__:'
  const index = raw.lastIndexOf(marker)
  if (index === -1) {
    return { body: raw, status: 0 }
  }

  const body = raw.slice(0, index)
  const statusText = raw.slice(index + marker.length).trim()
  const status = Number.parseInt(statusText, 10)
  return {
    body,
    status: Number.isFinite(status) ? status : 0,
  }
}

export async function getProviderModelCatalogResult(input: {
  providerId: string
  apiKey?: string
  baseUrl?: string
}): Promise<AdapterResult<ProviderCatalogModel[]>> {
  const providerId = input.providerId.trim()
  if (!providerId) return fail(i18n.t('adapters.missingProviderId'))
  if (!/^[a-zA-Z0-9._-]+$/.test(providerId)) return fail(i18n.t('adapters.invalidProviderId'))
  try {
    assertSafeProviderCatalogBaseUrl(providerId, input.baseUrl)
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const request = buildProviderCatalogRequest(input)
  if (!request) return ok([])

  if (getIsTauri()) {
    return fromPromise(async () => {
      const raw = await tauriInvoke<string>('fetch_provider_catalog', {
        url: request.url,
        headers: request.headers,
      })
      const { body, status } = parseCurlStatusOutput(raw)
      if (status < 200 || status >= 300) {
        throw new Error(`Provider catalog request failed (${status || 'unknown'})`)
      }

      const payload = JSON.parse(body) as unknown
      return normalizeProviderCatalogResponse(providerId, payload)
    })
  }

  return webFetchJson<ProviderCatalogModel[]>('/api/models/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function getAgentsResult(): Promise<AdapterResult<AgentInfo[]>> {
  if (getIsTauri()) {
    const c = await getConfigResult()
    if (!c.success || c.data === undefined) return fail(c.error ?? i18n.t('adapters.configLoadFailed'))
    return ok(agentsFromConfig(c.data))
  }
  return webFetchJson<AgentInfo[]>('/api/agents')
}

export type ModelProbeResult = {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Live probe for one model provider via local `openclaw models status --json --probe --probe-provider <id>`.
 * May perform real API calls (tokens / rate limits). Desktop uses the same login-shell-resolved `openclaw` as other commands.
 */
export async function testModelProviderResult(
  providerId: string
): Promise<AdapterResult<ModelProbeResult>> {
  const id = providerId.trim()
  if (!id) return fail(i18n.t('adapters.missingProviderId'))
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) return fail(i18n.t('adapters.invalidProviderId'))

  if (getIsTauri()) {
    return fromPromise(async () => {
      const out = await tauriInvoke<{ code: number; stdout: string; stderr: string }>(
        'run_openclaw_command_captured',
        {
          args: ['models', 'status', '--json', '--probe', '--probe-provider', id],
        }
      )
      return {
        exitCode: out.code,
        stdout: out.stdout.trimEnd(),
        stderr: out.stderr.trimEnd(),
      }
    })
  }

  return webFetchJson<ModelProbeResult>('/api/models/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: id }),
  })
}

export async function setDefaultModelResult(modelId: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const config = { ...current }
      config.agents = config.agents || {}
      config.agents.defaults = config.agents.defaults || {}
      config.agents.defaults.model = { primary: modelId }
      await tauriInvoke('save_config', { config })
    })
  }
  return webFetchVoid('/api/models/default', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId }),
  })
}

export async function addChannelResult(channel: ChannelConfig): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const config = { ...current }
      config.channels = config.channels || {}
      config.channels[channel.type] = {
        enabled: true,
        ...channel.config,
      } as OpenClawChannelEntry
      await tauriInvoke('save_config', { config })
    })
  }
  return webFetchVoid('/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(channel),
  })
}

export async function removeChannelResult(id: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const config = { ...current }
      if (config.channels && config.channels[id]) {
        delete config.channels[id]
        await tauriInvoke('save_config', { config })
      }
    })
  }
  return webFetchVoid(`/api/channels/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createAgentResult(agent: AgentConfig): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const config = { ...current }
      config.agents = config.agents || {}
      config.agents.list = config.agents.list || []
      config.agents.list.push({
        id: agent.id,
        name: agent.name,
        model: agent.model,
      })
      await tauriInvoke('save_config', { config })
    })
  }
  return webFetchVoid('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  })
}

export async function deleteAgentResult(id: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const config = { ...current }
      if (config.agents?.list) {
        config.agents.list = config.agents.list.filter((a) => a.id !== id)
        await tauriInvoke('save_config', { config })
      }
    })
  }
  return webFetchVoid(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function verifyChannelAccountResult(
  type: string,
  account: Record<string, unknown>
): Promise<AdapterResult<ChannelVerifyResult>> {
  if (getIsTauri()) {
    return fromPromise(async () => ({ ok: false, message: i18n.t('adapters.tauriVerifyUnsupported') }))
  }
  return webFetchJson<ChannelVerifyResult>(`/api/channels/${encodeURIComponent(type)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  })
}

export async function getBindingsResult(): Promise<AdapterResult<OpenClawBinding[]>> {
  if (getIsTauri()) {
    const cfg = await getConfigResult()
    if (!cfg.success || !cfg.data) return fail(cfg.error ?? i18n.t('adapters.bindingsConfigFailed'))
    return ok(cfg.data.bindings ?? [])
  }
  return webFetchJson<OpenClawBinding[]>('/api/bindings')
}

export async function upsertBindingResult(channel: string, agentId: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const list = Array.isArray(current.bindings) ? [...current.bindings] : []
      const next = list.filter((b) => b?.match?.channel !== channel)
      next.push({ match: { channel }, agentId })
      await tauriInvoke('save_config', { config: { ...current, bindings: next } })
    })
  }
  return webFetchVoid('/api/bindings/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, agentId }),
  })
}

export async function deleteBindingResult(channel: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<OpenClawConfig>('get_config')
      const list = Array.isArray(current.bindings) ? current.bindings.filter((b) => b?.match?.channel !== channel) : []
      await tauriInvoke('save_config', { config: { ...current, bindings: list } })
    })
  }
  return webFetchVoid(`/api/bindings?channel=${encodeURIComponent(channel)}`, { method: 'DELETE' })
}
