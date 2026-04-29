import fs from 'node:fs'
import path from 'node:path'
import { getOpenclawDataDir } from '../paths.js'
import {
  requireSelectedWslDistroSync,
  runWslShellSync,
  shellEscapePosixArg,
  shouldUseWslRuntime,
} from '../wslRuntime.js'

const BUNDLED_SKILLS = {
  'content-draft': {
    dirName: 'content-draft',
    envKey: 'CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT',
  },
  'clawprobe-cost-digest': {
    dirName: 'clawprobe-cost-digest',
    envKey: 'CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT',
  },
  'ernie-image': {
    dirName: 'ernie-image',
    envKey: 'CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT',
  },
  'models-dev': {
    dirName: 'models-dev',
    envKey: 'CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT',
  },
  'package-download-tracker': {
    dirName: 'package-download-tracker',
    envKey: 'CLAWMASTER_BUNDLED_PACKAGE_DOWNLOAD_TRACKER_SKILL_ROOT',
  },
  'paddleocr-doc-parsing': {
    dirName: 'paddleocr-doc-parsing',
    envKey: 'CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT',
  },
} as const

export type BundledSkillSlug = keyof typeof BUNDLED_SKILLS

type BundledSkillInstallOptions = {
  dataDir?: string
  env?: NodeJS.ProcessEnv
  platform?: string
  wslRuntime?: boolean
  wslDistro?: string | null
  runWslScript?: (distro: string, script: string) => { code: number; stdout: string; stderr: string }
}

type BundledSkillSpec = (typeof BUNDLED_SKILLS)[BundledSkillSlug]

function normalizeSkillSlug(value: string): string {
  return value.trim().toLowerCase()
}

export function isBundledSkillSlug(value: string): value is BundledSkillSlug {
  return normalizeSkillSlug(value) in BUNDLED_SKILLS
}

function windowsPathToWslPath(value: string): string | null {
  const normalized = value.trim()
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(normalized)
  if (!match) return null
  const drive = match[1]!.toLowerCase()
  const tail = match[2]!.replace(/\\/g, '/')
  return `/mnt/${drive}/${tail}`
}

function shouldInstallBundledSkillThroughWsl(
  dataDir: string,
  options: BundledSkillInstallOptions,
): boolean {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return false
  if (!(options.wslRuntime ?? shouldUseWslRuntime())) return false
  return path.posix.isAbsolute(dataDir)
}

function copyBundledSkillIntoWsl(
  sourceRoot: string,
  installDir: string,
  options: BundledSkillInstallOptions,
): void {
  const distro = options.wslDistro ?? requireSelectedWslDistroSync()
  const sourceRootInWsl = windowsPathToWslPath(sourceRoot) ?? (path.posix.isAbsolute(sourceRoot) ? sourceRoot : null)
  if (!sourceRootInWsl) {
    throw new Error(`Bundled skill source is not reachable from WSL: ${sourceRoot}`)
  }

  const runWslScript = options.runWslScript ?? runWslShellSync
  const targetParent = path.posix.dirname(installDir)
  const script = [
    `mkdir -p ${shellEscapePosixArg(targetParent)}`,
    `rm -rf ${shellEscapePosixArg(installDir)}`,
    `mkdir -p ${shellEscapePosixArg(installDir)}`,
    `cp -a ${shellEscapePosixArg(`${sourceRootInWsl}/.`)} ${shellEscapePosixArg(`${installDir}/`)}`,
  ].join(' && ')
  const result = runWslScript(distro, script)
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `Failed to install bundled skill ${path.posix.basename(installDir)} into WSL`)
  }
}

