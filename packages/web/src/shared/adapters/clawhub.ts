import type { ClawhubCliStatus, SkillGuardScanResult, SkillInfo } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { execCommand, getIsTauri } from '@/shared/adapters/platform'
import { webFetch, webFetchJson } from '@/shared/adapters/webHttp'

/** Same order as packages/backend/src/skillsCli.ts SKILL_CLI_ROOTS */
const SKILL_CLI_ROOTS = ['skills', 'clawbot', 'clawhub'] as const
const SKILLGUARD_SCAN_SCRIPT = String.raw`
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function trailingSlugToken(value) {
  const parts = String(value || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function uniqueTokens(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const token = String(value || '').trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function resolveSkillDir(payload) {
  const roots = [
    path.join(os.homedir(), '.openclaw', 'skills'),
    path.join(os.homedir(), '.openclaw', 'workspace', 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.codex', 'skills'),
    path.join(os.homedir(), '.config', 'openclaw', 'skills'),
  ];
  const candidates = uniqueTokens([
    payload.skillKey,
    payload.name,
    payload.slug,
    trailingSlugToken(payload.slug),
  ]);

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      continue;
    }

    for (const token of candidates) {
      const direct = path.join(root, token);
      if (fs.existsSync(path.join(direct, 'SKILL.md'))) {
        return direct;
      }

      const matched = entries.find((entry) => entry.name.toLowerCase() === token.toLowerCase());
      if (!matched) continue;
      const matchedDir = path.join(root, matched.name);
      if (fs.existsSync(path.join(matchedDir, 'SKILL.md'))) {
        return matchedDir;
      }
    }
  }

  return null;
}

function mapFinding(finding) {
  return {
    dimension: String(finding?.dimension || ''),
    severity: String(finding?.severity || 'INFO'),
    filePath: String(finding?.file_path || ''),
    lineNumber: typeof finding?.line_number === 'number' ? finding.line_number : null,
    pattern: typeof finding?.pattern === 'string' ? finding.pattern : undefined,
    description: String(finding?.description || ''),
    reference: typeof finding?.reference === 'string' ? finding.reference : undefined,
    remediationEn: typeof finding?.remediation_en === 'string' ? finding.remediation_en : undefined,
    remediationZh: typeof finding?.remediation_zh === 'string' ? finding.remediation_zh : undefined,
  };
}

function mapReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const findings = Array.isArray(raw.findings) ? raw.findings.map(mapFinding) : [];
  return {
    skillName: String(raw.skill_name || ''),
    skillPath: String(raw.skill_path || ''),
    riskScore: typeof raw.risk_score === 'number' ? raw.risk_score : 0,
    riskLevel: String(raw.risk_level || 'A'),
    findings,
    tokenEstimate: {
      l1SkillMd: Number(raw.token_estimate?.l1_skill_md || 0),
      l2Eager: Number(raw.token_estimate?.l2_eager || 0),
      l2Lazy: Number(raw.token_estimate?.l2_lazy || 0),
      l3Total: Number(raw.token_estimate?.l3_total || 0),
    },
  };
}

const payload = JSON.parse(process.argv[1] || '{}');
const skillDir = resolveSkillDir(payload);
if (!skillDir) {
  process.stderr.write('Installed skill directory not found for: ' + (payload.skillKey || payload.name || payload.slug || 'unknown') + '\n');
  process.exit(2);
}

const child = spawnSync(
  'npm',
  ['exec', '--yes', '@clawmaster/skillguard-cli', '--', skillDir, '--json'],
  {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  }
);

if (child.status !== 0) {
  process.stderr.write((child.stderr || child.stdout || ('skillguard exited with code ' + (child.status || 1))).trim());
  process.exit(child.status || 1);
}

let parsed;
try {
  parsed = JSON.parse(child.stdout);
} catch (error) {
  process.stderr.write('Invalid SkillGuard JSON: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}

const report = Array.isArray(parsed?.reports) ? mapReport(parsed.reports[0]) : null;
const findings = Array.isArray(report?.findings) ? report.findings : [];
const severityCounts = {};
for (const finding of findings) {
  const level = String(finding.severity || 'INFO').toUpperCase();
  severityCounts[level] = (severityCounts[level] || 0) + 1;
}

process.stdout.write(JSON.stringify({
  auditMetadata: {
    toolVersion: String(parsed?.audit_metadata?.tool_version || ''),
    timestamp: String(parsed?.audit_metadata?.timestamp || ''),
    target: String(parsed?.audit_metadata?.target || skillDir),
  },
  summary: {
    totalSkills: Number(parsed?.summary?.total_skills || 0),
    byLevel: parsed?.summary?.by_level && typeof parsed.summary.by_level === 'object' ? parsed.summary.by_level : {},
  },
  report,
  severityCounts,
  totalFindings: findings.length,
}));
`

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
    bundled: typeof s.bundled === 'boolean' ? s.bundled : undefined,
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
  if (getIsTauri()) {
    return fromPromise(() => tauriOpenclawSkillsVoid(['install', slug]))
  }
  const res = await webFetch('/api/skills/install', {
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
    const payload = JSON.stringify({
      skillKey,
      name: skill.name,
      slug: skill.slug,
    })
    const raw = await execCommand('node', ['-e', SKILLGUARD_SCAN_SCRIPT, payload])
    return JSON.parse(raw) as SkillGuardScanResult
  })
}
