import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readConfigJsonOrEmpty, setConfigAtPath, updateConfigJson } from '../configJson.js'
import { isRecord } from '../serverUtils.js'
import {
  resolveManagedMemoryStoreContext,
  type ManagedMemoryContext,
  type ManagedMemoryStoreContext,
} from './managedMemory.js'
import { getOpenclawDataDirForProfile, getOpenclawProfileSelection } from '../openclawProfile.js'
import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import * as managedMemoryImportService from './managedMemoryImport.js'
import * as memoryOpenclawService from './memoryOpenclaw.js'
import * as openclawPlugins from './openclawPlugins.js'
import {
  getWslHomeDirSync,
  getWslRuntimeUnavailableMessage,
  resolveSelectedWslDistroSync,
} from '../wslRuntime.js'

export interface ManagedMemoryBridgeConfig {
  dataRoot: string
  engine: ManagedMemoryStoreContext['engine']
  autoCapture: boolean
  autoRecall: boolean
  inferOnAdd: boolean
  recallLimit: number
  recallScoreThreshold: number
  userId?: string
  agentId?: string
}

export interface ManagedMemoryBridgeEntry {
  enabled: boolean
  config: ManagedMemoryBridgeConfig
}

export interface ManagedMemoryBridgeRuntimePaths {
  hostPluginPath: string
  runtimePluginPath: string | null
  runtimeDataRoot: string | null
  pluginManifestPath: string
  unsupportedReason: string | null
}

export interface ManagedMemoryBridgeStatusPayload {
  pluginId: 'memory-clawmaster-powermem'
  slotKey: 'memory'
  state: 'missing' | 'ready' | 'drifted' | 'unsupported'
  issues: string[]
  installed: boolean
  pluginStatus: string | null
  installedPluginPath: string | null
  runtimePluginPath: string | null
  pluginPath: string
  pluginPathExists: boolean
  store: ManagedMemoryStoreContext
  currentSlotValue: string | null
  currentEntry: ManagedMemoryBridgeEntry | null
  desired: {
    slotValue: 'memory-clawmaster-powermem'
    entry: ManagedMemoryBridgeEntry | null
  }
}

const MEMORY_BRIDGE_PLUGIN_ID = 'memory-clawmaster-powermem' as const
const MEMORY_BRIDGE_SLOT_KEY = 'memory' as const
const ROOT_PLUGIN_PATH = fileURLToPath(new URL('../../../../plugins/memory-clawmaster-powermem', import.meta.url))
const PACKAGED_PLUGIN_ROOT_ENV = 'CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT'
const READY_PLUGIN_STATUSES = new Set(['loaded', 'enabled', 'active', 'ready', 'ok'])

export function shouldIgnoreManagedMemoryBridgeReindexErrorForTest(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  return (
    lower.includes("unknown command 'memory'") ||
    (lower.includes('requires node >=') && lower.includes('upgrade node and re-run openclaw'))
  )
}

export function resolveManagedMemoryPluginRootPath(): string {
  const packagedRoot = process.env[PACKAGED_PLUGIN_ROOT_ENV]?.trim()
  if (packagedRoot) {
    return packagedRoot
  }
  return ROOT_PLUGIN_PATH
}

export function windowsPathToWslPath(value: string): string | null {
  const normalized = value.trim()
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(normalized)
  if (!match) return null
  const drive = match[1]!.toLowerCase()
  const tail = match[2]!.replace(/\\/g, '/')
  return `/mnt/${drive}/${tail}`
}

function sanitizeUncSegment(value: string): string {
  return value.replace(/[\\/]/g, '').trim()
}

function wslPathToWindowsUncPath(distro: string, value: string): string {
  const normalizedDistro = sanitizeUncSegment(distro)
  const segments = value
    .replace(/\\/g, '/')
    .split('/')
    .map(sanitizeUncSegment)
    .filter(Boolean)
  return `\\\\wsl.localhost\\${normalizedDistro}\\${segments.join('\\')}`
}

function toWslRuntimePath(value: string): string | null {
  return windowsPathToWslPath(value) ?? (path.posix.isAbsolute(value) ? value : null)
}

