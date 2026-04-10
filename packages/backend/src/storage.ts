import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getClawmasterRuntimeSelection,
  type ClawmasterRuntimeSelection,
  type ClawmasterSettingsContext,
} from './clawmasterSettings.js'
import {
  getOpenclawPathModule,
  getOpenclawProfileSelection,
  type OpenclawProfileContext,
  type OpenclawProfileSelection,
} from './openclawProfile.js'
import { getWslHomeDirSync, resolveSelectedWslDistroSync } from './wslRuntime.js'

export type LocalDataState = 'ready' | 'degraded' | 'blocked'
export type LocalDataEngine = 'seekdb-embedded' | 'fallback' | 'unavailable'
export type LocalDataReasonCode =
  | 'node_missing'
  | 'node_too_old'
  | 'embedded_platform_unsupported'
  | 'wsl_distro_missing'

export interface LocalDataStatus {
  state: LocalDataState
  engine: LocalDataEngine
  runtimeTarget: 'native' | 'wsl2'
  profileKey: string
  dataRoot: string | null
  engineRoot: string | null
  nodeRequirement: string
  supportsEmbedded: boolean
  targetPlatform: string
  targetArch: string
  reasonCode: LocalDataReasonCode | null
}

export interface LocalDataDocument {
  id: string
  module: string
  sourceType: string
  sourcePath?: string
  title: string
  content: string
  tags?: string[]
  metadata?: Record<string, unknown>
  updatedAt?: string
}

export interface LocalDataSearchResult {
  id: string
  module: string
  sourceType: string
  sourcePath?: string
  title: string
  content: string
  tags: string[]
  metadata: Record<string, unknown>
  updatedAt: string
  score: number
  snippet: string
}

export interface LocalDataStats {
  engine: LocalDataEngine
  state: LocalDataState
  profileKey: string
  dataRoot: string | null
  engineRoot: string | null
  documentCount: number
  moduleCounts: Record<string, number>
  schemaVersion: number
  updatedAt: string | null
}

export interface LocalDataSearchOptions {
  query: string
  module?: string
  limit?: number
}

export interface LocalDataHostRootContext {
  platform?: NodeJS.Platform | string
  wslDistro?: string | null
}

export interface LocalDataStatusContext extends ClawmasterSettingsContext, OpenclawProfileContext {
  runtimeSelection?: ClawmasterRuntimeSelection
  profileSelection?: OpenclawProfileSelection
  hostPlatform?: string
  hostArch?: string
  nodeInstalled: boolean
  nodeVersion?: string
  selectedWslDistro?: string | null
  wslHomeDir?: string | null
}

const FALLBACK_SCHEMA_VERSION = 1
const FALLBACK_MANIFEST_FILE = 'manifest.json'
const FALLBACK_DOCUMENTS_FILE = 'documents.jsonl'

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeDocument(input: LocalDataDocument): LocalDataDocument {
  return {
    id: input.id.trim(),
    module: input.module.trim(),
    sourceType: input.sourceType.trim(),
    sourcePath: input.sourcePath?.trim() || undefined,
    title: input.title.trim(),
    content: input.content.trim(),
    tags: Array.from(new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
    metadata: input.metadata ?? {},
    updatedAt: input.updatedAt ?? nowIso(),
  }
}

function assertValidDocument(doc: LocalDataDocument): void {
  if (!doc.id) throw new Error('Local data document id is required')
  if (!doc.module) throw new Error('Local data document module is required')
  if (!doc.sourceType) throw new Error('Local data document sourceType is required')
  if (!doc.title) throw new Error('Local data document title is required')
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}._-]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
}

function includesIgnoreCase(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase())
}

function makeSnippet(doc: LocalDataDocument, query: string): string {
  const source = doc.content || doc.title
  const normalizedSource = source.toLowerCase()
  const normalizedQuery = query.trim().toLowerCase()
  const index = normalizedQuery ? normalizedSource.indexOf(normalizedQuery) : -1
  if (index < 0) {
    return source.length > 180 ? `${source.slice(0, 177)}...` : source
  }
  const start = Math.max(0, index - 70)
  const end = Math.min(source.length, index + normalizedQuery.length + 90)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < source.length ? '...' : ''
  return `${prefix}${source.slice(start, end)}${suffix}`
}

