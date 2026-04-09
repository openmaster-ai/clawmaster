import fs from 'fs'
import { getClawmasterRuntimeSelection } from './clawmasterSettings.js'
import { readConfigJson } from './configJson.js'
import { getOpenclawLogReadPaths } from './paths.js'
import {
  resolveSelectedWslDistroSync,
  runWslShellSync,
  shellEscapePosixArg,
  shouldUseWslRuntime,
} from './wslRuntime.js'

export function readLogTailStrings(n: number): string[] {
  const cfg = readConfigJson()
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    const distro = resolveSelectedWslDistroSync(runtimeSelection)
    if (!distro) return ['No WSL2 distro selected']
    for (const logPath of getOpenclawLogReadPaths(cfg)) {
      const out = runWslShellSync(
        distro,
        `[ -f ${shellEscapePosixArg(logPath)} ] && tail -n ${Math.max(1, n)} ${shellEscapePosixArg(logPath)}`
      )
      if (out.code !== 0 || !out.stdout.trim()) continue
      const nonEmpty = out.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
      if (nonEmpty.length > 0) {
        return nonEmpty
      }
    }
    return ['No logs available in the selected WSL2 runtime']
  }

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
