import type { SkillInfo } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

/** Same order as packages/backend/src/skillsCli.ts SKILL_CLI_ROOTS */
const SKILL_CLI_ROOTS = ['skills', 'clawbot', 'clawhub'] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function mapSkillRow(s: Record<string, unknown>, installed: boolean): SkillInfo {
  const slug = (s.slug as string) || (s.name as string)
  return {
    slug,
    name: (s.name as string) || slug,
    description: (s.description as string) || '',
    version: (s.version as string) || 'unknown',
    installed,
  }
}

function parseSkillsOpenclawJson(raw: string, installed: boolean): SkillInfo[] {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON from openclaw skills')
  }
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : isRecord(data) && Array.isArray(data.skills)
        ? data.skills
        : []
  return rows.filter(isRecord).map((s) => mapSkillRow(s, installed))
}

async function tauriOpenclawSkills(tail: string[]): Promise<string> {
  let last: Error | undefined
  for (const root of SKILL_CLI_ROOTS) {
    try {
      return await tauriInvoke<string>('run_openclaw_command', { args: [root, ...tail] })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      last = e instanceof Error ? e : new Error(msg)
      if (/unknown command/i.test(msg)) continue
      throw last
    }
  }
  throw last ?? new Error('openclaw: no matching skills CLI (tried skills, clawbot, clawhub)')
}

async function tauriOpenclawSkillsVoid(tail: string[]): Promise<void> {
  let last: Error | undefined
  for (const root of SKILL_CLI_ROOTS) {
    try {
      await tauriInvoke('run_openclaw_command', { args: [root, ...tail] })
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      last = e instanceof Error ? e : new Error(msg)
      if (/unknown command/i.test(msg)) continue
      throw last
    }
  }
  throw last ?? new Error('openclaw: no matching skills CLI (tried skills, clawbot, clawhub)')
}

export async function getSkillsResult(): Promise<AdapterResult<SkillInfo[]>> {
  if (getIsTauri()) {
    const parsed = await fromPromise(async () => {
      const result = await tauriOpenclawSkills(['list', '--json'])
      return parseSkillsOpenclawJson(result, true)
    })
    return parsed
  }
  return webFetchJson<SkillInfo[]>('/api/skills')
}

export async function searchSkillsResult(query: string): Promise<AdapterResult<SkillInfo[]>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const result = await tauriOpenclawSkills(['search', query, '--json'])
      return parseSkillsOpenclawJson(result, false)
    })
  }
  return webFetchJson<SkillInfo[]>(`/api/skills/search?q=${encodeURIComponent(query)}`)
}

export async function installSkillResult(slug: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriOpenclawSkillsVoid(['install', slug]))
  }
  const res = await fetch('/api/skills/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return fail(text ? `HTTP ${res.status}: ${text.slice(0, 240)}` : `HTTP ${res.status}`)
  }
  return ok(undefined)
}

async function tauriOpenclawSkillsUninstall(slug: string): Promise<void> {
  try {
    await tauriOpenclawSkillsVoid(['uninstall', slug])
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first)
    if (!/unknown command/i.test(msg)) throw first
    await tauriOpenclawSkillsVoid(['remove', slug])
  }
}

export async function uninstallSkillResult(slug: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriOpenclawSkillsUninstall(slug))
  }
  const res = await fetch('/api/skills/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return fail(text ? `HTTP ${res.status}: ${text.slice(0, 240)}` : `HTTP ${res.status}`)
  }
  return ok(undefined)
}
