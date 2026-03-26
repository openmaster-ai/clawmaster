/**
 * PowerMem 适配器
 *
 * 优先通过 HTTP API (localhost:8000) 获取丰富数据
 * 降级到 CLI (pmem / openclaw ltm) 做基础操作
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

// ─── 配置 ───

const POWERMEM_BASE_URL = 'http://localhost:8000'

async function pmemFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${POWERMEM_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`PowerMem API ${res.status}: ${body}`)
  }
  const json = await res.json()
  // PowerMem API 返回 { success, data, message } 或直接返回数据
  return json.data !== undefined ? json.data : json
}

// ─── 类型定义 ───

/** 记忆的智能元数据（Ebbinghaus 遗忘曲线） */
export interface MemoryIntelligence {
  importance_score: number
  memory_type: 'working' | 'short_term' | 'long_term'
  initial_retention: number
  decay_rate: number
  current_retention: number
  next_review?: string
  review_schedule?: string[]
  last_reviewed?: string
  review_count: number
  access_count: number
  reinforcement_factor: number
}

/** 记忆管理标志 */
export interface MemoryManagement {
  should_promote: boolean
  should_forget: boolean
  should_archive: boolean
  is_active: boolean
}

/** 完整记忆条目 */
export interface MemoryEntry {
  id: string
  memory: string
  user_id?: string
  agent_id?: string
  run_id?: string
  created_at: string
  updated_at?: string
  metadata?: {
    intelligence?: MemoryIntelligence
    memory_management?: MemoryManagement
    [key: string]: unknown
  }
}

/** 搜索结果条目 */
export interface MemorySearchItem {
  memory_id: string
  memory?: string
  content?: string
  score: number
  metadata?: MemoryEntry['metadata']
}

export interface MemoryListResult {
  memories: MemoryEntry[]
  total: number
}

export interface MemorySearchResult {
  results: MemorySearchItem[]
  relations?: unknown[]
}

export interface MemoryStats {
  total: number
  by_agent: Record<string, number>
  by_type: Record<string, number>
  avg_retention?: number
  storage_type?: string
}

export interface MemoryHealth {
  status: 'healthy' | 'error' | 'disconnected'
  storage_type?: string
  llm_provider?: string
  version?: string
  message?: string
}

export interface UserProfile {
  user_id: string
  profile_content?: string
  topics?: string[]
}

// ─── 健康检查 ───

export function getMemoryHealth(): Promise<AdapterResult<MemoryHealth>> {
  return wrapAsync(async () => {
    try {
      const health = await pmemFetch<{ status: string }>('/api/v1/system/health')
      const status = await pmemFetch<{ storage_type?: string; llm_provider?: string; version?: string }>('/api/v1/system/status').catch(() => ({}))
      return {
        status: health.status === 'healthy' ? 'healthy' : 'error',
        storage_type: status.storage_type,
        llm_provider: status.llm_provider,
        version: status.version,
      } as MemoryHealth
    } catch {
      // HTTP API 不可用，降级到 CLI
      try {
        const raw = await execCommand('openclaw', ['ltm', 'health'])
        return {
          status: raw.includes('error') ? 'error' : 'healthy',
          message: raw.trim(),
        } as MemoryHealth
      } catch {
        return { status: 'disconnected', message: 'PowerMem 未安装或未启动' }
      }
    }
  })
}

// ─── 记忆列表 ───

export function listMemories(
  agentId?: string,
  userId?: string,
  limit = 50,
  offset = 0,
  sortBy = 'created_at',
  order: 'asc' | 'desc' = 'desc',
): Promise<AdapterResult<MemoryListResult>> {
  return wrapAsync(async () => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      sort_by: sortBy,
      order,
    })
    if (agentId) params.set('agent_id', agentId)
    if (userId) params.set('user_id', userId)

    const data = await pmemFetch<MemoryEntry[] | { memories: MemoryEntry[]; total: number }>(
      `/api/v1/memories?${params}`,
    )

    if (Array.isArray(data)) {
      return { memories: data, total: data.length }
    }
    return { memories: data.memories ?? [], total: data.total ?? 0 }
  })
}

// ─── 记忆搜索 ───