function resolveBridgeRuntimePaths(
  context: ManagedMemoryContext = {}
): ManagedMemoryBridgeRuntimePaths {
  const store = resolveManagedMemoryStoreContext(context)
  const hostPluginPath = resolveManagedMemoryPluginRootPath()
  const pluginManifestPath = path.join(hostPluginPath, 'openclaw.plugin.json')

  if (store.runtimeTarget === 'wsl2') {
    if (!store.selectedWslDistro) {
      return {
        hostPluginPath,
        runtimePluginPath: null,
        runtimeDataRoot: null,
        pluginManifestPath,
        unsupportedReason: getWslRuntimeUnavailableMessage(),
      }
    }
    const runtimePluginPath = toWslRuntimePath(hostPluginPath)
    const runtimeDataRoot = windowsPathToWslPath(store.dataRoot) ?? store.dataRoot
    if (!runtimePluginPath || !runtimeDataRoot) {
      return {
        hostPluginPath,
        runtimePluginPath: null,
        runtimeDataRoot: null,
        pluginManifestPath,
        unsupportedReason: 'Failed to convert the managed PowerMem plugin path into a WSL runtime path.',
      }
    }
    return {
      hostPluginPath,
      runtimePluginPath,
      runtimeDataRoot,
      pluginManifestPath,
      unsupportedReason: null,
    }
  }

  return {
    hostPluginPath,
    runtimePluginPath: hostPluginPath,
    runtimeDataRoot: store.dataRoot,
    pluginManifestPath,
    unsupportedReason: null,
  }
}

export function buildManagedMemoryBridgeEntry(
  context: ManagedMemoryContext = {}
): ManagedMemoryBridgeEntry | null {
  const paths = resolveBridgeRuntimePaths(context)
  if (!paths.runtimeDataRoot) {
    return null
  }

  return {
    enabled: true,
    config: {
      dataRoot: paths.runtimeDataRoot,
      engine: resolveManagedMemoryStoreContext(context).engine,
      autoCapture: true,
      autoRecall: true,
      inferOnAdd: false,
      recallLimit: 5,
      recallScoreThreshold: 0,
    },
  }
}

export function resolveManagedMemoryBridgeImportModeForTest(
  context: ManagedMemoryContext = {}
): 'host-import' | 'openclaw-reindex' {
  const store = resolveManagedMemoryStoreContext(context)
  return store.runtimeTarget === 'wsl2' ? 'openclaw-reindex' : 'host-import'
}

export function resolveManagedMemoryBridgeImportContextForTest(
  context: ManagedMemoryContext = {},
): ManagedMemoryContext {
  const runtimeSelection =
    context.runtimeSelection
    ?? getClawmasterRuntimeSelection({
      homeDir: context.homeDir,
      settingsPath: context.settingsPath,
      platform: context.platform,
    })
  const hostPlatform = context.platform ?? process.platform
  if (!(hostPlatform === 'win32' && runtimeSelection.mode === 'wsl2')) {
    return context
  }

  const distro =
    runtimeSelection.wslDistro?.trim()
    || resolveSelectedWslDistroSync(runtimeSelection)
  if (!distro) {
    return context
  }

  const profileSelection = context.profileSelection ?? getOpenclawProfileSelection(context)
  let wslHomeDir = getWslHomeDirSync(distro)
  if (wslHomeDir === '/home') {
    const hostUser = context.homeDir ? path.win32.basename(context.homeDir) : ''
    if (hostUser && hostUser !== '.' && hostUser !== '/' && hostUser !== '\\') {
      wslHomeDir = path.posix.join('/home', hostUser)
    }
  }
  const openclawDataRoot =
    getOpenclawDataDirForProfile(profileSelection, {
      homeDir: wslHomeDir,
      platform: 'linux',
    }) ?? path.posix.join(wslHomeDir, '.openclaw')

  return {
    ...context,
    openclawDataRootOverride: wslPathToWindowsUncPath(distro, openclawDataRoot),
  }
}

