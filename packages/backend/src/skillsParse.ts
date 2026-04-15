import fs from 'fs'
import os from 'os'
import path from 'path'
import { isRecord } from './serverUtils.js'

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
        // Keep scanning in case the CLI printed warnings before the JSON payload.
      }
    }
    throw new Error('Invalid JSON from openclaw skills')
  }
}

type SkillRow = {
  slug: string
  name: string
  description: string
  version: string
  installed: boolean
  skillKey: string
  source?: string
  disabled?: boolean
  eligible?: boolean
  bundled?: boolean
}

type WorkspaceSkillMeta = {
  dirName: string
  registrySlug?: string
  version?: string
  bundled?: boolean
  aliases: Set<string>
}

const BUNDLED_SKILL_SLUGS = new Set(['ernie-image'])

function normalizeSkillToken(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function readFrontmatterName(skillDir: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    const frontmatter = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return undefined
    const nameLine = frontmatter[1].match(/^name:\s*(.+)$/m)
    if (!nameLine) return undefined
    return nameLine[1].trim().replace(/^['"]|['"]$/g, '')
  } catch {
    return undefined
  }
}

function readWorkspaceSkillMetas(): WorkspaceSkillMeta[] {
  const root = path.join(os.homedir(), '.openclaw', 'workspace', 'skills')
  if (!fs.existsSync(root)) return []

  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skillDir = path.join(root, entry.name)
        const aliases = new Set<string>()
        aliases.add(normalizeSkillToken(entry.name))

        const declaredName = readFrontmatterName(skillDir)
        if (declaredName) aliases.add(normalizeSkillToken(declaredName))

        let registrySlug: string | undefined
        let version: string | undefined
        let bundled = false

        try {
          const meta = JSON.parse(fs.readFileSync(path.join(skillDir, '_meta.json'), 'utf8')) as Record<string, unknown>
          if (typeof meta.slug === 'string' && meta.slug.trim()) {
            registrySlug = meta.slug.trim()
            aliases.add(normalizeSkillToken(registrySlug))
          }
          if (typeof meta.version === 'string' && meta.version.trim()) {
            version = meta.version.trim()
          }
          if (meta.bundled === true) {
            bundled = true
          }
        } catch {
          // ignore malformed _meta.json
        }

        try {
          const origin = JSON.parse(fs.readFileSync(path.join(skillDir, '.clawhub', 'origin.json'), 'utf8')) as Record<string, unknown>
          if (typeof origin.slug === 'string' && origin.slug.trim()) {
            registrySlug = origin.slug.trim()
            aliases.add(normalizeSkillToken(registrySlug))
          }
          if (!version && typeof origin.installedVersion === 'string' && origin.installedVersion.trim()) {
            version = origin.installedVersion.trim()
          }
        } catch {
          // ignore missing origin metadata
        }

        return {
          dirName: entry.name,
          registrySlug,
          version,
          bundled,
          aliases,
        }
      })
  } catch {
    return []
  }
}

function enrichInstalledRows(rows: SkillRow[]): SkillRow[] {
  const workspaceMetas = readWorkspaceSkillMetas()
  if (workspaceMetas.length === 0) return rows

  return rows.map((row) => {
    if (row.source !== 'openclaw-workspace') return row

    const aliases = [
      normalizeSkillToken(row.slug),
      normalizeSkillToken(row.skillKey),
      normalizeSkillToken(row.name),
    ]
    const match = workspaceMetas.find((meta) => aliases.some((alias) => alias && meta.aliases.has(alias)))
    if (!match) return row

    return {
      ...row,
      slug: match.registrySlug ?? match.dirName ?? row.slug,
      version: row.version !== 'unknown' ? row.version : match.version ?? row.version,
      bundled: row.bundled ?? match.bundled ?? BUNDLED_SKILL_SLUGS.has(normalizeSkillToken(match.registrySlug ?? match.dirName)),
    }
  })
}

export function mapSkillJson(raw: string, installed: boolean) {
  const data = parseSkillsPayload(raw)
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : isRecord(data) && Array.isArray(data.skills)
        ? data.skills
        : []
  const mapped: SkillRow[] = rows.filter(isRecord).map((s) => {
    const skillKey =
      typeof s.skillKey === 'string'
        ? s.skillKey
        : typeof s.name === 'string'
          ? s.name
          : typeof s.slug === 'string'
            ? s.slug
            : 'unknown'
    const slug = (typeof s.slug === 'string' ? s.slug : skillKey) || 'unknown'
    const normalizedSlug = normalizeSkillToken(slug)
    return {
      slug,
      name: (typeof s.name === 'string' ? s.name : skillKey) || skillKey,
      description: typeof s.description === 'string' ? s.description : '',
      version: typeof s.version === 'string' ? s.version : 'unknown',
      installed,
      skillKey,
      source: typeof s.source === 'string' ? s.source : undefined,
      disabled: typeof s.disabled === 'boolean' ? s.disabled : undefined,
      eligible: typeof s.eligible === 'boolean' ? s.eligible : undefined,
      bundled: typeof s.bundled === 'boolean' ? s.bundled : BUNDLED_SKILL_SLUGS.has(normalizedSlug),
    }
  })

  return installed ? enrichInstalledRows(mapped) : mapped
}
