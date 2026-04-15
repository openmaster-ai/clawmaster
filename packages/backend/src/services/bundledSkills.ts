import fs from 'node:fs'
import path from 'node:path'
import { getOpenclawDataDir } from '../paths.js'

const BUNDLED_SKILLS = {
  'ernie-image': {
    dirName: 'ernie-image',
    envKey: 'CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT',
  },
} as const

export type BundledSkillSlug = keyof typeof BUNDLED_SKILLS

function normalizeSkillSlug(value: string): string {
  return value.trim().toLowerCase()
}

export function isBundledSkillSlug(value: string): value is BundledSkillSlug {
  return normalizeSkillSlug(value) in BUNDLED_SKILLS
}

export function installBundledSkill(
  slug: string,
  options: {
    dataDir?: string
    env?: NodeJS.ProcessEnv
  } = {},
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

  const workspaceSkillsRoot = path.join(options.dataDir ?? getOpenclawDataDir(), 'workspace', 'skills')
  const installDir = path.join(workspaceSkillsRoot, spec.dirName)
  fs.mkdirSync(workspaceSkillsRoot, { recursive: true })
  fs.cpSync(sourceRoot, installDir, {
    recursive: true,
    force: true,
  })

  return {
    slug: normalizedSlug,
    installDir,
  }
}
