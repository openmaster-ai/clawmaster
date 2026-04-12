import type { LogEntry } from '@/lib/types'

export type RecentLogScope = 'all' | 'gateway' | 'channels'

const SCOPE_KEYWORDS: Record<Exclude<RecentLogScope, 'all'>, string[]> = {
  gateway: [
    '[gateway]',
    '[heartbeat]',
    '[health-monitor]',
    '[hooks]',
    '[browser/server]',
    '[canvas]',
    'listening on ws://',
    'log file:',
    'update available',
  ],
  channels: [
    'webchat',
    'wechat',
    'telegram',
    'discord',
    'slack',
    'feishu',
    'dingtalk',
    'qq',
    'whatsapp',
    'signal',
    'matrix',
    'teams',
    'channel login',
    'qr login',
    'webhook',
  ],
}

export function filterLogEntriesByScope(entries: LogEntry[], scope: RecentLogScope): LogEntry[] {
  if (scope === 'all') return entries
  const keywords = SCOPE_KEYWORDS[scope]
  return entries.filter((entry) => {
    const message = entry.message.toLowerCase()
    return keywords.some((keyword) => message.includes(keyword))
  })
}
