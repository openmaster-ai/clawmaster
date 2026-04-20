import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import { getOpenclawDataDir } from '../paths.js'
import { readRequiredRuntimeTextFileSync, resolveRuntimePathSync } from '../runtimeFs.js'
import {
  directoryExistsInWslSync,
  execWslCommandSync,
  getWslHomeDirSync,
  readBinaryFileInWslSync,
  requireSelectedWslDistroSync,
  shellEscapePosixArg,
  shouldUseWslRuntime,
} from '../wslRuntime.js'

export interface ContentDraftVariantSummary {
  id: string
  runId: string
  platform: string
  title: string | null
  slug: string | null
  sourceUrl: string | null
  savedAt: string | null
  draftPath: string
  manifestPath: string
  imagesDir: string
  imageFiles: string[]
}

export interface ContentDraftTextFile {
  path: string
  content: string
}

export interface ContentDraftImageFile {
  path: string
  mimeType: string
  bytes: number[]
}

export interface ContentDraftDeleteResult {
  removedPath: string
}

type ContentDraftManifest = Partial<{
  runId: string
  platform: string
  title: string | null
  slug: string | null
  sourceUrl: string | null
  draftPath: string
  imagesDir: string
  imageFiles: string[]
  savedAt: string | null
}>

function runtimePathModule(): typeof path.posix | typeof path.win32 {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (process.platform === 'win32' && shouldUseWslRuntime(runtimeSelection)) {
    return path.posix
  }
  return process.platform === 'win32' ? path.win32 : path.posix
}

function buildDefaultContentDraftRoot(): string {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (process.platform === 'win32' && shouldUseWslRuntime(runtimeSelection)) {
    const distro = requireSelectedWslDistroSync(runtimeSelection)
    return path.posix.join(getWslHomeDirSync(distro), '.openclaw', 'workspace', 'content-drafts')
  }
  const pathModule = runtimePathModule()
  return pathModule.join(os.homedir(), '.openclaw', 'workspace', 'content-drafts')
}

function envConfiguredContentDraftRoots(): string[] {
  const pathModule = runtimePathModule()
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR?.trim()
  const dataDir = process.env.OPENCLAW_DATA_DIR?.trim()
  const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim()

  return [
    ...(workspaceDir ? [pathModule.join(resolveRuntimePathSync(workspaceDir), 'content-drafts')] : []),
    ...(dataDir ? [pathModule.join(resolveRuntimePathSync(dataDir), 'workspace', 'content-drafts')] : []),
    ...(configPath ? [pathModule.join(pathModule.dirname(resolveRuntimePathSync(configPath)), 'workspace', 'content-drafts')] : []),
  ]
}

export function getContentDraftRootPaths(): string[] {
  const pathModule = runtimePathModule()
  const roots = [
    ...envConfiguredContentDraftRoots(),
    pathModule.join(getOpenclawDataDir(), 'workspace', 'content-drafts'),
    buildDefaultContentDraftRoot(),
  ]
  return [...new Set(roots.map((value) => value.replace(/[\\/]+$/, '')))]
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const pathModule = runtimePathModule()
  const relative = pathModule.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !pathModule.isAbsolute(relative))
}

function resolveAllowedContentDraftPath(pathInput: string): string {
  const resolved = resolveRuntimePathSync(pathInput)
  const roots = getContentDraftRootPaths()
  if (!roots.some((rootPath) => isWithinRoot(rootPath, resolved))) {
    throw new Error(`Path is outside content draft roots: ${resolved}`)
  }
  return resolved
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function normalizeManifest(
  manifestPath: string,
  raw: ContentDraftManifest,
): ContentDraftVariantSummary | null {
  const pathModule = runtimePathModule()
  const platformDir = pathModule.dirname(manifestPath)
  const runDir = pathModule.dirname(platformDir)
  const platform = String(raw.platform ?? pathModule.basename(platformDir)).trim().toLowerCase()
  const runId = String(raw.runId ?? pathModule.basename(runDir)).trim()
  if (!platform || !runId) return null
  const draftPath = String(raw.draftPath ?? pathModule.join(platformDir, 'draft.md')).trim()
  const imagesDir = String(raw.imagesDir ?? pathModule.join(platformDir, 'images')).trim()
  const imageFiles = Array.isArray(raw.imageFiles)
    ? raw.imageFiles.map((value) => String(value)).filter(Boolean)
    : []

  return {
    id: `${runId}:${platform}`,
    runId,
    platform,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
    slug: typeof raw.slug === 'string' && raw.slug.trim() ? raw.slug.trim() : null,
    sourceUrl: typeof raw.sourceUrl === 'string' && raw.sourceUrl.trim() ? raw.sourceUrl.trim() : null,
    savedAt: typeof raw.savedAt === 'string' && raw.savedAt.trim() ? raw.savedAt.trim() : null,
    draftPath,
    manifestPath,
    imagesDir,
    imageFiles,
  }
}

function listHostContentDraftManifests(rootPath: string): string[] {
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return []
  }

  const manifests: string[] = []
  for (const runEntry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!runEntry.isDirectory()) continue
    const runDir = path.join(rootPath, runEntry.name)
    for (const platformEntry of fs.readdirSync(runDir, { withFileTypes: true })) {
      if (!platformEntry.isDirectory()) continue
      const manifestPath = path.join(runDir, platformEntry.name, 'manifest.json')
      if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) {
        manifests.push(manifestPath)
      }
    }
  }
  return manifests
}