async function syncManagedMemoryBridgeWorkspaceImport(
  context: ManagedMemoryContext = {}
): Promise<void> {
  const importContext = resolveManagedMemoryBridgeImportContextForTest(context)
  await managedMemoryImportService.importOpenclawWorkspaceMemories(importContext)
  try {
    await memoryOpenclawService.reindexOpenclawMemory()
  } catch (error) {
    if (!shouldIgnoreManagedMemoryBridgeReindexErrorForTest(error)) {
      throw error
    }
  }
}

function normalizeBridgeEntry(value: unknown): ManagedMemoryBridgeEntry | null {
  if (!isRecord(value)) return null
  const config = isRecord(value.config) ? value.config : null
  const dataRoot = typeof config?.dataRoot === 'string' ? config.dataRoot.trim() : ''
  if (!config || !dataRoot) return null
  return {
    enabled: value.enabled !== false,
    config: {
      dataRoot,
      autoCapture: config.autoCapture !== false,
      autoRecall: config.autoRecall !== false,
      inferOnAdd: config.inferOnAdd === true,
      recallLimit:
        typeof config.recallLimit === 'number' && Number.isFinite(config.recallLimit)
          ? Math.max(1, Math.min(100, Math.floor(config.recallLimit)))
          : 5,
      recallScoreThreshold:
        typeof config.recallScoreThreshold === 'number' && Number.isFinite(config.recallScoreThreshold)
          ? Math.max(0, Math.min(1, config.recallScoreThreshold))
          : 0,
      engine: config.engine === 'powermem-seekdb' ? 'powermem-seekdb' : 'powermem-sqlite',
      userId: typeof config.userId === 'string' && config.userId.trim() ? config.userId.trim() : undefined,
      agentId: typeof config.agentId === 'string' && config.agentId.trim() ? config.agentId.trim() : undefined,
    },
  }
}

function getCurrentBridgeState(configRoot: Record<string, unknown>): {
  currentSlotValue: string | null
  currentEntry: ManagedMemoryBridgeEntry | null
} {
  const plugins = isRecord(configRoot.plugins) ? configRoot.plugins : null
  const slots = plugins && isRecord(plugins.slots) ? plugins.slots : null
  const entries = plugins && isRecord(plugins.entries) ? plugins.entries : null
  const currentSlotValue =
    typeof slots?.[MEMORY_BRIDGE_SLOT_KEY] === 'string' ? String(slots[MEMORY_BRIDGE_SLOT_KEY]) : null
  const currentEntry = entries ? normalizeBridgeEntry(entries[MEMORY_BRIDGE_PLUGIN_ID]) : null
  return { currentSlotValue, currentEntry }
}

function bridgeEntriesMatch(left: ManagedMemoryBridgeEntry | null, right: ManagedMemoryBridgeEntry): boolean {
  if (!left) return false
  return (
    left.enabled === right.enabled
    && left.config.dataRoot === right.config.dataRoot
    && left.config.autoCapture === right.config.autoCapture
    && left.config.autoRecall === right.config.autoRecall
    && left.config.inferOnAdd === right.config.inferOnAdd
    && left.config.engine === right.config.engine
    && left.config.recallLimit === right.config.recallLimit
    && left.config.recallScoreThreshold === right.config.recallScoreThreshold
    && left.config.userId === right.config.userId
    && left.config.agentId === right.config.agentId
  )
}

function dirnamePortable(value: string): string {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')) {
    return path.win32.dirname(value)
  }
  return path.posix.dirname(value)
}

function normalizeComparablePluginPath(value: string): string {
  let normalized = value.trim()
  if (!normalized) return ''
  if (/^(global|stock|file):/i.test(normalized)) {
    normalized = normalized.slice(normalized.indexOf(':') + 1).trim()
  }
  const lowerLeaf = path.posix.basename(normalized.replace(/\\/g, '/')).toLowerCase()
  if (lowerLeaf === 'openclaw.plugin.json' || /^index\.[cm]?[jt]s$/i.test(lowerLeaf)) {
    normalized = dirnamePortable(normalized)
  }
  normalized = normalized.replace(/\\/g, '/').replace(/\/+$/, '')
  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = normalized[0]!.toLowerCase() + normalized.slice(1)
  }
  return normalized
}

