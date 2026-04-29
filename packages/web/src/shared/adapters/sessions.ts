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

// ─── Turn detail from clawprobe ───

export interface TurnInfo {
  turnIndex: number
  timestamp: number
  inputTokensDelta: number
  outputTokensDelta: number
  estimatedUsd: number
  compactOccurred: boolean
  tools: string[]
}

export interface SessionDetail {
  sessionKey: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  contextTokens: number
  windowSize: number
  estimatedUsd: number
  startedAt: number
  lastActiveAt: number
  durationMin: number
  compactionCount: number
  turns: TurnInfo[]
}

export function getSessionDetail(
  key: string,
  options: { agentId?: string } = {}
): Promise<AdapterResult<SessionDetail>> {
  return wrapAsync(async () => {
    const args = ['session', key, '--json']
    if (options.agentId?.trim()) args.push('--agent', options.agentId.trim())
    const raw = await execCommand('clawprobe', args)
    const data = JSON.parse(raw)
    return {
      sessionKey: data.sessionKey ?? key,
      model: data.model ?? '',
      provider: data.provider ?? '',
      inputTokens: data.inputTokens ?? 0,
      outputTokens: data.outputTokens ?? 0,
      totalTokens: data.totalTokens ?? 0,
      contextTokens: data.contextTokens ?? data.context_tokens ?? data.sessionTokens ?? data.session_tokens ?? 0,
      windowSize: data.windowSize ?? data.window_size ?? 0,
      estimatedUsd: data.estimatedUsd ?? 0,
      startedAt: data.startedAt ?? 0,
      lastActiveAt: data.lastActiveAt ?? 0,
      durationMin: data.durationMin ?? 0,
      compactionCount: data.compactionCount ?? 0,
      turns: (data.turns ?? []).map((t: any) => ({
        turnIndex: t.turnIndex ?? 0,
        timestamp: t.timestamp ?? 0,
        inputTokensDelta: t.inputTokensDelta ?? 0,
        outputTokensDelta: t.outputTokensDelta ?? 0,
        estimatedUsd: t.estimatedUsd ?? 0,
        compactOccurred: t.compactOccurred ?? false,
        tools: t.tools ?? [],
      })),
    }
  })
}

export function cleanupSessions(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['sessions', 'cleanup'])
    return raw.trim()
  })
}
