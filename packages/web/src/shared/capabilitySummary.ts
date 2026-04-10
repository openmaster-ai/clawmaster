import type { PluginsListPayload, SkillInfo } from '@/lib/types'
import type { McpServersMap } from '@/shared/adapters/mcp'

export function isPluginEnabledStatus(status?: string): boolean {
  const normalized = status?.trim().toLowerCase() ?? ''
  if (!normalized) return false
  if (/\bdisabled\b/.test(normalized) || /\boff\b/.test(normalized)) return false
  return /\benabled\b/.test(normalized) || /\bactive\b/.test(normalized) || /\bloaded\b/.test(normalized)
}

export function getEnabledPluginCount(pluginsPayload: PluginsListPayload | null | undefined): number {
  return (pluginsPayload?.plugins ?? []).filter((plugin) => isPluginEnabledStatus(plugin.status)).length
}

export function getEnabledSkillCount(skills: SkillInfo[]): number {
  return skills.filter((skill) => skill.disabled !== true).length
}

export function getReadySkillCount(skills: SkillInfo[]): number {
  return skills.filter((skill) => skill.disabled !== true && skill.eligible !== false).length
}

export function getInstalledMcpCount(mcpServers: McpServersMap | null | undefined): number {
  return Object.keys(mcpServers ?? {}).length
}

export function getEnabledMcpCount(mcpServers: McpServersMap | null | undefined): number {
  return Object.values(mcpServers ?? {}).filter((server) => server.enabled !== false).length
}
