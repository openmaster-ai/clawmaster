/**
 * MCP adapter
 *
 * Manages MCP (Model Context Protocol) server configuration for both:
 * - ClawMaster's richer management registry (~/.openclaw/mcp.json), which keeps
 *   UI-only metadata such as enabled state and import/source info.
 * - OpenClaw's runtime registry (~/.openclaw/openclaw.json -> mcp.servers),
 *   which only receives enabled servers in the format OpenClaw actually loads.
 */

import { execCommand } from './platform'
import { getIsTauri } from './platform'
import { detectSystemResult } from './system'
import { tauriInvoke } from './invoke'
import { getConfigResult, saveFullConfigResult, setConfigResult } from './openclaw'
import { wrapAsync, type AdapterResult } from './types'
import { parseImportedMcpServers, type McpImportCandidate } from './mcpImport'
import { webFetchJson, webFetchVoid } from './webHttp'

export type McpTransport = 'stdio' | 'http' | 'sse'
export type McpServerSource = 'catalog' | 'manual' | 'import'

export interface McpServerMeta {
  source?: McpServerSource
  importPath?: string
  managedPackage?: string
}

interface McpServerBase {
  enabled: boolean
  env: Record<string, string>
  meta?: McpServerMeta
}

export interface McpStdioServerConfig extends McpServerBase {
  transport?: 'stdio'
  command: string
  args: string[]
}

export interface McpRemoteServerConfig extends McpServerBase {
  transport: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpStdioServerConfig | McpRemoteServerConfig
export type McpServersMap = Record<string, McpServerConfig>

export interface McpImportSummary {
  path: string
  importedIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRemoteConfig(config: McpServerConfig): config is McpRemoteServerConfig {
  return config.transport === 'http' || config.transport === 'sse'
}

function mergeMeta(
  current: McpServerMeta | undefined,
  incoming: McpServerMeta | undefined,
): McpServerMeta | undefined {
  if (!current && !incoming) return undefined
  return {
    ...current,
    ...incoming,
  }
}

function normalizeMcpConfig(config: unknown): McpServerConfig | null {
  if (!isRecord(config)) return null

  const enabled = config.enabled !== false
  const env = isRecord(config.env)
    ? Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, String(value)]))
    : {}
  const meta = isRecord(config.meta)
    ? {
        source: typeof config.meta.source === 'string' ? config.meta.source as McpServerSource : undefined,
        importPath: typeof config.meta.importPath === 'string' ? config.meta.importPath : undefined,
        managedPackage: typeof config.meta.managedPackage === 'string' ? config.meta.managedPackage : undefined,
      }
    : undefined

  if ((config.transport === 'http' || config.transport === 'sse') && typeof config.url === 'string') {
    return {
      transport: config.transport,
      url: config.url,
      headers: isRecord(config.headers)
        ? Object.fromEntries(Object.entries(config.headers).map(([key, value]) => [key, String(value)]))
        : {},
      env,
      enabled,
      meta,
    }
  }

  if (typeof config.url === 'string') {
    return {
      transport: 'http',
      url: config.url,
      headers: isRecord(config.headers)
        ? Object.fromEntries(Object.entries(config.headers).map(([key, value]) => [key, String(value)]))
        : {},
      env,
      enabled,
      meta,
    }
  }

  if (typeof config.command !== 'string') return null

  return {
    transport: 'stdio',
    command: config.command,
    args: Array.isArray(config.args) ? config.args.map((value) => String(value)) : [],
    env,
    enabled,
    meta,
  }
}

function normalizeMcpServerMap(value: unknown): McpServersMap {
  const servers = isRecord(value) && isRecord(value.mcpServers)
    ? value.mcpServers
    : isRecord(value) && isRecord(value.mcp) && isRecord(value.mcp.servers)
      ? value.mcp.servers
      : value

  if (!isRecord(servers)) return {}

  const result: McpServersMap = {}
  for (const [id, config] of Object.entries(servers)) {
    const normalized = normalizeMcpConfig(config)
    if (normalized) {
      result[id] = normalized
    }
  }
  return result
}

