import type { ClawhubCliStatus, SkillGuardScanResult, SkillInfo } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { execCommand, getIsTauri } from '@/shared/adapters/platform'
import { webFetch, webFetchJson } from '@/shared/adapters/webHttp'

/** Same order as packages/backend/src/skillsCli.ts SKILL_CLI_ROOTS */
const SKILL_CLI_ROOTS = ['skills', 'clawbot', 'clawhub'] as const
const BUNDLED_SKILL_SLUGS = new Set([
  'clawprobe-cost-digest',
  'content-draft',
  'ernie-image',
  'models-dev',
  'package-download-tracker',
  'paddleocr-doc-parsing',
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseSkillsPayload(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return []

  try {
    return JSON.parse(trimmed)
  } catch {
    const candidateStarts = [trimmed.indexOf('{'), trimmed.indexOf('[')]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)

    for (const start of candidateStarts) {
      const candidate = trimmed.slice(start)
      try {
        return JSON.parse(candidate)
      } catch {
        // Continue scanning if OpenClaw printed banners or warnings before the JSON payload.
      }
    }
    throw new Error('Invalid JSON from openclaw skills')
  }
}

function mapSkillRow(s: Record<string, unknown>, installed: boolean): SkillInfo {
  const skillKey =
    (typeof s.skillKey === 'string' && s.skillKey) ||
    (typeof s.name === 'string' && s.name) ||
    (typeof s.slug === 'string' && s.slug) ||
    'unknown'
  const slug = (typeof s.slug === 'string' && s.slug) || skillKey
  const normalizedSlug = slug.trim().toLowerCase()
  return {
    slug,
    name: (typeof s.name === 'string' && s.name) || skillKey,
    description: (s.description as string) || '',
    version: (s.version as string) || 'unknown',
    installed,
    skillKey,
    source: typeof s.source === 'string' ? s.source : undefined,
    disabled: typeof s.disabled === 'boolean' ? s.disabled : undefined,
    eligible: typeof s.eligible === 'boolean' ? s.eligible : undefined,
    bundled: typeof s.bundled === 'boolean' ? s.bundled : BUNDLED_SKILL_SLUGS.has(normalizedSlug),
  }
}

function parseSkillsOpenclawJson(raw: string, installed: boolean): SkillInfo[] {
  const data = parseSkillsPayload(raw)
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : isRecord(data) && Array.isArray(data.skills)
        ? data.skills
        : []
  return rows.filter(isRecord).map((s) => mapSkillRow(s, installed))
}

let tauriSkillsCliRootCache: (typeof SKILL_CLI_ROOTS)[number] | null = null

async function tauriPickSkillsRootAndRun<T>(
  fn: (root: (typeof SKILL_CLI_ROOTS)[number]) => Promise<T>
): Promise<T> {
  if (tauriSkillsCliRootCache) {
    try {
      return await fn(tauriSkillsCliRootCache)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/unknown command/i.test(msg)) {
        tauriSkillsCliRootCache = null
      } else {
        throw e instanceof Error ? e : new Error(msg)
      }
    }
  }

  const settled = await Promise.allSettled(SKILL_CLI_ROOTS.map((root) => fn(root)))
  const errors: Error[] = []
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled') {
      tauriSkillsCliRootCache = SKILL_CLI_ROOTS[i]
      return r.value
    }
    errors.push(r.reason instanceof Error ? r.reason : new Error(String(r.reason)))
  }
  const serious = errors.find((e) => !/unknown command/i.test(e.message))
  if (serious) throw serious
  throw (
    errors[errors.length - 1] ??
    new Error('openclaw: no matching skills CLI (tried skills, clawbot, clawhub)')
  )
}

async function tauriOpenclawSkills(tail: string[]): Promise<string> {
  return tauriPickSkillsRootAndRun((root) =>
    tauriInvoke<string>('run_openclaw_command', { args: [root, ...tail] })
  )
}

async function tauriOpenclawSkillsVoid(tail: string[]): Promise<void> {
  await tauriPickSkillsRootAndRun(async (root) => {
    await tauriInvoke('run_openclaw_command', { args: [root, ...tail] })
  })
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
  const normalizedSlug = slug.trim()
  if (!normalizedSlug) return fail('Missing slug')

  if (getIsTauri()) {
    return fromPromise(async () => {
      if (BUNDLED_SKILL_SLUGS.has(normalizedSlug.toLowerCase())) {
        await tauriInvoke('install_bundled_skill', { skillId: normalizedSlug })
        return
      }
      await tauriOpenclawSkillsVoid(['install', normalizedSlug])
    })
  }
  const res = await webFetch('/api/skills/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: normalizedSlug }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return fail(text ? `HTTP ${res.status}: ${text.slice(0, 240)}` : `HTTP ${res.status}`)
  }
  return ok(undefined)
}

export async function setSkillEnabledResult(
  skillKey: string,
  enabled: boolean
): Promise<AdapterResult<void>> {
  const key = skillKey.trim()
  if (!key) return fail('Missing skill key')
  if (getIsTauri()) {
    return fromPromise(async () => {
      const current = await tauriInvoke<Record<string, unknown>>('get_config')
      const updated = { ...current }
      const root = updated as Record<string, unknown>
      const skills = isRecord(root.skills) ? { ...root.skills } : {}
      const entries = isRecord(skills.entries) ? { ...skills.entries } : {}
      const entry = isRecord(entries[key]) ? { ...entries[key] } : {}
      entry.enabled = enabled
      entries[key] = entry
      skills.entries = entries
      root.skills = skills
      await tauriInvoke('save_config', { config: updated })
    })
  }
  const res = await webFetch(`/api/config/${encodeURIComponent(`skills.entries.${key}.enabled`)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: enabled }),
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
  const res = await webFetch('/api/skills/uninstall', {
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

function parseClawhubCliVersion(raw: string): string {
  const trimmed = raw.trim()
  const tagged = trimmed.match(/ClawHub CLI v([^\s)]+)/i)
  if (tagged) return tagged[1]
  const generic = trimmed.match(/v?(\d+\.\d+\.\d+[\w.-]*)/)
  return generic?.[1] ?? trimmed
}

export async function getClawhubCliStatusResult(): Promise<AdapterResult<ClawhubCliStatus>> {
  return fromPromise(async () => {
    try {
      const raw = await execCommand('clawhub', ['--cli-version'])
      return {
        installed: true,
        version: parseClawhubCliVersion(raw),
        packageName: 'clawhub',
      }
    } catch {
      return {
        installed: false,
        version: '',
        packageName: 'clawhub',
      }
    }
  })
}

export async function installClawhubCliResult(): Promise<AdapterResult<ClawhubCliStatus>> {
  return fromPromise(async () => {
    await execCommand('npm', ['install', '-g', 'clawhub'])
    const raw = await execCommand('clawhub', ['--cli-version'])
    return {
      installed: true,
      version: parseClawhubCliVersion(raw),
      packageName: 'clawhub',
    }
  })
}

export async function scanInstalledSkillResult(skill: SkillInfo): Promise<AdapterResult<SkillGuardScanResult>> {
  const skillKey = skill.skillKey?.trim() || skill.name.trim() || skill.slug.trim()
  if (!skillKey) return fail('Missing skill key')

  if (!getIsTauri()) {
    return webFetchJson<SkillGuardScanResult>('/api/skills/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillKey,
        name: skill.name,
        slug: skill.slug,
      }),
    })
  }

  return fromPromise(async () => {
    return tauriInvoke<SkillGuardScanResult>('scan_installed_skill', {
      skillKey,
      name: skill.name,
      slug: skill.slug,
    })
  })
}