function scoreDocument(doc: LocalDataDocument, query: string): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0
  const tokens = tokenize(query)
  const title = doc.title.toLowerCase()
  const content = doc.content.toLowerCase()
  const tags = (doc.tags ?? []).join(' ').toLowerCase()
  let score = 0

  if (title === normalizedQuery) score += 100
  if (title.includes(normalizedQuery)) score += 45
  if (tags.includes(normalizedQuery)) score += 30
  if (content.includes(normalizedQuery)) score += 20

  for (const token of tokens) {
    if (title.includes(token)) score += 16
    if (tags.includes(token)) score += 10
    if (content.includes(token)) score += 6
  }
  return score
}

function normalizeArch(arch: string | undefined): string {
  if (arch === 'x86_64') return 'x64'
  if (arch === 'aarch64') return 'arm64'
  return arch?.trim() || process.arch
}

function parseNodeMajor(version: string | undefined | null): number | null {
  const match = /^v?(\d+)/.exec((version ?? '').trim())
  if (!match) return null
  const major = Number(match[1])
  return Number.isFinite(major) ? major : null
}

function supportsSeekdbEmbedded(targetPlatform: string, targetArch: string): boolean {
  if (targetPlatform === 'linux') {
    return targetArch === 'x64' || targetArch === 'arm64'
  }
  if (targetPlatform === 'darwin') {
    return targetArch === 'arm64'
  }
  return false
}

export function getClawmasterDataRootForProfile(
  profileSelection: OpenclawProfileSelection,
  context: OpenclawProfileContext = {},
): string {
  const pathModule = getOpenclawPathModule(context.platform)
  const homeDir = context.homeDir ?? os.homedir()
  const baseDir = pathModule.join(homeDir, '.clawmaster', 'data')

  if (profileSelection.kind === 'dev') {
    return pathModule.join(baseDir, 'dev')
  }
  if (profileSelection.kind === 'named' && profileSelection.name) {
    return pathModule.join(baseDir, 'named', profileSelection.name)
  }
  return pathModule.join(baseDir, 'default')
}

export function getLocalDataProfileKey(profileSelection: OpenclawProfileSelection): string {
  if (profileSelection.kind === 'named' && profileSelection.name) {
    return `named:${profileSelection.name}`
  }
  return profileSelection.kind
}

function sanitizeUncSegment(value: string): string {
  return value.replace(/[\\/]/g, '').trim()
}

export function resolveLocalDataHostEngineRoot(
  status: LocalDataStatus,
  { platform = process.platform, wslDistro }: LocalDataHostRootContext = {},
): string | null {
  if (!status.engineRoot) return null
  if (platform !== 'win32' || status.runtimeTarget !== 'wsl2') return status.engineRoot

  const distro = sanitizeUncSegment(wslDistro ?? '')
  if (!distro) {
    throw new Error('WSL2 local data storage requires a selected distro')
  }

  const segments = status.engineRoot
    .replace(/\\/g, '/')
    .split('/')
    .map(sanitizeUncSegment)
    .filter(Boolean)

  return `\\\\wsl.localhost\\${distro}\\${segments.join('\\')}`
}