async function readJsonFile(path: string): Promise<unknown | null> {
  if (!getIsTauri()) {
    const result = await webFetchJson<{ path: string; content: string }>('/api/mcp/read-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!result.success || !result.data?.content?.trim()) return null
    return JSON.parse(result.data.content) as unknown
  }
  try {
    const parsed = await tauriInvoke<{ exists?: boolean; content?: string }>('read_runtime_text_file', {
      pathInput: path,
    })
    if (!parsed.exists || !parsed.content?.trim()) return null
    return JSON.parse(parsed.content) as unknown
  } catch {
    return null
  }
}

async function readManagedMcpRegistry(): Promise<McpServersMap> {
  const data = await readJsonFile((await getOpenclawRuntimePaths()).registryPath)
  return normalizeMcpServerMap(data)
}

async function readOpenClawMcpServers(): Promise<McpServersMap> {
  const data = await readJsonFile((await getOpenclawRuntimePaths()).configPath)
  return normalizeMcpServerMap(data)
}

function mergeManagedAndRuntimeServers(
  managed: McpServersMap,
  runtime: McpServersMap,
): McpServersMap {
  const merged: McpServersMap = { ...managed }

  for (const [id, config] of Object.entries(runtime)) {
    const current = merged[id]
    merged[id] = {
      ...config,
      enabled: true,
      meta: mergeMeta(current?.meta, config.meta),
    }
  }

  return merged
}

async function readCurrentMcpConfig(): Promise<McpServersMap> {
  const managed = await readManagedMcpRegistry()
  const runtime = await readOpenClawMcpServers()
  if (Object.keys(runtime).length === 0) return managed
  if (Object.keys(managed).length === 0) return runtime
  return mergeManagedAndRuntimeServers(managed, runtime)
}

async function loadCurrentMcpConfig(): Promise<McpServersMap> {
  if (getIsTauri()) {
    return readCurrentMcpConfig()
  }
  const result = await webFetchJson<McpServersMap>('/api/mcp/servers')
  if (!result.success || !result.data) {
    throw new Error(result.error ?? 'Failed to load MCP servers')
  }
  return result.data
}

async function getOpenclawRuntimePaths(): Promise<{ configPath: string; registryPath: string }> {
  const result = await detectSystemResult()
  const configPath = result.success && result.data?.openclaw.configPath
    ? result.data.openclaw.configPath
    : '~/.openclaw/openclaw.json'
  const dataDir = result.success && result.data?.openclaw.dataDir
    ? result.data.openclaw.dataDir
    : configPath.replace(/[/\\]openclaw\.json$/, '')

  return {
    configPath,
    registryPath: `${dataDir.replace(/[\\/]+$/, '')}/mcp.json`,
  }
}

async function writeManagedMcpRegistry(servers: McpServersMap): Promise<void> {
  if (!getIsTauri()) {
    const result = await webFetchVoid('/api/mcp/servers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(servers),
    })
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to persist MCP servers')
    }
    return
  }
  const { registryPath } = await getOpenclawRuntimePaths()
  await tauriInvoke('write_runtime_text_file', {
    pathInput: registryPath,
    content: JSON.stringify({ mcpServers: servers }, null, 2),
  })
}

function serializeEnabledServersForOpenClaw(servers: McpServersMap): Record<string, Record<string, unknown>> {
  const runtimeServers: Record<string, Record<string, unknown>> = {}

  for (const [id, config] of Object.entries(servers)) {
    if (!config.enabled) continue

    if (isRemoteConfig(config)) {
      runtimeServers[id] = {
        url: config.url,
        headers: config.headers ?? {},
        ...(config.transport === 'sse' ? { transport: 'sse' } : { transport: 'streamable-http' }),
      }
      continue
    }

    runtimeServers[id] = {
      command: config.command,
      args: config.args,
      env: config.env,
    }
  }

  return runtimeServers
}

async function writeOpenClawConfig(servers: McpServersMap): Promise<void> {
  if (!getIsTauri()) {
    return
  }
  const runtimeServers = serializeEnabledServersForOpenClaw(servers)
  const configResult = await getConfigResult()
  if (!configResult.success) {
    throw new Error(configResult.error ?? 'Failed to load OpenClaw config')
  }
  const nextConfig = { ...(configResult.data ?? {}) } as Record<string, unknown>
  const currentMcp = isRecord(nextConfig.mcp) ? { ...nextConfig.mcp } : {}
  if (Object.keys(runtimeServers).length > 0) {
    currentMcp.servers = runtimeServers
    nextConfig.mcp = currentMcp
  } else if (Object.keys(currentMcp).length > 0) {
    delete currentMcp.servers
    if (Object.keys(currentMcp).length > 0) {
      nextConfig.mcp = currentMcp
    } else {
      delete nextConfig.mcp
    }
  } else {
    delete nextConfig.mcp
  }

  const saveResult = await saveFullConfigResult(nextConfig)
  if (!saveResult.success) {
    throw new Error(saveResult.error ?? 'Failed to save OpenClaw config')
  }
}

async function persistMcpConfig(servers: McpServersMap): Promise<void> {
  if (!getIsTauri()) {
    const result = await webFetchVoid('/api/mcp/servers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(servers),
    })
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to persist MCP servers')
    }
    return
  }
  await writeManagedMcpRegistry(servers)
  await writeOpenClawConfig(servers)
  await syncToBridge(servers)
}