export function installBundledSkill(
  slug: string,
  options: BundledSkillInstallOptions = {},
): { slug: BundledSkillSlug; installDir: string } {
  const normalizedSlug = normalizeSkillSlug(slug)
  if (!isBundledSkillSlug(normalizedSlug)) {
    throw new Error(`Unsupported bundled skill: ${slug}`)
  }

  const spec = BUNDLED_SKILLS[normalizedSlug]
  const env = options.env ?? process.env
  const sourceRoot = env[spec.envKey]?.trim()
  if (!sourceRoot) {
    throw new Error(`Missing bundled skill root for ${normalizedSlug}`)
  }
  if (!fs.existsSync(path.join(sourceRoot, 'SKILL.md'))) {
    throw new Error(`Bundled skill source is missing SKILL.md: ${sourceRoot}`)
  }

  const dataDir = options.dataDir ?? getOpenclawDataDir()
  const useWslInstall = shouldInstallBundledSkillThroughWsl(dataDir, options)
  const pathModule = useWslInstall ? path.posix : path
  const workspaceSkillsRoot = pathModule.join(dataDir, 'workspace', 'skills')
  const installDir = pathModule.join(workspaceSkillsRoot, spec.dirName)

  if (useWslInstall) {
    copyBundledSkillIntoWsl(sourceRoot, installDir, options)
  } else {
    fs.mkdirSync(workspaceSkillsRoot, { recursive: true })
    fs.rmSync(installDir, {
      recursive: true,
      force: true,
    })
    fs.cpSync(sourceRoot, installDir, {
      recursive: true,
      force: true,
    })
  }

  return {
    slug: normalizedSlug,
    installDir,
  }
}

function resolveBundledSkillInstallDir(
  spec: BundledSkillSpec,
  options: BundledSkillInstallOptions = {},
): string {
  const dataDir = options.dataDir ?? getOpenclawDataDir()
  const useWslInstall = shouldInstallBundledSkillThroughWsl(dataDir, options)
  const pathModule = useWslInstall ? path.posix : path
  return pathModule.join(dataDir, 'workspace', 'skills', spec.dirName)
}

function bundledSkillInstallDirExists(
  installDir: string,
  options: BundledSkillInstallOptions = {},
): boolean {
  const dataDir = options.dataDir ?? getOpenclawDataDir()
  if (!shouldInstallBundledSkillThroughWsl(dataDir, options)) {
    return fs.existsSync(installDir)
  }

  const distro = options.wslDistro ?? requireSelectedWslDistroSync()
  const runWslScript = options.runWslScript ?? runWslShellSync
  const result = runWslScript(distro, `test -e ${shellEscapePosixArg(installDir)}`)
  return result.code === 0
}

function readBundledSkillInstallMeta(
  installDir: string,
  options: BundledSkillInstallOptions = {},
): Record<string, unknown> | null {
  const dataDir = options.dataDir ?? getOpenclawDataDir()
  const metaPath = path.join(installDir, '_meta.json')

  try {
    if (!shouldInstallBundledSkillThroughWsl(dataDir, options)) {
      if (!fs.existsSync(metaPath)) return null
      return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>
    }

    const distro = options.wslDistro ?? requireSelectedWslDistroSync()
    const runWslScript = options.runWslScript ?? runWslShellSync
    const wslMetaPath = path.posix.join(installDir, '_meta.json')
    const result = runWslScript(distro, `cat ${shellEscapePosixArg(wslMetaPath)}`)
    if (result.code !== 0) return null
    return JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    return null
  }
}

function isSafeBundledSkillRefreshInstall(
  installDir: string,
  options: BundledSkillInstallOptions = {},
): boolean {
  const meta = readBundledSkillInstallMeta(installDir, options)
  return meta?.['bundled'] === true
}

export function syncInstalledBundledSkills(
  options: BundledSkillInstallOptions = {},
): BundledSkillSlug[] {
  const synced: BundledSkillSlug[] = []

  for (const slug of Object.keys(BUNDLED_SKILLS) as BundledSkillSlug[]) {
    const spec = BUNDLED_SKILLS[slug]
    const installDir = resolveBundledSkillInstallDir(spec, options)
    if (!bundledSkillInstallDirExists(installDir, options)) continue
    if (!isSafeBundledSkillRefreshInstall(installDir, options)) continue
    installBundledSkill(slug, options)
    synced.push(slug)
  }

  return synced
}
