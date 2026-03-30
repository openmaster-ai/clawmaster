/**
 * Channel Status 适配器
 *
 * 封装 openclaw channels status / openclaw status 的 --json 输出
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

// ─── 类型定义 ───

export interface ChannelHealth {
  channels: Record<string, {
    status: string
    accounts: string[]
  }>
  channelOrder: string[]
}

export interface FullStatus {
  runtimeVersion: string
  channelSummary: Array<{
    channel: string
    status: string
    accounts: number
  }>
  sessions: {
    count: number
    recent: Array<{
      agentId: string
      key: string
      model: string
      updatedAt: number
    }>
  }
}

// ─── API 函数 ───

export function getChannelStatus(): Promise<AdapterResult<ChannelHealth>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['channels', 'status', '--json'])
    const data = JSON.parse(raw)
    const channels: ChannelHealth['channels'] = {}
    const channelOrder: string[] = []

    if (data.channels && typeof data.channels === 'object') {
      for (const [name, info] of Object.entries(data.channels as Record<string, any>)) {
        channelOrder.push(name)
        channels[name] = {
          status: info.status ?? 'unknown',
          accounts: Array.isArray(info.accounts) ? info.accounts : [],
        }
      }
    }

    return {
      channels,
      channelOrder: data.channelOrder ?? channelOrder,
    }
  })
}

export function probeChannels(): Promise<AdapterResult<ChannelHealth>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['channels', 'status', '--json', '--probe'])
    const data = JSON.parse(raw)
    const channels: ChannelHealth['channels'] = {}
    const channelOrder: string[] = []

    if (data.channels && typeof data.channels === 'object') {
      for (const [name, info] of Object.entries(data.channels as Record<string, any>)) {
        channelOrder.push(name)
        channels[name] = {
          status: info.status ?? 'unknown',
          accounts: Array.isArray(info.accounts) ? info.accounts : [],
        }
      }
    }

    return {
      channels,
      channelOrder: data.channelOrder ?? channelOrder,
    }
  })
}

export function getFullStatus(): Promise<AdapterResult<FullStatus>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['status', '--json'])
    const data = JSON.parse(raw)

    const channelSummary = (Array.isArray(data.channelSummary ?? data.channels)
      ? (data.channelSummary ?? data.channels)
      : []
    ).map((c: any) => ({
      channel: c.channel ?? c.name ?? '',
      status: c.status ?? 'unknown',
      accounts: c.accounts ?? c.accountCount ?? 0,
    }))

    const sessionsRaw = data.sessions ?? {}
    const recent = (Array.isArray(sessionsRaw.recent) ? sessionsRaw.recent : []).map((s: any) => ({
      agentId: s.agentId ?? s.agent_id ?? '',
      key: s.key ?? '',
      model: s.model ?? '',
      updatedAt: s.updatedAt ?? s.updated_at ?? 0,
    }))

    return {
      runtimeVersion: data.runtimeVersion ?? data.version ?? '',
      channelSummary,
      sessions: {
        count: sessionsRaw.count ?? recent.length,
        recent,
      },
    }
  })
}
