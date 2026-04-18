import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

export type CronScheduleType = 'cron' | 'every' | 'at'

export interface CronJob {
  id: string
  name: string
  description: string
  enabled: boolean
  scheduleType: CronScheduleType
  cron: string
  every: string
  at: string
  tz: string
  session: string
  sessionKey: string
  model: string
  agent: string
  announce: boolean
  channel: string
  to: string
  message: string
  systemEvent: string
  nextRun: string
  lastRun: string
  lastStatus: string
  raw: unknown
}

export interface CronStatus {
  running: boolean
  /** true = explicitly healthy, false = explicitly unhealthy, null = not reported */
  healthy: boolean | null
  jobsTotal: number | null
  enabledJobs: number | null
  disabledJobs: number | null
  raw: unknown
}

export interface CronRun {
  id: string
  status: string
  startedAt: string
  finishedAt: string
  durationMs: number | null
  exitCode: number | null
  output: string
  raw: unknown
}

export interface CronJobDraft {
  name: string
  description: string
  scheduleType: CronScheduleType
  cron: string
  every: string
  at: string
  tz: string
  session: string
  sessionKey: string
  model: string
  agent: string
  announce: boolean
  channel: string
  to: string
  message: string
  systemEvent: string
  enabled: boolean
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value
  }
  return null
}

function formatDurationMs(value: number): string {
  const units: Array<{ size: number; label: string }> = [
    { size: 86_400_000, label: 'd' },
    { size: 3_600_000, label: 'h' },
    { size: 60_000, label: 'm' },
    { size: 1_000, label: 's' },
  ]

  for (const unit of units) {
    if (value >= unit.size && value % unit.size === 0) {
      return `${value / unit.size}${unit.label}`
    }
  }

  return `${value}ms`
}

function firstDateString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim()
      const numeric = Number(trimmed)
      if (Number.isFinite(numeric) && /^\d+$/.test(trimmed)) {
        return new Date(numeric).toISOString()
      }
      return trimmed
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString()
    }
  }
  return ''
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeCronJob(raw: unknown): CronJob {
  const object = asObject(raw) ?? {}
  const schedule = asObject(object.schedule)
  const delivery = asObject(object.delivery)
  const payload = asObject(object.payload)
  const agentTurn = asObject(payload?.agentTurn)
  const systemEvent = asObject(payload?.systemEvent)
  const lastRun = asObject(object.lastRun)
  const nextRun = asObject(object.nextRun)
  const state = asObject(object.state)

  const cron = firstString(
    object.cron,
    object.cronExpr,
    object.cron_expr,
    schedule?.cron,
    schedule?.expr,
  )
  const every = firstString(
    object.every,
    schedule?.every,
    schedule?.interval,
    typeof schedule?.everyMs === 'number' ? formatDurationMs(schedule.everyMs) : undefined,
  )
  const at = firstDateString(object.at, schedule?.at, schedule?.atMs)

  let scheduleType: CronScheduleType = 'cron'
  const scheduleKind = firstString(schedule?.kind).toLowerCase()
  if (scheduleKind === 'at' || at) scheduleType = 'at'
  else if (scheduleKind === 'every' || every) scheduleType = 'every'

  const enabledRaw = firstBoolean(object.enabled, schedule?.enabled)
  const disabledRaw = firstBoolean(object.disabled)
  const statusText = firstString(object.status, object.state)
  const enabled = enabledRaw ?? (disabledRaw != null ? !disabledRaw : !/\bdisabled\b/i.test(statusText))

  return {
    id: firstString(object.id, object.jobId, object.job_id),
    name: firstString(object.name),
    description: firstString(object.description),
    enabled,
    scheduleType,
    cron,
    every,
    at,
    tz: firstString(object.tz, object.timezone, schedule?.tz, schedule?.timezone),
    session: firstString(object.session, object.sessionTarget, object.session_target),
    sessionKey: firstString(object.sessionKey, object.session_key),
    model: firstString(object.model),
    agent: firstString(object.agent, object.agentId, object.agent_id),
    announce: firstBoolean(object.announce, delivery?.announce) ?? Boolean(delivery?.channel || delivery?.to),
    channel: firstString(object.channel, delivery?.channel),
    to: firstString(object.to, delivery?.to),
    message: firstString(object.message, agentTurn?.message),
    systemEvent: firstString(
      object.systemEvent,
      systemEvent?.text,
      payload?.kind === 'systemEvent' ? payload?.text : undefined,
    ),
    nextRun: firstDateString(
      object.nextRunAt,
      object.nextRunAtMs,
      object.next_run_at,
      nextRun?.at,
      nextRun?.scheduledAt,
      nextRun?.scheduled_at,
      state?.nextRunAt,
      state?.nextRunAtMs,
      object.nextRun,
    ),
    lastRun: firstDateString(
      object.lastRunAt,
      object.lastRunAtMs,
      object.last_run_at,
      lastRun?.at,
      lastRun?.startedAt,
      lastRun?.started_at,
      state?.lastRunAt,
      state?.lastRunAtMs,
      object.lastRun,
    ),
    lastStatus: firstString(
      object.lastStatus,
      object.last_status,
      state?.lastStatus,
      state?.lastRunStatus,
      lastRun?.status,
      object.status,
      object.state,
    ),
    raw,
  }
}

