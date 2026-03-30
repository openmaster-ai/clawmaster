/**
 * Sessions 适配器
 *
 * 封装 openclaw sessions CLI 的 --json 输出，返回 AdapterResult<T>
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

// ─── 类型定义 ───

export interface SessionInfo {
  key: string
  sessionId: string
  agentId: string
  model: string
  modelProvider: string
  kind: 'direct' | 'channel' | string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextTokens: number
  updatedAt: number   // unix ms
  ageMs: number
}

export interface SessionsData {
  path: string
  count: number
  sessions: SessionInfo[]
}

// ─── API 函数 ───

export function getSessions(): Promise<AdapterResult<SessionsData>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['sessions', '--all-agents', '--json'])
    const data = JSON.parse(raw)
    const sessions: SessionInfo[] = (Array.isArray(data.sessions) ? data.sessions : []).map((s: any) => ({
      key: s.key ?? '',
      sessionId: s.sessionId ?? s.session_id ?? '',
      agentId: s.agentId ?? s.agent_id ?? '',
      model: s.model ?? '',
      modelProvider: s.modelProvider ?? s.model_provider ?? '',
      kind: s.kind ?? 'direct',
      inputTokens: s.inputTokens ?? s.input_tokens ?? 0,
      outputTokens: s.outputTokens ?? s.output_tokens ?? 0,
      totalTokens: s.totalTokens ?? s.total_tokens ?? 0,
      contextTokens: s.contextTokens ?? s.context_tokens ?? 0,
      updatedAt: s.updatedAt ?? s.updated_at ?? 0,
      ageMs: s.ageMs ?? s.age_ms ?? 0,
    }))
    return {
      path: data.path ?? '',
      count: data.count ?? sessions.length,
      sessions,
    }
  })
}

export function cleanupSessions(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['sessions', 'cleanup'])
    return raw.trim()
  })
}
