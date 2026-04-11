import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import {
  execWslCommand,
  requireSelectedWslDistroSync,
  runWslShellSync,
  shellEscapePosixArg,
  shouldUseWslRuntime,
} from '../wslRuntime.js'

const execFileAsync = promisify(execFile)

const SKILL_CLI_ROOTS = [
  '.openclaw/skills',
  '.openclaw/workspace/skills',
  '.agents/skills',
  '.codex/skills',
  '.config/openclaw/skills',
] as const

export interface SkillGuardScanRequest {
  skillKey?: string
  name?: string
  slug?: string
}

function trailingSlugToken(value: string | undefined): string {
  const parts = String(value || '').split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

function firstCommandPath(whereOutput: string): string | null {
  return String(whereOutput)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null
}

export function resolveHostCommandPathForTest(command: string, options: {
  platform?: string
  whereOutput?: string | null
} = {}): string {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return command
  }
  return firstCommandPath(options.whereOutput ?? '') ?? command
}

export function getHostCommandExecOptionsForTest(options: {
  platform?: string
} = {}): {
  shell: boolean
  windowsHide: boolean
} {
  const platform = options.platform ?? process.platform
  return {
    shell: platform === 'win32',
    windowsHide: true,
  }
}

function resolveHostCommandPath(command: string): string {
  if (process.platform !== 'win32') {
    return command
  }
  try {
    const output = execFileSync('where', [command], {
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
    })
    return resolveHostCommandPathForTest(command, {
      platform: process.platform,
      whereOutput: output,
    })
  } catch {
    return command
  }
}

function uniqueTokens(values: Array<string | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const token = String(value || '').trim()
    if (!token) continue
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(token)
  }
  return out
}

export function buildWslSkillCandidateArrayForTest(candidates: string[]): string {
  return candidates.map((token) => shellEscapePosixArg(token)).join(' ')
}

function resolveSkillDirHost(payload: SkillGuardScanRequest): string | null {
  const roots = SKILL_CLI_ROOTS.map((relativePath) => path.join(os.homedir(), relativePath))
  const candidates = uniqueTokens([
    payload.skillKey,
    payload.name,
    payload.slug,
    trailingSlugToken(payload.slug),
  ])

  for (const root of roots) {
    if (!fs.existsSync(root)) continue

    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    } catch {
      continue
    }

    for (const token of candidates) {
      const direct = path.join(root, token)
      if (fs.existsSync(path.join(direct, 'SKILL.md'))) {
        return direct
      }

      const matched = entries.find((entry) => entry.name.toLowerCase() === token.toLowerCase())
      if (!matched) continue
      const matchedDir = path.join(root, matched.name)
      if (fs.existsSync(path.join(matchedDir, 'SKILL.md'))) {
        return matchedDir
      }
    }
  }

  return null
}

function resolveSkillDirWsl(payload: SkillGuardScanRequest): string | null {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (!shouldUseWslRuntime(runtimeSelection)) {
    return null
  }
  const distro = requireSelectedWslDistroSync(runtimeSelection)
  const candidates = uniqueTokens([
    payload.skillKey,
    payload.name,
    payload.slug,
    trailingSlugToken(payload.slug),
  ])
  const script = `
set -eu
candidates=(${buildWslSkillCandidateArrayForTest(candidates)})
roots=(
  "$HOME/.openclaw/skills"
  "$HOME/.openclaw/workspace/skills"
  "$HOME/.agents/skills"
  "$HOME/.codex/skills"
  "$HOME/.config/openclaw/skills"
)
lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}
for root in "\${roots[@]}"; do
  [ -d "$root" ] || continue
  for token in "\${candidates[@]}"; do
    [ -n "$token" ] || continue
    if [ -f "$root/$token/SKILL.md" ]; then
      printf '%s' "$root/$token"
      exit 0
    fi
    for entry in "$root"/*; do
      [ -d "$entry" ] || continue
      name="$(basename "$entry")"
      if [ "$(lower "$name")" = "$(lower "$token")" ] && [ -f "$entry/SKILL.md" ]; then
        printf '%s' "$entry"
        exit 0
      fi
    done
  done
done
exit 1
  `.trim()
  const out = runWslShellSync(distro, script)
  if (out.code !== 0) {
    return null
  }
  const resolved = out.stdout.trim()
  return resolved || null
}

function firstJsonPayloadCandidate(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const starts = [trimmed.indexOf('{'), trimmed.indexOf('[')]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)
  for (const start of starts) {
    const candidate = trimmed.slice(start)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // keep scanning
    }
  }
  return null
}

