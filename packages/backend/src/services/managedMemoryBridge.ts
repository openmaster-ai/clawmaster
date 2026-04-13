import fsSync from 'node:fs'
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
import {
  installOpenclawPluginFromPath,
  listOpenclawPlugins,
  setOpenclawPluginEnabled,
} from './openclawPlugins.js'

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

export function resolveManagedMemoryPluginRootPath(): string {
  const packagedRoot = process.env[PACKAGED_PLUGIN_ROOT_ENV]?.trim()
  if (packagedRoot) {
    const manifestPath = path.join(packagedRoot, 'openclaw.plugin.json')
    if (fsSync.existsSync(manifestPath)) {
      return packagedRoot
    }
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

async function getInstalledPluginStatus(): Promise<{ installed: boolean; pluginStatus: string | null }> {
  try {
    const { rows } = await listOpenclawPlugins()
    const plugin = rows.find((row) => row.id === MEMORY_BRIDGE_PLUGIN_ID) ?? null
    return {
      installed: Boolean(plugin),
      pluginStatus: plugin?.status ?? null,
    }
  } catch {
    return {
      installed: false,
      pluginStatus: null,
    }
  }
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
  const { installed, pluginStatus } = await getInstalledPluginStatus()
  const issues: string[] = []

  if (paths.unsupportedReason) {
    issues.push(paths.unsupportedReason)
  }
  if (!pluginPathExists) {
    issues.push('The managed PowerMem plugin files are missing from the ClawMaster package.')
  }
  if (!installed) {
    issues.push(`${MEMORY_BRIDGE_PLUGIN_ID} is not installed in OpenClaw yet.`)
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
    paths.unsupportedReason
      ? 'unsupported'
      : desiredEntry && installed && currentEntry && currentSlotValue === MEMORY_BRIDGE_PLUGIN_ID && bridgeEntriesMatch(currentEntry, desiredEntry)
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
  const { installed } = await getInstalledPluginStatus()

  if (!desiredEntry || !paths.runtimePluginPath) {
    throw new Error(paths.unsupportedReason ?? 'Managed PowerMem plugin runtime path is unavailable')
  }

  await fs.stat(paths.pluginManifestPath)
  if (!installed) {
    await installOpenclawPluginFromPath(paths.runtimePluginPath, { link: true })
  }
  await setOpenclawPluginEnabled(MEMORY_BRIDGE_PLUGIN_ID, true).catch(() => undefined)
  await updateConfigJson((config) => {
    setConfigAtPath(config, `plugins.slots.${MEMORY_BRIDGE_SLOT_KEY}`, MEMORY_BRIDGE_PLUGIN_ID)
    setConfigAtPath(config, `plugins.entries.${MEMORY_BRIDGE_PLUGIN_ID}`, desiredEntry)
  })
  return getManagedMemoryBridgeStatusPayload(context)
}