export function searchMemories(
  query: string,
  agentId?: string,
  userId?: string,
  limit = 20,
): Promise<AdapterResult<MemorySearchResult>> {
  return wrapAsync(async () => {
    const body: Record<string, unknown> = { query, limit }
    if (agentId) body.agent_id = agentId
    if (userId) body.user_id = userId

    return pmemFetch<MemorySearchResult>('/api/v1/memories/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  })
}

// ─── 记忆详情 ───

export function getMemory(memoryId: string): Promise<AdapterResult<MemoryEntry>> {
  return wrapAsync(async () => {
    return pmemFetch<MemoryEntry>(`/api/v1/memories/${memoryId}`)
  })
}

// ─── 记忆创建 ───

export function addMemory(
  content: string,
  options?: { userId?: string; agentId?: string; infer?: boolean; importance?: number },
): Promise<AdapterResult<MemoryEntry[]>> {
  return wrapAsync(async () => {
    const body: Record<string, unknown> = {
      messages: [{ role: 'user', content }],
      infer: options?.infer ?? true,
    }
    if (options?.userId) body.user_id = options.userId
    if (options?.agentId) body.agent_id = options.agentId
    if (options?.importance !== undefined) {
      body.metadata = { importance: options.importance }
    }

    return pmemFetch<MemoryEntry[]>('/api/v1/memories', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  })
}

// ─── 记忆编辑 ───

export function updateMemory(
  memoryId: string,
  content: string,
): Promise<AdapterResult<MemoryEntry>> {
  return wrapAsync(async () => {
    return pmemFetch<MemoryEntry>(`/api/v1/memories/${memoryId}`, {
      method: 'PUT',
      body: JSON.stringify({ memory: content }),
    })
  })
}

// ─── 记忆删除 ───

export function deleteMemory(memoryId: string): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    await pmemFetch<unknown>(`/api/v1/memories/${memoryId}`, { method: 'DELETE' })
  })
}

export function deleteMemoriesBatch(memoryIds: string[]): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    await pmemFetch<unknown>('/api/v1/memories/batch', {
      method: 'DELETE',
      body: JSON.stringify({ memory_ids: memoryIds }),
    })
  })
}

// ─── Agent 记忆 ───

export function getAgentMemories(
  agentId: string,
  limit = 50,
  offset = 0,
): Promise<AdapterResult<MemoryListResult>> {
  return wrapAsync(async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    const data = await pmemFetch<MemoryEntry[] | { memories: MemoryEntry[] }>(`/api/v1/agents/${agentId}/memories?${params}`)
    const memories = Array.isArray(data) ? data : data.memories ?? []
    return { memories, total: memories.length }
  })
}

export function getAgentIds(): Promise<AdapterResult<string[]>> {
  return wrapAsync(async () => {
    // 从记忆列表中提取唯一 agent_id
    const data = await pmemFetch<MemoryEntry[]>('/api/v1/memories?limit=200')
    const memories = Array.isArray(data) ? data : []
    const ids = [...new Set(memories.map((m) => m.agent_id).filter(Boolean))] as string[]
    return ids
  })
}

// ─── 用户画像 ───

export function getUserProfile(userId: string): Promise<AdapterResult<UserProfile>> {
  return wrapAsync(async () => {
    return pmemFetch<UserProfile>(`/api/v1/users/${userId}/profile`)
  })
}

// ─── 统计 ───

export function getMemoryStats(): Promise<AdapterResult<MemoryStats>> {
  return wrapAsync(async () => {
    // 聚合统计信息
    const [status, memories] = await Promise.all([
      pmemFetch<{ storage_type?: string }>('/api/v1/system/status').catch(() => ({})),
      pmemFetch<MemoryEntry[]>('/api/v1/memories?limit=500').catch(() => []),
    ])

    const list = Array.isArray(memories) ? memories : []

    const byAgent: Record<string, number> = {}
    const byType: Record<string, number> = {}
    let retentionSum = 0
    let retentionCount = 0

    for (const m of list) {
      const agentId = m.agent_id ?? 'unknown'
      byAgent[agentId] = (byAgent[agentId] ?? 0) + 1

      const memType = m.metadata?.intelligence?.memory_type ?? 'unknown'
      byType[memType] = (byType[memType] ?? 0) + 1

      if (m.metadata?.intelligence?.current_retention !== undefined) {
        retentionSum += m.metadata.intelligence.current_retention
        retentionCount++
      }
    }

    return {
      total: list.length,
      by_agent: byAgent,
      by_type: byType,
      avg_retention: retentionCount > 0 ? retentionSum / retentionCount : undefined,
      storage_type: status.storage_type,
    }
  })
}

// ─── PowerMem Server 管理 ───

export function startPowerMemServer(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('bash', [
      '-c',
      'cd ~/.openclaw/powermem && source .venv/bin/activate && nohup powermem-server --host 0.0.0.0 --port 8000 > /dev/null 2>&1 &',
    ])
    return raw.trim() || 'PowerMem server started'
  })
}

export function isPowerMemServerRunning(): Promise<AdapterResult<boolean>> {
  return wrapAsync(async () => {
    try {
      await pmemFetch<unknown>('/api/v1/system/health')
      return true
    } catch {
      return false
    }
  })
}