function mapFinding(finding: Record<string, unknown>) {
  return {
    dimension: String(finding.dimension || ''),
    severity: String(finding.severity || 'INFO'),
    filePath: String(finding.file_path || ''),
    lineNumber: typeof finding.line_number === 'number' ? finding.line_number : null,
    pattern: typeof finding.pattern === 'string' ? finding.pattern : undefined,
    description: String(finding.description || ''),
    reference: typeof finding.reference === 'string' ? finding.reference : undefined,
    remediationEn: typeof finding.remediation_en === 'string' ? finding.remediation_en : undefined,
    remediationZh: typeof finding.remediation_zh === 'string' ? finding.remediation_zh : undefined,
  }
}

function mapReport(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const report = raw as Record<string, unknown>
  const findings = Array.isArray(report.findings)
    ? report.findings
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
        .map(mapFinding)
    : []
  const tokenEstimate = report.token_estimate && typeof report.token_estimate === 'object' && !Array.isArray(report.token_estimate)
    ? report.token_estimate as Record<string, unknown>
    : {}
  return {
    skillName: String(report.skill_name || ''),
    skillPath: String(report.skill_path || ''),
    riskScore: typeof report.risk_score === 'number' ? report.risk_score : 0,
    riskLevel: String(report.risk_level || 'A'),
    findings,
    tokenEstimate: {
      l1SkillMd: Number(tokenEstimate.l1_skill_md || 0),
      l2Eager: Number(tokenEstimate.l2_eager || 0),
      l2Lazy: Number(tokenEstimate.l2_lazy || 0),
      l3Total: Number(tokenEstimate.l3_total || 0),
    },
  }
}

function normalizeSkillGuardResult(rawOutput: string, fallbackTarget: string) {
  const payload = firstJsonPayloadCandidate(rawOutput)
  if (!payload) {
    throw new Error('Invalid SkillGuard JSON')
  }
  const parsed = JSON.parse(payload) as Record<string, unknown>
  const reports = Array.isArray(parsed.reports) ? parsed.reports : []
  const report = mapReport(reports[0])
  const findings = Array.isArray(report?.findings) ? report.findings : []
  const severityCounts: Record<string, number> = {}
  for (const finding of findings) {
    const level = String(finding.severity || 'INFO').toUpperCase()
    severityCounts[level] = (severityCounts[level] || 0) + 1
  }

  const summary = parsed.summary && typeof parsed.summary === 'object' && !Array.isArray(parsed.summary)
    ? parsed.summary as Record<string, unknown>
    : {}
  const auditMetadata = parsed.audit_metadata && typeof parsed.audit_metadata === 'object' && !Array.isArray(parsed.audit_metadata)
    ? parsed.audit_metadata as Record<string, unknown>
    : {}

  return {
    auditMetadata: {
      toolVersion: String(auditMetadata.tool_version || ''),
      timestamp: String(auditMetadata.timestamp || ''),
      target: String(auditMetadata.target || fallbackTarget),
    },
    summary: {
      totalSkills: Number(summary.total_skills || 0),
      byLevel: summary.by_level && typeof summary.by_level === 'object' && !Array.isArray(summary.by_level)
        ? summary.by_level
        : {},
    },
    report,
    severityCounts,
    totalFindings: findings.length,
  }
}

export async function scanInstalledSkill(payload: SkillGuardScanRequest) {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (!shouldUseWslRuntime(runtimeSelection)) {
    const skillDir = resolveSkillDirHost(payload)
    if (!skillDir) {
      throw new Error(
        `Installed skill directory not found for: ${payload.skillKey || payload.name || payload.slug || 'unknown'}`
      )
    }
    const out = await execFileAsync(resolveHostCommandPath('npm'), [
      'exec',
      '--yes',
      '@clawmaster/skillguard-cli',
      '--',
      skillDir,
      '--json',
    ], {
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
      ...getHostCommandExecOptionsForTest(),
    })
    return normalizeSkillGuardResult(
      `${String(out.stdout ?? '')}\n${String(out.stderr ?? '')}`,
      skillDir,
    )
  }

  const distro = requireSelectedWslDistroSync(runtimeSelection)
  const skillDir = resolveSkillDirWsl(payload)
  if (!skillDir) {
    throw new Error(
      `Installed skill directory not found for: ${payload.skillKey || payload.name || payload.slug || 'unknown'}`
    )
  }
  const out = await execWslCommand(distro, 'npm', [
    'exec',
    '--yes',
    '@clawmaster/skillguard-cli',
    '--',
    skillDir,
    '--json',
  ])
  if (out.code !== 0) {
    throw new Error(out.stderr.trim() || out.stdout.trim() || `skillguard exited with code ${out.code}`)
  }
  return normalizeSkillGuardResult(`${out.stdout}\n${out.stderr}`, skillDir)
}
