import fs from 'fs'
import { readConfigJson } from './configJson.js'
import { getOpenclawLogReadPaths } from './paths.js'

export function readLogTailStrings(n: number): string[] {
  const cfg = readConfigJson()
  for (const logPath of getOpenclawLogReadPaths(cfg)) {
    if (!fs.existsSync(logPath)) continue
    const content = fs.readFileSync(logPath, 'utf-8')
    const all = content.split(/\r?\n/)
    const nonEmpty = all.filter((l) => l.length > 0)
    if (nonEmpty.length === 0) continue
    return nonEmpty.slice(-n)
  }
  return ['暂无日志']
}

export function parseLogLine(line: string): {
  timestamp: string
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'
  message: string
} {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.*)$/)
  if (match) {
    const lv = match[2].toUpperCase()
    const level =
      lv === 'DEBUG' || lv === 'WARN' || lv === 'ERROR' ? (lv as 'DEBUG' | 'WARN' | 'ERROR') : 'INFO'
    return { timestamp: match[1], level, message: match[3] }
  }
  return { timestamp: new Date().toISOString(), level: 'INFO', message: line }
}