export function resolveLocalDataStatus({
  runtimeSelection = getClawmasterRuntimeSelection(),
  profileSelection = getOpenclawProfileSelection(),
  hostPlatform = process.platform,
  hostArch = process.arch,
  homeDir = os.homedir(),
  nodeInstalled,
  nodeVersion,
  selectedWslDistro,
  wslHomeDir,
}: LocalDataStatusContext): LocalDataStatus {
  const normalizedArch = normalizeArch(hostArch)
  const profileKey = getLocalDataProfileKey(profileSelection)
  const runtimeTarget = hostPlatform === 'win32' && runtimeSelection.mode === 'wsl2' ? 'wsl2' : 'native'

  if (runtimeTarget === 'wsl2') {
    const resolvedDistro = selectedWslDistro === undefined
      ? resolveSelectedWslDistroSync(runtimeSelection)
      : selectedWslDistro
    if (!resolvedDistro) {
      return {
        state: 'blocked',
        engine: 'unavailable',
        runtimeTarget,
        profileKey,
        dataRoot: null,
        engineRoot: null,
        nodeRequirement: '>=20',
        supportsEmbedded: supportsSeekdbEmbedded('linux', normalizedArch),
        targetPlatform: 'linux',
        targetArch: normalizedArch,
        reasonCode: 'wsl_distro_missing',
      }
    }

    const resolvedHomeDir = wslHomeDir ?? getWslHomeDirSync(resolvedDistro)
    const dataRoot = getClawmasterDataRootForProfile(profileSelection, {
      homeDir: resolvedHomeDir,
      platform: 'linux',
    })
    const nodeMajor = parseNodeMajor(nodeVersion)
    const supportsEmbedded = supportsSeekdbEmbedded('linux', normalizedArch)

    if (!nodeInstalled) {
      return {
        state: 'degraded',
        engine: 'fallback',
        runtimeTarget,
        profileKey,
        dataRoot,
        engineRoot: getOpenclawPathModule('linux').join(dataRoot, 'fallback'),
        nodeRequirement: '>=20',
        supportsEmbedded,
        targetPlatform: 'linux',
        targetArch: normalizedArch,
        reasonCode: 'node_missing',
      }
    }

    if (!nodeMajor || nodeMajor < 20) {
      return {
        state: 'degraded',
        engine: 'fallback',
        runtimeTarget,
        profileKey,
        dataRoot,
        engineRoot: getOpenclawPathModule('linux').join(dataRoot, 'fallback'),
        nodeRequirement: '>=20',
        supportsEmbedded,
        targetPlatform: 'linux',
        targetArch: normalizedArch,
        reasonCode: 'node_too_old',
      }
    }

    return {
      state: 'ready',
      engine: 'fallback',
      runtimeTarget,
      profileKey,
      dataRoot,
      engineRoot: getOpenclawPathModule('linux').join(dataRoot, 'fallback'),
      nodeRequirement: '>=20',
      supportsEmbedded,
      targetPlatform: 'linux',
      targetArch: normalizedArch,
      reasonCode: null,
    }
  }

  const dataRoot = getClawmasterDataRootForProfile(profileSelection, {
    homeDir,
    platform: hostPlatform,
  })
  const pathModule = getOpenclawPathModule(hostPlatform)
  const supportsEmbedded = supportsSeekdbEmbedded(hostPlatform, normalizedArch)
  const nodeMajor = parseNodeMajor(nodeVersion)

  if (!nodeInstalled) {
    return {
      state: 'degraded',
      engine: 'fallback',
      runtimeTarget,
      profileKey,
      dataRoot,
      engineRoot: pathModule.join(dataRoot, 'fallback'),
      nodeRequirement: '>=20',
      supportsEmbedded,
      targetPlatform: hostPlatform,
      targetArch: normalizedArch,
      reasonCode: 'node_missing',
    }
  }

  if (!nodeMajor || nodeMajor < 20) {
    return {
      state: 'degraded',
      engine: 'fallback',
      runtimeTarget,
      profileKey,
      dataRoot,
      engineRoot: pathModule.join(dataRoot, 'fallback'),
      nodeRequirement: '>=20',
      supportsEmbedded,
      targetPlatform: hostPlatform,
      targetArch: normalizedArch,
      reasonCode: 'node_too_old',
    }
  }

  return {
    state: 'ready',
    engine: 'fallback',
    runtimeTarget,
    profileKey,
    dataRoot,
    engineRoot: pathModule.join(dataRoot, 'fallback'),
    nodeRequirement: '>=20',
    supportsEmbedded,
    targetPlatform: hostPlatform,
    targetArch: normalizedArch,
    reasonCode: null,
  }
}

export class FallbackFileStore {
  readonly status: LocalDataStatus
  readonly root: string

  constructor(status: LocalDataStatus, rootOverride?: string | null) {
    if (!status.engineRoot) {
      throw new Error('Local data store is unavailable because no engine root is resolved')
    }
    this.status = status
    this.root = rootOverride ?? status.engineRoot
  }

  private manifestPath(): string {
    return path.join(this.root, FALLBACK_MANIFEST_FILE)
  }

  private documentsPath(): string {
    return path.join(this.root, FALLBACK_DOCUMENTS_FILE)
  }

  init(): void {
    fs.mkdirSync(this.root, { recursive: true })
    if (!fs.existsSync(this.manifestPath())) {
      this.writeManifest({ schemaVersion: FALLBACK_SCHEMA_VERSION, updatedAt: nowIso() })
    }
    if (!fs.existsSync(this.documentsPath())) {
      fs.writeFileSync(this.documentsPath(), '', 'utf8')
    }
  }

