import { readConfigJsonOrEmpty, updateConfigJson } from '../configJson.js'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export type BindingRow = {
  match?: { channel?: string }
  agentId: string
}

export function listBindings(): BindingRow[] {
  const cfg = readConfigJsonOrEmpty()
  if (!Array.isArray(cfg.bindings)) return []
  return cfg.bindings
    .filter(isRecord)
    .map((x) => ({
      match: isRecord(x.match) ? { channel: typeof x.match.channel === 'string' ? x.match.channel : undefined } : undefined,
      agentId: typeof x.agentId === 'string' ? x.agentId : '',
    }))
    .filter((x) => x.agentId)
}

export async function upsertBinding(channel: string, agentId: string): Promise<void> {
  const ch = channel.trim()
  const ag = agentId.trim()
  if (!ch) throw new Error('Missing channel')
  if (!ag) throw new Error('Missing agentId')
  await updateConfigJson((cfg) => {
    const list = Array.isArray(cfg.bindings) ? cfg.bindings.filter(isRecord) : []
    const next: Record<string, unknown>[] = []
    let replaced = false
    for (const item of list) {
      const match = isRecord(item.match) ? item.match : {}
      if (typeof match.channel === 'string' && match.channel === ch) {
        next.push({ match: { channel: ch }, agentId: ag })
        replaced = true
      } else {
        next.push(item)
      }
    }
    if (!replaced) next.push({ match: { channel: ch }, agentId: ag })
    cfg.bindings = next
  })
}

export async function deleteBinding(channel: string): Promise<void> {
  const ch = channel.trim()
  if (!ch) throw new Error('Missing channel')
  await updateConfigJson((cfg) => {
    const list = Array.isArray(cfg.bindings) ? cfg.bindings.filter(isRecord) : []
    cfg.bindings = list.filter((item) => {
      const match = isRecord(item.match) ? item.match : {}
      return match.channel !== ch
    })
  })
}
