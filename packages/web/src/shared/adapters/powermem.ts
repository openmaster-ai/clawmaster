/**
 * PowerMem 适配器
 *
 * 封装 pmem CLI 和 openclaw ltm 命令的 --json 输出
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

// ─── 类型定义 ───

export interface MemoryEntry {
  id: string
  content: string
  agent_id?: string
  importance?: 'low' | 'medium' | 'high'
  created_at: string
  updated_at?: string
  retention?: number  // 0-1 Ebbinghaus retention score
  scope?: string
  metadata?: Record<string, unknown>
}

export interface MemorySearchResult {
  entries: MemoryEntry[]
  total: number
}

export interface MemoryStats {
  total: number
  by_agent: Record<string, number>
  avg_retention?: number
  storage_engine?: string
}

export interface MemoryHealth {
  status: 'ok' | 'error' | 'disconnected'
  message?: string
  total_memories?: number
  storage?: string
  agent_count?: number
}

// ─── API 函数 ───

export function getMemoryHealth(): Promise<AdapterResult<MemoryHealth>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['ltm', 'health', '--json'])
    return JSON.parse(raw)
  })
}

export function listMemories(
  agentId?: string,
  limit = 50,
  offset = 0,
): Promise<AdapterResult<MemorySearchResult>> {
  return wrapAsync(async () => {
    const args = ['memory', 'list', '--json', '--limit', String(limit), '--offset', String(offset)]
    if (agentId) args.push('--agent-id', agentId)
    const raw = await execCommand('pmem', args)
    const data = JSON.parse(raw)
    // pmem 可能返回数组或 { entries, total } 结构
    if (Array.isArray(data)) {
      return { entries: data, total: data.length }
    }
    return { entries: data.entries ?? data.results ?? [], total: data.total ?? data.count ?? 0 }
  })
}

export function searchMemories(
  query: string,
  agentId?: string,
  limit = 20,
): Promise<AdapterResult<MemorySearchResult>> {
  return wrapAsync(async () => {
    const args = ['memory', 'search', query, '--json', '--limit', String(limit)]
    if (agentId) args.push('--agent-id', agentId)
    const raw = await execCommand('pmem', args)
    const data = JSON.parse(raw)
    if (Array.isArray(data)) {
      return { entries: data, total: data.length }
    }
    return { entries: data.entries ?? data.results ?? [], total: data.total ?? data.count ?? 0 }
  })
}

export function deleteMemory(id: string): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    await execCommand('pmem', ['memory', 'delete', id, '--yes'])
  })
}

export function getMemoryStats(): Promise<AdapterResult<MemoryStats>> {
  return wrapAsync(async () => {
    const raw = await execCommand('pmem', ['stats', '--json'])
    return JSON.parse(raw)
  })
}

export function getAgentIds(): Promise<AdapterResult<string[]>> {
  return wrapAsync(async () => {
    // 尝试从 stats 中提取 agent 列表
    const raw = await execCommand('pmem', ['stats', '--json'])
    const data = JSON.parse(raw)
    if (data.by_agent) return Object.keys(data.by_agent)
    if (data.agents) return data.agents
    return []
  })
}