  stats(): LocalDataStats {
    this.init()
    const docs = this.readDocuments()
    const moduleCounts: Record<string, number> = {}
    for (const doc of docs) {
      moduleCounts[doc.module] = (moduleCounts[doc.module] ?? 0) + 1
    }
    const manifest = this.readManifest()
    return {
      engine: this.status.engine,
      state: this.status.state,
      profileKey: this.status.profileKey,
      dataRoot: this.status.dataRoot,
      engineRoot: this.status.engineRoot,
      documentCount: docs.length,
      moduleCounts,
      schemaVersion: manifest.schemaVersion,
      updatedAt: manifest.updatedAt,
    }
  }

  upsertDocuments(documents: LocalDataDocument[]): LocalDataStats {
    this.init()
    const existing = new Map(this.readDocuments().map((doc) => [doc.id, doc]))
    for (const item of documents) {
      const normalized = normalizeDocument(item)
      assertValidDocument(normalized)
      existing.set(normalized.id, normalized)
    }
    this.writeDocuments([...existing.values()])
    return this.stats()
  }

  deleteBySource(module: string, sourceType?: string): LocalDataStats {
    this.init()
    const kept = this.readDocuments().filter((doc) => {
      if (doc.module !== module) return true
      if (sourceType && doc.sourceType !== sourceType) return true
      return false
    })
    this.writeDocuments(kept)
    return this.stats()
  }

  search({ query, module, limit = 12 }: LocalDataSearchOptions): LocalDataSearchResult[] {
    this.init()
    const trimmed = query.trim()
    if (!trimmed) return []
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))

    return this.readDocuments()
      .filter((doc) => !module || doc.module === module)
      .map((doc) => ({ doc, score: scoreDocument(doc, trimmed) }))
      .filter((item) => item.score > 0 || includesIgnoreCase(item.doc.title, trimmed) || includesIgnoreCase(item.doc.content, trimmed))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return left.doc.title.localeCompare(right.doc.title, undefined, { sensitivity: 'base', numeric: true })
      })
      .slice(0, safeLimit)
      .map(({ doc, score }) => ({
        id: doc.id,
        module: doc.module,
        sourceType: doc.sourceType,
        sourcePath: doc.sourcePath,
        title: doc.title,
        content: doc.content,
        tags: doc.tags ?? [],
        metadata: doc.metadata ?? {},
        updatedAt: doc.updatedAt ?? '',
        score,
        snippet: makeSnippet(doc, trimmed),
      }))
  }

  rebuild(): LocalDataStats {
    this.init()
    this.writeDocuments(this.readDocuments().map(normalizeDocument))
    return this.stats()
  }

  reset(): LocalDataStats {
    if (fs.existsSync(this.root)) {
      fs.rmSync(this.root, { recursive: true, force: true })
    }
    this.init()
    return this.stats()
  }

  private readManifest(): { schemaVersion: number; updatedAt: string | null } {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.manifestPath(), 'utf8')) as Partial<{ schemaVersion: number; updatedAt: string }>
      return {
        schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : FALLBACK_SCHEMA_VERSION,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      }
    } catch {
      return { schemaVersion: FALLBACK_SCHEMA_VERSION, updatedAt: null }
    }
  }

  private writeManifest(manifest: { schemaVersion: number; updatedAt: string }): void {
    fs.mkdirSync(this.root, { recursive: true })
    fs.writeFileSync(this.manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }

  private readDocuments(): LocalDataDocument[] {
    try {
      const raw = fs.readFileSync(this.documentsPath(), 'utf8')
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LocalDataDocument)
        .map(normalizeDocument)
    } catch {
      return []
    }
  }

  private writeDocuments(documents: LocalDataDocument[]): void {
    fs.mkdirSync(this.root, { recursive: true })
    const sorted = [...documents].sort((left, right) => left.id.localeCompare(right.id, undefined, { sensitivity: 'base', numeric: true }))
    const body = sorted.map((doc) => JSON.stringify(normalizeDocument(doc))).join('\n')
    fs.writeFileSync(this.documentsPath(), body ? `${body}\n` : '', 'utf8')
    this.writeManifest({ schemaVersion: FALLBACK_SCHEMA_VERSION, updatedAt: nowIso() })
  }
}

export function createFallbackFileStore(status: LocalDataStatus, rootOverride?: string | null): FallbackFileStore {
  return new FallbackFileStore(status, rootOverride)
}
