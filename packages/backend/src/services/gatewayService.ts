import { readConfigJson } from '../configJson.js'
import {
  execOpenclawGatewayStatusJson,
  execOpenclawGatewayStatusPlain,
  extractFirstJsonObject,
  parseGatewayStatusJsonPayload,
  probeGatewayTcpPort,
  runOpenclawGatewayRestart,
  runOpenclawGatewayStop,
  spawnOpenclawGatewayStart,
} from '../execOpenclaw.js'
import { isRecord } from '../serverUtils.js'

const DEFAULT_GATEWAY_WATCHDOG_INTERVAL_MS = 30_000

export type GatewayWatchdogState =
  | 'disabled'
  | 'idle'
  | 'healthy'
  | 'checking'
  | 'restarting'
  | 'paused'
  | 'error'

export type GatewayWatchdogStatus = {
  enabled: boolean
  state: GatewayWatchdogState
  intervalMs: number
  restartCount: number
  lastCheckAt?: string
  lastRestartAt?: string
  lastError?: string
}

type GatewayStatusBase = {
  running: boolean
  port: number
}

let watchdogTimer: ReturnType<typeof setInterval> | null = null
let watchdogCheckInFlight = false
let watchdogPaused = false
let watchdogStatus: GatewayWatchdogStatus = {
  enabled: false,
  state: 'disabled',
  intervalMs: DEFAULT_GATEWAY_WATCHDOG_INTERVAL_MS,
  restartCount: 0,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeEnvFlag(value: string | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return false
  return !['0', 'false', 'off', 'no'].includes(normalized)
}

export function isGatewayWatchdogEnabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return normalizeEnvFlag(env.CLAWMASTER_GATEWAY_WATCHDOG)
}

function resolveGatewayWatchdogIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(String(env.CLAWMASTER_GATEWAY_WATCHDOG_INTERVAL_MS ?? ''), 10)
  if (Number.isFinite(raw) && raw >= 5_000) return raw
  return DEFAULT_GATEWAY_WATCHDOG_INTERVAL_MS
}

function snapshotWatchdogStatus(): GatewayWatchdogStatus {
  return { ...watchdogStatus }
}

async function readGatewayStatus(): Promise<GatewayStatusBase> {
  const cfg = readConfigJson()
  let port = 18789
  const gwc = cfg?.gateway
  if (isRecord(gwc) && typeof gwc.port === 'number') port = gwc.port

  // Fast path: listening on configured port → skip slow login-shell `openclaw gateway status` (common when gateway is up).
  if (await probeGatewayTcpPort(port)) {
    return { running: true, port }
  }

  const r = await execOpenclawGatewayStatusJson()
  const combined = `${r.stdout}\n${r.stderr}`
  const parsed =
    parseGatewayStatusJsonPayload(combined) ??
    parseGatewayStatusJsonPayload(extractFirstJsonObject(combined) ?? '')
  if (parsed && typeof parsed.port === 'number' && parsed.port > 0) {
    port = parsed.port
  }
  if (parsed?.running) return { running: true, port }

  // JSON explicitly says stopped → skip second expensive plain-text status call; re-probe port (may differ from config).
  if (parsed !== null && !parsed.running) {
    if (await probeGatewayTcpPort(port)) return { running: true, port }
    return { running: false, port }
  }

  if (r.code === 124) {
    return { running: false, port }
  }

  const plain = await execOpenclawGatewayStatusPlain()
  const text = `${plain.stdout}\n${plain.stderr}`
  if (/running|active|已运行|运行/i.test(text)) return { running: true, port }

  if (await probeGatewayTcpPort(port)) return { running: true, port }
  return { running: false, port }
}

async function waitForGatewayRunning(maxRetries = 5): Promise<GatewayStatusBase> {
  let latest = await readGatewayStatus()
  if (latest.running) return latest
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    await sleep(1_000)
    latest = await readGatewayStatus()
    if (latest.running) return latest
  }
  return latest
}