function listWslContentDraftManifests(distro: string, rootPath: string): string[] {
  if (!directoryExistsInWslSync(distro, rootPath)) {
    return []
  }
  const output = execWslCommandSync(
    distro,
    'bash',
    ['-lc', `find ${shellEscapePosixArg(rootPath)} -mindepth 2 -maxdepth 2 -type f -name manifest.json -print`],
  )
  if (output.code !== 0) {
    throw new Error(output.stderr.trim() || output.stdout.trim() || 'Failed to list content draft manifests')
  }
  return output.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function readManifestText(manifestPath: string): string {
  return readRequiredRuntimeTextFileSync(manifestPath).content
}

export function listContentDraftVariants(): ContentDraftVariantSummary[] {
  const runtimeSelection = getClawmasterRuntimeSelection()
  const roots = getContentDraftRootPaths()
  const manifests = new Set<string>()

  if (process.platform === 'win32' && shouldUseWslRuntime(runtimeSelection)) {
    const distro = requireSelectedWslDistroSync(runtimeSelection)
    for (const rootPath of roots) {
      for (const manifestPath of listWslContentDraftManifests(distro, rootPath)) {
        manifests.add(manifestPath)
      }
    }
  } else {
    for (const rootPath of roots) {
      for (const manifestPath of listHostContentDraftManifests(rootPath)) {
        manifests.add(manifestPath)
      }
    }
  }

  const variants: ContentDraftVariantSummary[] = []
  for (const manifestPath of manifests) {
    try {
      const raw = JSON.parse(readManifestText(manifestPath)) as ContentDraftManifest
      const normalized = normalizeManifest(manifestPath, raw)
      if (normalized) {
        variants.push(normalized)
      }
    } catch {
      // Ignore malformed or half-written manifests and keep the rest visible.
    }
  }

  return variants.sort((left, right) => {
    const leftTime = left.savedAt ? Date.parse(left.savedAt) : 0
    const rightTime = right.savedAt ? Date.parse(right.savedAt) : 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return right.id.localeCompare(left.id)
  })
}

export function readContentDraftTextFile(pathInput: string): ContentDraftTextFile {
  const path = resolveAllowedContentDraftPath(pathInput)
  const file = readRequiredRuntimeTextFileSync(path)
  return {
    path: file.path,
    content: file.content,
  }
}

export function readContentDraftImageFile(pathInput: string): ContentDraftImageFile {
  const resolved = resolveAllowedContentDraftPath(pathInput)
  const runtimeSelection = getClawmasterRuntimeSelection()
  let content: Buffer

  if (process.platform === 'win32' && shouldUseWslRuntime(runtimeSelection)) {
    const distro = requireSelectedWslDistroSync(runtimeSelection)
    content = readBinaryFileInWslSync(distro, resolved)
  } else {
    content = fs.readFileSync(resolved)
  }

  return {
    path: resolved,
    mimeType: inferMimeType(resolved),
    bytes: [...content],
  }
}

export function deleteContentDraftVariant(pathInput: string): ContentDraftDeleteResult {
  const manifestPath = resolveAllowedContentDraftPath(pathInput)
  const pathModule = runtimePathModule()
  const platformDir = pathModule.dirname(manifestPath)
  const runDir = pathModule.dirname(platformDir)
  const runtimeSelection = getClawmasterRuntimeSelection()

  if (pathModule.basename(manifestPath) !== 'manifest.json') {
    throw new Error(`Expected a content draft manifest path, got: ${manifestPath}`)
  }
  if (!getContentDraftRootPaths().some((rootPath) => isWithinRoot(rootPath, platformDir))) {
    throw new Error(`Path is outside content draft roots: ${platformDir}`)
  }

  if (process.platform === 'win32' && shouldUseWslRuntime(runtimeSelection)) {
    const distro = requireSelectedWslDistroSync(runtimeSelection)
    const removeResult = execWslCommandSync(
      distro,
      'bash',
      ['-lc', `rm -rf ${shellEscapePosixArg(platformDir)}`],
    )
    if (removeResult.code !== 0) {
      throw new Error(removeResult.stderr.trim() || removeResult.stdout.trim() || 'Failed to delete content draft variant')
    }

    const pruneRunResult = execWslCommandSync(
      distro,
      'bash',
      ['-lc', `[ -d ${shellEscapePosixArg(runDir)} ] && rmdir ${shellEscapePosixArg(runDir)} 2>/dev/null || true`],
    )
    if (pruneRunResult.code !== 0) {
      throw new Error(pruneRunResult.stderr.trim() || pruneRunResult.stdout.trim() || 'Failed to prune empty content draft run directory')
    }
  } else {
    fs.rmSync(platformDir, { recursive: true, force: true })
    if (fs.existsSync(runDir) && fs.statSync(runDir).isDirectory() && fs.readdirSync(runDir).length === 0) {
      fs.rmSync(runDir, { recursive: true, force: true })
    }
  }

  return { removedPath: platformDir }
}