function normalizeCronStatus(raw: unknown): CronStatus {
  const object = asObject(raw) ?? {}
  const jobs = asObject(object.jobs)
  const health = firstString(object.health, object.state, object.status)
  const running =
    firstBoolean(object.running, object.enabled) ?? /\brunning\b|\bok\b|\bhealthy\b|\benabled\b/i.test(health)

  const explicitHealthy = firstBoolean(object.healthy)
  let healthy: boolean | null
  if (explicitHealthy !== null) {
    healthy = explicitHealthy
  } else if (health) {
    if (/\bok\b|\bhealthy\b/i.test(health)) healthy = true
    else if (/\berror\b|\bfail/i.test(health)) healthy = false
    else healthy = null
  } else {
    healthy = null
  }

  return {
    running,
    healthy,
    jobsTotal: firstNumber(object.jobsTotal, object.jobs_total, object.totalJobs, object.jobs, jobs?.total),
    enabledJobs: firstNumber(object.enabledJobs, object.enabled_jobs, jobs?.enabled),
    disabledJobs: firstNumber(object.disabledJobs, object.disabled_jobs, jobs?.disabled),
    raw,
  }
}

function normalizeCronRun(raw: unknown, index: number): CronRun {
  const object = asObject(raw)
  if (!object) {
    return {
      id: String(index),
      status: '',
      startedAt: '',
      finishedAt: '',
      durationMs: null,
      exitCode: null,
      output: typeof raw === 'string' ? raw : JSON.stringify(raw),
      raw,
    }
  }

  return {
    id: firstString(object.id, object.runId, object.run_id) || String(firstNumber(object.ts) ?? index),
    status: firstString(object.status, object.state, object.result, object.action),
    startedAt: firstDateString(object.startedAt, object.started_at, object.at, object.timestamp, object.runAtMs, object.run_at_ms),
    finishedAt: firstDateString(
      object.finishedAt,
      object.finished_at,
      object.completedAt,
      object.completed_at,
      object.ts,
    ),
    durationMs: firstNumber(object.durationMs, object.duration_ms, object.elapsedMs, object.elapsed_ms),
    exitCode: firstNumber(object.exitCode, object.exit_code, object.code),
    output: firstString(object.output, object.stdout, object.stderr, object.summary, object.message),
    raw,
  }
}

function parseCronJobsPayload(raw: string): CronJob[] {
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) return parsed.map(normalizeCronJob)
  const object = asObject(parsed)
  const jobs = Array.isArray(object?.jobs) ? object.jobs : []
  return jobs.map(normalizeCronJob)
}

function parseCronRunsPayload(raw: string): CronRun[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map((entry, index) => normalizeCronRun(entry, index))
      const object = asObject(parsed)
      const runs = Array.isArray(object?.runs)
        ? object.runs
        : Array.isArray(object?.entries)
          ? object.entries
          : [parsed]
      return runs.map((entry, index) => normalizeCronRun(entry, index))
    } catch {
      // fall through to JSONL parsing below
    }
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return normalizeCronRun(JSON.parse(line) as unknown, index)
      } catch {
        return normalizeCronRun(line, index)
      }
    })
}

