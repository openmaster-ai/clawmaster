/**
 * Keep derivation logic aligned with packages/web/src/shared/adapters/openclaw.ts
 */

export interface ChannelInfoRow {
  id: string
  name: string
  type: string
  enabled: boolean
  connected: boolean
}

export interface ModelInfoRow {
  id: string
  name: string
  provider: string
  enabled: boolean
}

export interface AgentInfoRow {
  id: string
  name: string
  model: string
  workspace: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function channelsFromConfig(config: Record<string, unknown>): ChannelInfoRow[] {
  const channels = config.channels
  if (!isRecord(channels)) return []
  return Object.entries(channels).map(([id, ch]) => {
    const row = isRecord(ch) ? ch : {}
    const enabled = row.enabled !== false
    return {
      id,
      name: id,
      type: id,
      enabled,
      connected: enabled,
    }
  })
}

function modelEntryLabel(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (isRecord(entry)) {
    const name = entry.name
    const id = entry.id
    if (typeof name === 'string') return name
    if (typeof id === 'string') return id
  }
  return 'model'
}

export function modelsFromConfig(config: Record<string, unknown>): ModelInfoRow[] {
  const modelsRoot = config.models
  if (!isRecord(modelsRoot)) return []
  const providers = modelsRoot.providers
  if (!isRecord(providers)) return []
  const out: ModelInfoRow[] = []
  for (const [provider, cfg] of Object.entries(providers)) {
    if (!isRecord(cfg)) continue
    const list = cfg.models
    if (!Array.isArray(list)) continue
    for (const model of list) {
      const label = modelEntryLabel(model)
      out.push({
        id: `${provider}/${label}`,
        name: label,
        provider,
        enabled: true,
      })
    }
  }
  return out
}

export function agentsFromConfig(config: Record<string, unknown>): AgentInfoRow[] {
  const agents = config.agents
  if (!isRecord(agents)) return []
  const list = agents.list
  if (!Array.isArray(list)) return []
  const defaults = isRecord(agents.defaults) ? agents.defaults : {}
  const defaultModel = isRecord(defaults.model) ? defaults.model.primary : undefined
  const defaultWs = typeof defaults.workspace === 'string' ? defaults.workspace : undefined

  return list
    .filter(isRecord)
    .map((a) => {
      const id = typeof a.id === 'string' ? a.id : ''
      const name = typeof a.name === 'string' ? a.name : id
      const model =
        typeof a.model === 'string'
          ? a.model
          : typeof defaultModel === 'string'
            ? defaultModel
            : 'unknown'
      const workspace =
        typeof a.workspace === 'string'
          ? a.workspace
          : typeof a.agentDir === 'string'
            ? a.agentDir
            : defaultWs || 'unknown'
      return { id, name, model, workspace }
    })
    .filter((a) => a.id)
}
