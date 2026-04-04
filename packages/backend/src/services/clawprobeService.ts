import path from 'node:path'
import { readConfigJsonOrEmpty } from '../configJson.js'
import { ClawprobeUnavailableError, runClawprobeCommand, runClawprobeJson } from '../execClawprobe.js'
import { getOpenclawDataDir } from '../paths.js'

const CLAWPROBE_INSTALL_MESSAGE =
  'ClawProbe is not installed. Install it from setup or run: npm i -g clawprobe'
const FALLBACK_BOOTSTRAP_MAX_CHARS = 12_000

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNestedString(root: Record<string, unknown>, keys: string[]): string | null {
  let cursor: unknown = root
  for (const key of keys) {
    if (!isObjectRecord(cursor)) {
      return null
    }
    cursor = cursor[key]
  }
  return typeof cursor === 'string' && cursor.trim() ? cursor : null
}

function isClawprobeUnavailable(error: unknown): boolean {
  if (error instanceof ClawprobeUnavailableError) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /clawprobe is not installed|not available in path|command not found|cannot find module/i.test(message)
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildFallbackStatus() {
  return {
    agent: 'OpenClaw',
    daemonRunning: false,
    sessionKey: null,
    sessionId: null,
    model: null,
    provider: null,
    sessionTokens: 0,
    windowSize: 0,
    utilizationPct: 0,
    inputTokens: 0,
    outputTokens: 0,
    compactionCount: 0,
    lastActiveAt: 0,
    isActive: false,
    todayUsd: 0,
    installRequired: true,
    suggestions: [
      {
        severity: 'info',
        ruleId: 'clawprobe-install-required',
        title: 'Install ClawProbe to enable observability',
        detail: 'ClawProbe is currently unavailable, so session and cost data cannot be collected yet.',
        action: 'npm i -g clawprobe\nclawprobe start',
      },
    ],
  }
}

function buildFallbackCost(period: string) {
  const end = new Date()
  const start = new Date(end)
  if (period === 'day') {
    // Keep same-day zero state.
  } else if (period === 'month') {
    start.setDate(1)
  } else if (period === 'all') {
    start.setFullYear(end.getFullYear(), 0, 1)
  } else {
    start.setDate(end.getDate() - 6)
  }
  return {
    period,
    startDate: formatDate(start),
    endDate: formatDate(end),
    totalUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    inputUsd: 0,
    outputUsd: 0,
    dailyAvg: 0,
    monthEstimate: 0,
    daily: [],
    unpricedModels: [],
  }
}

function buildFallbackConfig() {
  const openclaw = readConfigJsonOrEmpty()
  const openclawDir = getOpenclawDataDir()
  const workspaceDir =
    getNestedString(openclaw, ['agents', 'defaults', 'workspace']) ??
    path.join(openclawDir, 'workspace')
  return {
    openclawDir,
    workspaceDir,
    sessionsDir: path.join(workspaceDir, '.openclaw', 'sessions'),
    bootstrapMaxChars: FALLBACK_BOOTSTRAP_MAX_CHARS,
    probeDir: path.join(openclawDir, 'clawprobe'),
    openclaw,
  }
}

function buildInstallRequiredError() {
  return Object.assign(new Error(CLAWPROBE_INSTALL_MESSAGE), {
    stdout: '',
    stderr: CLAWPROBE_INSTALL_MESSAGE,
  })
}

export async function clawprobeStatus() {
  try {
    return await runClawprobeJson(['status', '--json'])
  } catch (error) {
    if (isClawprobeUnavailable(error)) {
      return buildFallbackStatus()
    }
    throw error
  }
}

export async function clawprobeCost(period: string) {
  const args = ['cost', '--json']
  if (period === 'day') args.push('--day')
  else if (period === 'month') args.push('--month')
  else if (period === 'all') args.push('--all')
  else if (period !== 'week') throw new Error('period must be day|week|month|all')
  try {
    return await runClawprobeJson(args)
  } catch (error) {
    if (isClawprobeUnavailable(error)) {
      return buildFallbackCost(period)
    }
    throw error
  }
}

export async function clawprobeSuggest() {
  try {
    return await runClawprobeJson(['suggest', '--json'])
  } catch (error) {
    if (isClawprobeUnavailable(error)) {
      return buildFallbackStatus().suggestions
    }
    throw error
  }
}

export async function clawprobeConfig() {
  try {
    return await runClawprobeJson(['config', '--json'])
  } catch (error) {
    if (isClawprobeUnavailable(error)) {
      return buildFallbackConfig()
    }
    throw error
  }
}

export async function clawprobeBootstrap() {
  let before: unknown
  try {
    before = await runClawprobeJson(['status', '--json'])
  } catch (error) {
    if (isClawprobeUnavailable(error)) {
      throw buildInstallRequiredError()
    }
    throw error
  }
  const beforeObj =
    typeof before === 'object' && before !== null
      ? (before as { daemonRunning?: boolean })
      : {}
  if (beforeObj.daemonRunning === true) {
    return {
      ok: true,
      alreadyRunning: true,
      daemonRunning: true,
      message: 'ClawProbe 守护进程已在运行',
    }
  }

  const start = await runClawprobeCommand(['start'])
  if (!start.ok && start.code === 127) {
    throw buildInstallRequiredError()
  }
  let after: unknown
  try {
    after = await runClawprobeJson(['status', '--json'])
  } catch (error) {
    if (isClawprobeUnavailable(error)) {
      throw buildInstallRequiredError()
    }
    throw error
  }
  const afterObj =
    typeof after === 'object' && after !== null ? (after as { daemonRunning?: boolean }) : {}

  if (afterObj.daemonRunning === true) {
    return {
      ok: true,
      alreadyRunning: false,
      daemonRunning: true,
      message: 'ClawProbe 已成功拉起',
      stdout: start.stdout,
      stderr: start.stderr,
    }
  }
  throw Object.assign(new Error(start.stderr || start.stdout || '启动命令执行后仍未检测到守护进程'), {
    stdout: start.stdout,
    stderr: start.stderr,
  })
}
