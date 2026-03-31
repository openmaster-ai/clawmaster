import fs from 'fs'
import path from 'path'
import { execNpmInstallGlobalFile, execShellCommand } from './execOpenclaw.js'
import { expandUserPath } from './paths.js'

/** Block npm arg injection; allow typical semver / dist-tag characters only */
const VERSION_SPEC_RE = /^[a-zA-Z0-9._-]{1,128}$/

export function assertSafeOpenclawVersionSpec(spec: string): void {
  const s = spec.trim()
  if (s === '' || s === 'latest') return
  if (!VERSION_SPEC_RE.test(s)) {
    throw new Error('Invalid version or tag')
  }
}

function parseVersionsJson(stdout: string): string[] {
  const t = stdout.trim()
  if (!t) return []
  let data: unknown
  try {
    data = JSON.parse(t) as unknown
  } catch {
    return []
  }
  if (Array.isArray(data)) {
    return data.filter((x): x is string => typeof x === 'string')
  }
  if (typeof data === 'string') return [data]
  return []
}

function parseDistTagsJson(stdout: string): Record<string, string> {
  const t = stdout.trim()
  if (!t) return {}
  try {
    const data = JSON.parse(t) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).filter(
        ([, v]) => typeof v === 'string'
      )
    ) as Record<string, string>
  } catch {
    return {}
  }
}

/** Coarse semver descending sort (major first); prerelease tie-break by string */
function compareVersionDesc(a: string, b: string): number {
  const key = (v: string): number[] => {
    const core = v.split('-')[0]?.split('+')[0] ?? ''
    const parts = core.split('.').map((p) => {
      const n = parseInt(p, 10)
      return Number.isFinite(n) ? n : 0
    })
    while (parts.length < 3) parts.push(0)
    return parts
  }
  const ka = key(a)
  const kb = key(b)
  for (let i = 0; i < 3; i++) {
    const d = kb[i]! - ka[i]!
    if (d !== 0) return d
  }
  return b.localeCompare(a)
}

const MAX_VERSIONS_LIST = 120

export async function fetchOpenclawNpmMeta(): Promise<{
  versions: string[]
  distTags: Record<string, string>
}> {
  const [vRes, tRes] = await Promise.all([
    execShellCommand('npm view openclaw versions --json'),
    execShellCommand('npm view openclaw dist-tags --json'),
  ])
  if (vRes.code !== 0) {
    throw new Error(vRes.stderr || vRes.stdout || 'npm view openclaw versions failed')
  }
  let versions = parseVersionsJson(vRes.stdout)
  versions = [...new Set(versions)].sort(compareVersionDesc)
  if (versions.length > MAX_VERSIONS_LIST) {
    versions = versions.slice(0, MAX_VERSIONS_LIST)
  }
  const distTags =
    tRes.code === 0 ? parseDistTagsJson(tRes.stdout) : {}
  return { versions, distTags }
}

export async function npmInstallOpenclawGlobal(versionSpec: string): Promise<{
  ok: boolean
  code: number
  stdout: string
  stderr: string
}> {
  const s = versionSpec.trim()
  let pkgArg = 'openclaw'
  if (s !== '' && s !== 'latest') {
    assertSafeOpenclawVersionSpec(s)
    pkgArg = `openclaw@${s}`
  }
  const { code, stdout, stderr } = await execShellCommand(
    `npm install -g ${pkgArg}`
  )
  return {
    ok: code === 0,
    code,
    stdout,
    stderr,
  }
}

/** Validate and resolve local package path (npm pack .tgz / .tar.gz) */
export function resolveLocalOpenclawPackagePath(raw: string): string {
  const expanded = expandUserPath(raw.trim())
  const abs = path.resolve(expanded)
  if (!fs.existsSync(abs)) {
    throw new Error('找不到该文件，请检查路径（支持 ~/ 与绝对路径）')
  }
  if (!fs.statSync(abs).isFile()) {
    throw new Error('请指向单个文件，而非目录')
  }
  const bn = path.basename(abs).toLowerCase()
  if (!bn.endsWith('.tgz') && !bn.endsWith('.tar.gz')) {
    throw new Error('仅支持 npm pack 生成的 .tgz 或 .tar.gz 包')
  }
  return abs
}

/** Global install from local tarball (no registry fetch; may still resolve existing deps) */
export async function npmInstallOpenclawFromLocalFile(rawPath: string): Promise<{
  ok: boolean
  code: number
  stdout: string
  stderr: string
}> {
  const abs = resolveLocalOpenclawPackagePath(rawPath)
  const { code, stdout, stderr } = await execNpmInstallGlobalFile(abs)
  return {
    ok: code === 0,
    code,
    stdout,
    stderr,
  }
}
