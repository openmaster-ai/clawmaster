import { describe, expect, it } from 'vitest'
import type { LogEntry } from '@/lib/types'
import { filterLogEntriesByScope } from '@/shared/logScopes'

const entries: LogEntry[] = [
  {
    timestamp: '2026-04-07 10:00:00',
    level: 'INFO',
    message: '2026-04-06T12:16:01.997+08:00 [gateway] listening on ws://127.0.0.1:18789',
  },
  {
    timestamp: '2026-04-07 10:00:01',
    level: 'INFO',
    message: '2026-04-05T20:19:43.900+08:00 [ws] webchat disconnected code=1001',
  },
  {
    timestamp: '2026-04-07 10:00:02',
    level: 'INFO',
    message: '2026-04-06T12:16:04.421+08:00 [browser/server] Browser control listening on http://127.0.0.1:18791/',
  },
]

describe('filterLogEntriesByScope', () => {
  it('keeps gateway-related entries for the gateway scope', () => {
    const result = filterLogEntriesByScope(entries, 'gateway')
    expect(result).toHaveLength(2)
    expect(result.every((entry) => !entry.message.includes('webchat'))).toBe(true)
  })

  it('keeps channel-related entries for the channels scope', () => {
    const result = filterLogEntriesByScope(entries, 'channels')
    expect(result).toHaveLength(1)
    expect(result[0]?.message).toContain('webchat')
  })
})
