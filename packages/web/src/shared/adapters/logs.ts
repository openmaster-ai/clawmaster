import type { LogEntry } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

function parseLogLines(lines: string[]): LogEntry[] {
  return lines.map((line) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.*)$/)
    if (match) {
      return {
        timestamp: match[1],
        level: match[2] as LogEntry['level'],
        message: match[3],
      }
    }
    return {
      timestamp: new Date().toISOString(),
      level: 'INFO' as const,
      message: line,
    }
  })
}

export async function getLogsResult(lines: number): Promise<AdapterResult<LogEntry[]>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const logs = await tauriInvoke<string[]>('get_logs', { lines })
      return parseLogLines(logs)
    })
  }
  const res = await webFetchJson<LogEntry[]>(`/api/logs?lines=${lines}`)
  return res
}
