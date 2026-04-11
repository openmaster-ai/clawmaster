import { readConfigJsonOrEmpty, setConfigAtPath, updateConfigJson } from '../configJson.js'
import { getOpenclawConfigResolution } from '../paths.js'
import {
  readOptionalRuntimeTextFileSync,
  readRequiredRuntimeTextFileSync,
  resolveRuntimePathSync,
  writeRuntimeTextFileSync,
} from '../runtimeFs.js'

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

export interface McpImportCandidate {
  id: string
  format: 'json' | 'toml'
  path: string
  exists: boolean
}

const MCP_IMPORT_SOURCE_DEFINITIONS: Array<{
  id: string
  format: 'json' | 'toml'
  relativePath?: string
  homePath?: string
}> = [
  { id: 'project-mcp', format: 'json', relativePath: '.mcp.json' },
  { id: 'cursor', format: 'json', relativePath: '.cursor/mcp.json' },
  { id: 'vscode', format: 'json', relativePath: '.vscode/mcp.json' },
  { id: 'claude-user', format: 'json', homePath: '.claude.json' },
  { id: 'codex-user', format: 'toml', homePath: '.codex/config.toml' },
  { id: 'copilot-user', format: 'json', homePath: '.copilot/mcp-config.json' },
]

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

function getOpenclawRuntimePaths(): { configPath: string; registryPath: string } {
  const resolution = getOpenclawConfigResolution()
  return {
    configPath: resolution.configPath,
    registryPath: `${resolution.dataDir.replace(/[\\/]+$/, '')}/mcp.json`,
  }
}

function readJsonFile(pathInput: string): unknown | null {
  try {
    const raw = readOptionalRuntimeTextFileSync(pathInput)
    if (!raw.exists || !raw.content.trim()) return null
    return JSON.parse(raw.content) as unknown
  } catch {
    return null
  }
}

function readManagedMcpRegistry(): McpServersMap {
  return normalizeMcpServerMap(readJsonFile(getOpenclawRuntimePaths().registryPath))
}

function readOpenClawMcpServers(): McpServersMap {
  return normalizeMcpServerMap(readConfigJsonOrEmpty())
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
  const runtimeServers = serializeEnabledServersForOpenClaw(servers)
  await updateConfigJson((config) => {
    if (Object.keys(runtimeServers).length > 0) {
      const currentMcp = isRecord(config.mcp) ? { ...config.mcp } : {}
      currentMcp.servers = runtimeServers
      config.mcp = currentMcp
      return
    }

    if (isRecord(config.mcp)) {
      const currentMcp = { ...config.mcp }
      delete currentMcp.servers
      if (Object.keys(currentMcp).length > 0) {
        config.mcp = currentMcp
      } else {
        delete config.mcp
      }
    }
  })
}

async function writeManagedMcpRegistry(servers: McpServersMap): Promise<void> {
  const { registryPath } = getOpenclawRuntimePaths()
  writeRuntimeTextFileSync(registryPath, JSON.stringify({ mcpServers: servers }, null, 2))
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

  await updateConfigJson((config) => {
    setConfigAtPath(config, 'plugins.entries.openclaw-mcp-bridge.config', {
      servers: bridgeServers,
    })
  })
}

export function getMcpServersState(): McpServersMap {
  const managed = readManagedMcpRegistry()
  const runtime = readOpenClawMcpServers()
  if (Object.keys(runtime).length === 0) return managed
  if (Object.keys(managed).length === 0) return runtime
  return mergeManagedAndRuntimeServers(managed, runtime)
}

export async function persistMcpServers(servers: McpServersMap): Promise<void> {
  await writeManagedMcpRegistry(servers)
  await writeOpenClawConfig(servers)
  await syncToBridge(servers)
}

export function listMcpImportCandidatesState(): McpImportCandidate[] {
  return MCP_IMPORT_SOURCE_DEFINITIONS.map((definition) => {
    const input = definition.relativePath ?? `~/${definition.homePath}`
    const resolvedPath = resolveRuntimePathSync(input)
    const candidate = readOptionalRuntimeTextFileSync(input)
    return {
      id: definition.id,
      format: definition.format,
      path: resolvedPath,
      exists: candidate.exists,
    }
  })
}

export function readMcpImportFile(pathInput: string): { path: string; content: string } {
  return readRequiredRuntimeTextFileSync(pathInput)
}