function pushStringArg(args: string[], flag: string, value: string) {
  const trimmed = value.trim()
  if (trimmed) args.push(flag, trimmed)
}

function validateCronDraft(draft: CronJobDraft) {
  if (!draft.name.trim()) throw new Error('Cron job name is required')
  if (!draft.message.trim() && !draft.systemEvent.trim()) {
    throw new Error('Cron job message or system event is required')
  }
  if (draft.scheduleType === 'cron' && !draft.cron.trim()) {
    throw new Error('Cron expression is required')
  }
  if (draft.scheduleType === 'every' && !draft.every.trim()) {
    throw new Error('Interval duration is required')
  }
  if (draft.scheduleType === 'at' && !draft.at.trim()) {
    throw new Error('One-shot time is required')
  }
}

function buildCronJobArgs(draft: CronJobDraft, mode: 'create' | 'edit'): string[] {
  validateCronDraft(draft)

  const args: string[] = []
  pushStringArg(args, '--name', draft.name)
  pushStringArg(args, '--description', draft.description)
  pushStringArg(args, '--message', draft.message)
  pushStringArg(args, '--system-event', draft.systemEvent)
  pushStringArg(args, '--model', draft.model)
  pushStringArg(args, '--agent', draft.agent)
  pushStringArg(args, '--session', draft.session)
  pushStringArg(args, '--session-key', draft.sessionKey)
  pushStringArg(args, '--channel', draft.channel)
  pushStringArg(args, '--to', draft.to)

  if (draft.announce) {
    args.push('--announce')
  } else if (mode === 'edit') {
    args.push('--no-deliver')
  }

  if (draft.scheduleType === 'cron') {
    args.push('--cron', draft.cron.trim())
    pushStringArg(args, '--tz', draft.tz)
  } else if (draft.scheduleType === 'every') {
    args.push('--every', draft.every.trim())
  } else {
    args.push('--at', draft.at.trim())
    pushStringArg(args, '--tz', draft.tz)
  }

  if (mode === 'create') {
    if (!draft.enabled) args.push('--disabled')
  } else {
    args.push(draft.enabled ? '--enable' : '--disable')
  }

  return args
}

export function getCronJobsResult(): Promise<AdapterResult<CronJob[]>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['cron', 'list', '--all', '--json'])
    return parseCronJobsPayload(raw)
  })
}

export function getCronStatusResult(): Promise<AdapterResult<CronStatus>> {
  return wrapAsync(async () => {
    const raw = await execCommand('openclaw', ['cron', 'status', '--json'])
    return normalizeCronStatus(JSON.parse(raw) as unknown)
  })
}

export function createCronJobResult(draft: CronJobDraft): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    await execCommand('openclaw', ['cron', 'add', ...buildCronJobArgs(draft, 'create')])
  })
}

export function updateCronJobResult(id: string, draft: CronJobDraft): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    const trimmedId = id.trim()
    if (!trimmedId) throw new Error('Cron job id is required')
    await execCommand('openclaw', ['cron', 'edit', trimmedId, ...buildCronJobArgs(draft, 'edit')])
  })
}

export function removeCronJobResult(id: string): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    const trimmedId = id.trim()
    if (!trimmedId) throw new Error('Cron job id is required')
    await execCommand('openclaw', ['cron', 'rm', trimmedId])
  })
}

export function setCronJobEnabledResult(id: string, enabled: boolean): Promise<AdapterResult<void>> {
  return wrapAsync(async () => {
    const trimmedId = id.trim()
    if (!trimmedId) throw new Error('Cron job id is required')
    await execCommand('openclaw', ['cron', enabled ? 'enable' : 'disable', trimmedId])
  })
}

export function runCronJobResult(id: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const trimmedId = id.trim()
    if (!trimmedId) throw new Error('Cron job id is required')
    const raw = await execCommand('openclaw', ['cron', 'run', trimmedId])
    return raw.trim()
  })
}

export function getCronRunsResult(id: string, limit = 20): Promise<AdapterResult<CronRun[]>> {
  return wrapAsync(async () => {
    const trimmedId = id.trim()
    if (!trimmedId) throw new Error('Cron job id is required')
    const raw = await execCommand('openclaw', ['cron', 'runs', '--id', trimmedId, '--limit', String(limit)])
    return parseCronRunsPayload(raw)
  })
}