async function runGatewayWatchdogCheck(): Promise<void> {
  if (!watchdogStatus.enabled || watchdogCheckInFlight) return
  if (watchdogPaused) {
    watchdogStatus = {
      ...watchdogStatus,
      state: 'paused',
      lastCheckAt: new Date().toISOString(),
    }
    return
  }

  watchdogCheckInFlight = true
  watchdogStatus = {
    ...watchdogStatus,
    state: 'checking',
    lastCheckAt: new Date().toISOString(),
    lastError: undefined,
  }

  try {
    const current = await readGatewayStatus()
    if (current.running) {
      watchdogStatus = {
        ...watchdogStatus,
        state: 'healthy',
        lastError: undefined,
      }
      return
    }

    watchdogStatus = {
      ...watchdogStatus,
      state: 'restarting',
      restartCount: watchdogStatus.restartCount + 1,
    }
    console.warn('ClawMaster gateway safeguard detected OpenClaw gateway downtime; restarting.')
    await spawnOpenclawGatewayStart()

    const after = await waitForGatewayRunning()
    if (!after.running) {
      throw new Error(`Gateway restart completed but port ${after.port} is still unreachable`)
    }

    watchdogStatus = {
      ...watchdogStatus,
      state: 'healthy',
      lastRestartAt: new Date().toISOString(),
      lastError: undefined,
    }
    console.log('ClawMaster gateway safeguard restarted OpenClaw gateway.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    watchdogStatus = {
      ...watchdogStatus,
      state: 'error',
      lastError: message,
    }
    console.warn(`ClawMaster gateway safeguard failed: ${message}`)
  } finally {
    watchdogCheckInFlight = false
  }
}

export function getGatewayWatchdogStatus(): GatewayWatchdogStatus {
  return snapshotWatchdogStatus()
}

export function startGatewayWatchdog(options: { intervalMs?: number; runImmediately?: boolean } = {}): GatewayWatchdogStatus {
  const intervalMs = options.intervalMs ?? resolveGatewayWatchdogIntervalMs()
  watchdogPaused = false
  watchdogStatus = {
    ...watchdogStatus,
    enabled: true,
    state: 'idle',
    intervalMs,
  }

  if (watchdogTimer) {
    clearInterval(watchdogTimer)
  }
  watchdogTimer = setInterval(() => {
    void runGatewayWatchdogCheck()
  }, intervalMs)
  watchdogTimer.unref?.()

  if (options.runImmediately !== false) {
    void runGatewayWatchdogCheck()
  }
  return snapshotWatchdogStatus()
}

export function stopGatewayWatchdog(): GatewayWatchdogStatus {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  watchdogPaused = false
  watchdogCheckInFlight = false
  watchdogStatus = {
    ...watchdogStatus,
    enabled: false,
    state: 'disabled',
  }
  return snapshotWatchdogStatus()
}

export async function getGatewayStatus() {
  return {
    ...(await readGatewayStatus()),
    watchdog: getGatewayWatchdogStatus(),
  }
}

export async function startGateway() {
  await spawnOpenclawGatewayStart()
  watchdogPaused = false
  if (watchdogStatus.enabled) {
    watchdogStatus = {
      ...watchdogStatus,
      state: 'healthy',
      lastError: undefined,
    }
  }
}

export async function stopGateway() {
  const wasWatchdogEnabled = watchdogStatus.enabled
  if (wasWatchdogEnabled) {
    watchdogPaused = true
    watchdogStatus = {
      ...watchdogStatus,
      state: 'paused',
      lastError: undefined,
    }
  }
  try {
    await runOpenclawGatewayStop()
  } catch (error) {
    if (wasWatchdogEnabled) {
      watchdogPaused = false
      watchdogStatus = {
        ...watchdogStatus,
        state: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      }
    }
    throw error
  }
}

export async function restartGateway() {
  await runOpenclawGatewayRestart()
  watchdogPaused = false
  if (watchdogStatus.enabled) {
    watchdogStatus = {
      ...watchdogStatus,
      state: 'healthy',
      lastError: undefined,
    }
  }
}
