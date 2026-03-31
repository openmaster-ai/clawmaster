import type {
  AgentConfig,
  AgentInfo,
  ChannelConfig,
  ChannelInfo,
  ModelInfo,
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
  if (!c.success || c.data === undefined) return fail(c.error ?? '获取配置失败')
  return ok(channelsFromConfig(c.data))
}

export async function getModelsResult(): Promise<AdapterResult<ModelInfo[]>> {
  if (getIsTauri()) {
    const c = await getConfigResult()
    if (!c.success || c.data === undefined) return fail(c.error ?? '获取配置失败')
    return ok(modelsFromConfig(c.data))
  }
  return webFetchJson<ModelInfo[]>('/api/models')
}

export async function getAgentsResult(): Promise<AdapterResult<AgentInfo[]>> {
  if (getIsTauri()) {
    const c = await getConfigResult()
    if (!c.success || c.data === undefined) return fail(c.error ?? '获取配置失败')
    return ok(agentsFromConfig(c.data))
  }
  return webFetchJson<AgentInfo[]>('/api/agents')
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
