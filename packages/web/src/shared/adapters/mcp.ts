/**
 * MCP 适配器
 *
 * 管理 MCP (Model Context Protocol) 服务器的配置、安装和卸载
 * 配置存储在 ~/.openclaw/mcp.json（独立文件，OpenClaw 主配置有严格 schema 验证）
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

// ─── 类型定义 ───

export interface McpServerConfig {
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

export type McpServersMap = Record<string, McpServerConfig>

// ─── 配置文件路径 ───

const MCP_CONFIG_PATH = '~/.openclaw/mcp.json'
const TEMP = '${TMPDIR:-/tmp}'

// ─── 配置读写 ───

export function getMcpServers(): Promise<AdapterResult<McpServersMap>> {
  return wrapAsync(async () => {
    try {
      const raw = await execCommand('bash', ['-c', `cat ${MCP_CONFIG_PATH} 2>/dev/null`])
      const data = JSON.parse(raw)
      const servers = data.mcpServers ?? data
      const result: McpServersMap = {}
      for (const [id, cfg] of Object.entries(servers as Record<string, any>)) {
        result[id] = {
          command: cfg.command ?? 'npx',
          args: Array.isArray(cfg.args) ? cfg.args : [],
          env: cfg.env && typeof cfg.env === 'object' ? cfg.env : {},
          enabled: cfg.enabled !== false,
        }
      }
      return result
    } catch {
      return {}
    }
  })
}

function writeMcpConfig(servers: McpServersMap): Promise<void> {
  const json = JSON.stringify({ mcpServers: servers }, null, 2)
  return execCommand('bash', [
    '-c',
    `cat > ${MCP_CONFIG_PATH} << 'MCPEOF'\n${json}\nMCPEOF`,
  ]).then(() => {})
}

/** Sync MCP servers to the OpenClaw MCP bridge plugin config */
async function syncToBridge(servers: McpServersMap): Promise<void> {
  // Convert to bridge format: add transport: "stdio" for each entry
  const bridgeServers: Record<string, any> = {}
  for (const [id, cfg] of Object.entries(servers)) {
    if (!cfg.enabled) continue
    bridgeServers[id] = {
      transport: 'stdio',
      command: cfg.command,
      args: cfg.args,
      env: cfg.env,
    }
  }
  const batchJson = JSON.stringify([{
    path: 'plugins.entries.openclaw-mcp-bridge.config',
    value: { servers: bridgeServers },
  }])
  try {
    await execCommand('bash', [
      '-c',
      `cat > ${TEMP}/.openclaw-mcp-bridge.json << 'CLAWEOF'\n${batchJson}\nCLAWEOF\nopenclaw config set --batch-file ${TEMP}/.openclaw-mcp-bridge.json --strict-json && rm -f ${TEMP}/.openclaw-mcp-bridge.json`,
    ])
  } catch {
    // Bridge plugin not installed — skip silently
  }
}

// ─── 包管理 ───

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

// ─── 高级操作 ───

export function addMcpServer(
  id: string,
  config: McpServerConfig,
  pkg: string,
): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    // Step 1: Install npm package globally
    await execCommand('npm', ['install', '-g', pkg])
    // Step 2: Read current config, merge, write
    let current: McpServersMap = {}
    try {
      const raw = await execCommand('bash', ['-c', `cat ${MCP_CONFIG_PATH} 2>/dev/null`])
      const data = JSON.parse(raw)
      current = data.mcpServers ?? data
    } catch { /* file doesn't exist */ }
    current[id] = config
    await writeMcpConfig(current)
    await syncToBridge(current)
    return 'installed'
  })
}

export function removeMcpServer(id: string, pkg?: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    let current: McpServersMap = {}
    try {
      const raw = await execCommand('bash', ['-c', `cat ${MCP_CONFIG_PATH} 2>/dev/null`])
      const data = JSON.parse(raw)
      current = data.mcpServers ?? data
    } catch { /* nothing to remove */ }
    delete current[id]
    await writeMcpConfig(current)
    await syncToBridge(current)
    if (pkg) {
      try { await execCommand('npm', ['uninstall', '-g', pkg]) } catch { /* best-effort */ }
    }
    return 'removed'
  })
}

export function toggleMcpServer(id: string, enabled: boolean): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    let current: McpServersMap = {}
    try {
      const raw = await execCommand('bash', ['-c', `cat ${MCP_CONFIG_PATH} 2>/dev/null`])
      const data = JSON.parse(raw)
      current = data.mcpServers ?? data
    } catch { return 'not found' }
    if (!current[id]) return 'not found'
    current[id].enabled = enabled
    await writeMcpConfig(current)
    await syncToBridge(current)
    return enabled ? 'enabled' : 'disabled'
  })
}