function resolveInstalledPluginPathCandidate(row: openclawPlugins.OpenClawPluginRow | null): string | null {
  const candidates = [row?.source, row?.description]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (candidate === row?.description) {
      const looksPathLike =
        /^(global|stock|file):/i.test(trimmed)
        || /^[A-Za-z]:[\\/]/.test(trimmed)
        || /^(\/|\.{1,2}\/|~\/)/.test(trimmed)
      if (!looksPathLike) {
        continue
      }
    }
    return trimmed
  }
  return null
}

export function resolveInstalledPluginPath(row: openclawPlugins.OpenClawPluginRow | null): string | null {
  const candidate = resolveInstalledPluginPathCandidate(row)
  if (!candidate) {
    return null
  }
  const normalized = normalizeComparablePluginPath(candidate)
  if (normalized) return normalized
  return null
}

async function getInstalledPluginStatus(): Promise<{
  installed: boolean
  pluginStatus: string | null
  installedPluginPath: string | null
}> {
  try {
    const { rows } = await openclawPlugins.listOpenclawPlugins()
    const plugin = rows.find((row) => row.id === MEMORY_BRIDGE_PLUGIN_ID) ?? null
    return {
      installed: Boolean(plugin),
      pluginStatus: plugin?.status ?? null,
      installedPluginPath: resolveInstalledPluginPath(plugin),
    }
  } catch {
    return {
      installed: false,
      pluginStatus: null,
      installedPluginPath: null,
    }
  }
}

export function isManagedMemoryBridgePluginReady(pluginStatus: string | null): boolean {
  const normalized = pluginStatus?.trim().toLowerCase()
  return normalized ? READY_PLUGIN_STATUSES.has(normalized) : false
}

export function getManagedMemoryBridgePluginIssue(
  installed: boolean,
  pluginStatus: string | null,
): string | null {
  if (!installed) {
    return `${MEMORY_BRIDGE_PLUGIN_ID} is not installed in OpenClaw yet.`
  }
  if (isManagedMemoryBridgePluginReady(pluginStatus)) {
    return null
  }
  if (pluginStatus) {
    return `${MEMORY_BRIDGE_PLUGIN_ID} is installed but currently ${pluginStatus}.`
  }
  return `${MEMORY_BRIDGE_PLUGIN_ID} is installed but its runtime status is unknown.`
}

export function getManagedMemoryBridgePluginPathIssue(
  installed: boolean,
  installedPluginPath: string | null,
  runtimePluginPath: string | null,
): string | null {
  if (!installed || !runtimePluginPath) {
    return null
  }
  if (!installedPluginPath) {
    return `${MEMORY_BRIDGE_PLUGIN_ID} is installed but its linked source path is unknown.`
  }
  const normalizedInstalledPluginPath = normalizeComparablePluginPath(installedPluginPath)
  const normalizedRuntimePluginPath = normalizeComparablePluginPath(runtimePluginPath)
  return normalizedInstalledPluginPath === normalizedRuntimePluginPath
    ? null
    : `${MEMORY_BRIDGE_PLUGIN_ID} is linked to ${normalizedInstalledPluginPath} instead of ${normalizedRuntimePluginPath}.`
}