async function syncToBridge(servers: McpServersMap): Promise<void> {
  const bridgeServers: Record<string, Record<string, unknown>> = {}

  for (const [id, config] of Object.entries(servers)) {
    if (!config.enabled) continue

    if (isRemoteConfig(config)) {
      bridgeServers[id] = {
        transport: config.transport,
        url: config.url,
        headers: config.headers ?? {},
      }
      continue
    }

    bridgeServers[id] = {
      transport: 'stdio',
      command: config.command,
      args: config.args,
      env: config.env,
    }
  }

  try {
    const result = await setConfigResult('plugins.entries.openclaw-mcp-bridge.config', {
      servers: bridgeServers,
    })
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to sync MCP bridge config')
    }
  } catch {
    // Bridge plugin not installed. Skip silently.
  }
}

function writeMcpConfig(servers: McpServersMap): Promise<void> {
  return persistMcpConfig(servers)
}

async function readTextFile(pathInput: string): Promise<{ path: string; content: string }> {
  if (!getIsTauri()) {
    const result = await webFetchJson<{ path: string; content: string }>('/api/mcp/read-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathInput }),
    })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to read MCP import file')
    }
    return result.data
  }
  return tauriInvoke<{ path: string; content: string }>('read_required_runtime_text_file', {
    pathInput,
  })
}

function mergeImportedServers(current: McpServersMap, imported: McpServersMap): { merged: McpServersMap; importedIds: string[] } {
  const merged = { ...current }
  const importedIds: string[] = []

  for (const [baseId, config] of Object.entries(imported)) {
    let nextId = baseId.trim()
    if (!nextId) continue
    let index = 2
    while (merged[nextId]) {
      nextId = `${baseId}-${index}`
      index += 1
    }
    merged[nextId] = config
    importedIds.push(nextId)
  }

  return { merged, importedIds }
}

export function getMcpServers(): Promise<AdapterResult<McpServersMap>> {
  if (!getIsTauri()) {
    return webFetchJson<McpServersMap>('/api/mcp/servers')
  }
  return wrapAsync(async () => readCurrentMcpConfig())
}

export function listMcpImportCandidates(): Promise<AdapterResult<McpImportCandidate[]>> {
  if (!getIsTauri()) {
    return webFetchJson<McpImportCandidate[]>('/api/mcp/import-candidates')
  }
  return wrapAsync(async () => tauriInvoke<McpImportCandidate[]>('list_mcp_import_candidates'))
}

export function importMcpServers(pathInput: string): Promise<AdapterResult<McpImportSummary>> {
  return wrapAsync(async () => {
    const { path, content } = await readTextFile(pathInput)
    const imported = parseImportedMcpServers(content, path, path.endsWith('.toml') ? 'toml' : 'json')
    const currentServers = await loadCurrentMcpConfig()
    const { merged, importedIds } = mergeImportedServers(currentServers, imported)

    await writeMcpConfig(merged)

    return {
      path,
      importedIds,
    }
  })
}

export function installMcpPackage(pkg: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('npm', ['install', '-g', pkg])
    return raw.trim()
  })
}

export function uninstallMcpPackage(pkg: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('npm', ['uninstall', '-g', pkg])
    return raw.trim()
  })
}

export function checkMcpPackage(pkg: string): Promise<AdapterResult<boolean>> {
  return wrapAsync(async () => {
    try {
      await execCommand('npm', ['ls', '-g', pkg, '--json'])
      return true
    } catch {
      return false
    }
  })
}

export function addMcpServer(
  id: string,
  config: McpServerConfig,
  pkg?: string,
): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    if (pkg) {
      await execCommand('npm', ['install', '-g', pkg])
    }

    const currentServers = await loadCurrentMcpConfig()
    currentServers[id] = config
    await writeMcpConfig(currentServers)
    return 'installed'
  })
}

export function removeMcpServer(id: string, pkg?: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const currentServers = await loadCurrentMcpConfig()
    delete currentServers[id]
    await writeMcpConfig(currentServers)

    if (pkg) {
      try {
        await execCommand('npm', ['uninstall', '-g', pkg])
      } catch {
        // Best effort cleanup only.
      }
    }

    return 'removed'
  })
}

export function toggleMcpServer(id: string, enabled: boolean): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const currentServers = await loadCurrentMcpConfig()
    if (!currentServers[id]) return 'not found'
    currentServers[id].enabled = enabled
    await writeMcpConfig(currentServers)
    return enabled ? 'enabled' : 'disabled'
  })
}