export async function getManagedMemoryBridgeStatusPayload(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryBridgeStatusPayload> {
  const store = resolveManagedMemoryStoreContext(context)
  const paths = resolveBridgeRuntimePaths(context)
  const desiredEntry = buildManagedMemoryBridgeEntry(context)
  const configRoot = readConfigJsonOrEmpty()
  const { currentSlotValue, currentEntry } = getCurrentBridgeState(configRoot)
  const pluginPathExists = await fs
    .stat(paths.pluginManifestPath)
    .then(() => true)
    .catch(() => false)
  const { installed, pluginStatus, installedPluginPath } = await getInstalledPluginStatus()
  const issues: string[] = []

  if (paths.unsupportedReason) {
    issues.push(paths.unsupportedReason)
  }
  if (!pluginPathExists) {
    issues.push('The managed PowerMem plugin files are missing from the ClawMaster package.')
  }
  const pluginIssue = getManagedMemoryBridgePluginIssue(installed, pluginStatus)
  if (pluginIssue) {
    issues.push(pluginIssue)
  }
  const pluginPathIssue = getManagedMemoryBridgePluginPathIssue(
    installed,
    installedPluginPath,
    paths.runtimePluginPath,
  )
  if (pluginPathIssue) {
    issues.push(pluginPathIssue)
  }
  if (currentSlotValue !== MEMORY_BRIDGE_PLUGIN_ID) {
    issues.push(`plugins.slots.${MEMORY_BRIDGE_SLOT_KEY} is not set to ${MEMORY_BRIDGE_PLUGIN_ID}`)
  }
  if (!currentEntry) {
    issues.push(`plugins.entries.${MEMORY_BRIDGE_PLUGIN_ID} is missing or invalid`)
  } else if (desiredEntry && !bridgeEntriesMatch(currentEntry, desiredEntry)) {
    issues.push(`plugins.entries.${MEMORY_BRIDGE_PLUGIN_ID} does not match the ClawMaster-managed config`)
  }

  const state: ManagedMemoryBridgeStatusPayload['state'] =
    paths.unsupportedReason || !pluginPathExists
      ? 'unsupported'
      : desiredEntry
        && installed
        && isManagedMemoryBridgePluginReady(pluginStatus)
        && !pluginPathIssue
        && currentEntry
        && currentSlotValue === MEMORY_BRIDGE_PLUGIN_ID
        && bridgeEntriesMatch(currentEntry, desiredEntry)
        ? 'ready'
        : currentEntry || currentSlotValue || installed
          ? 'drifted'
          : 'missing'

  return {
    pluginId: MEMORY_BRIDGE_PLUGIN_ID,
    slotKey: MEMORY_BRIDGE_SLOT_KEY,
    state,
    issues,
    installed,
    pluginStatus,
    installedPluginPath,
    runtimePluginPath: paths.runtimePluginPath,
    pluginPath: paths.hostPluginPath,
    pluginPathExists,
    store,
    currentSlotValue,
    currentEntry,
    desired: {
      slotValue: MEMORY_BRIDGE_PLUGIN_ID,
      entry: desiredEntry,
    },
  }
}

export async function syncManagedMemoryBridge(
  context: ManagedMemoryContext = {}
): Promise<ManagedMemoryBridgeStatusPayload> {
  const paths = resolveBridgeRuntimePaths(context)
  const desiredEntry = buildManagedMemoryBridgeEntry(context)
  const { installed, installedPluginPath } = await getInstalledPluginStatus()

  if (!desiredEntry || !paths.runtimePluginPath) {
    throw new Error(paths.unsupportedReason ?? 'Managed PowerMem plugin runtime path is unavailable')
  }

  await fs.stat(paths.pluginManifestPath)
  const pathIssue = getManagedMemoryBridgePluginPathIssue(
    installed,
    installedPluginPath,
    paths.runtimePluginPath,
  )
  if (installed && pathIssue) {
    await openclawPlugins.setOpenclawPluginEnabled(MEMORY_BRIDGE_PLUGIN_ID, false).catch(() => undefined)
    await openclawPlugins.uninstallOpenclawPlugin(MEMORY_BRIDGE_PLUGIN_ID, true, {
      disableLoadedFirst: true,
    })
  }
  if (!installed || pathIssue) {
    await openclawPlugins.installOpenclawPluginFromPath(paths.runtimePluginPath, { link: true })
  }
  await updateConfigJson((config) => {
    setConfigAtPath(config, `plugins.slots.${MEMORY_BRIDGE_SLOT_KEY}`, MEMORY_BRIDGE_PLUGIN_ID)
    setConfigAtPath(config, `plugins.entries.${MEMORY_BRIDGE_PLUGIN_ID}`, desiredEntry)
  })
  if (installed && !pathIssue) {
    await openclawPlugins.setOpenclawPluginEnabled(MEMORY_BRIDGE_PLUGIN_ID, false).catch(() => undefined)
  }
  await openclawPlugins.setOpenclawPluginEnabled(MEMORY_BRIDGE_PLUGIN_ID, true)
  await syncManagedMemoryBridgeWorkspaceImport(context)
  return getManagedMemoryBridgeStatusPayload(context)
}
