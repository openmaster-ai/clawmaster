/** Shapes of `clawprobe … --json` stdout (ClawProbe package). */

export interface ClawprobeStatusSuggestion {
  severity: string
  ruleId: string
  title: string
  detail: string
  action: string | null
}

export interface ClawprobeStatusJson {
  agent: string
  daemonRunning: boolean
  sessionKey: string | null
  sessionId: string | null
  model: string | null
  provider: string | null
  sessionTokens: number
  windowSize: number
  utilizationPct: number
  inputTokens: number
  outputTokens: number
  compactionCount: number
  lastActiveAt: number
  isActive: boolean
  todayUsd: number
  suggestions: ClawprobeStatusSuggestion[]
}

export interface ClawprobeDailyCost {
  date: string
  usd: number
  inputTokens: number
  outputTokens: number
}

export interface ClawprobeCostJson {
  period: string
  startDate: string
  endDate: string
  totalUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  inputUsd: number
  outputUsd: number
  dailyAvg: number
  monthEstimate: number
  daily: ClawprobeDailyCost[]
  model?: string
  unpricedModels?: string[]
}

export interface ClawprobeConfigJson {
  openclawDir: string
  workspaceDir: string
  sessionsDir: string
  bootstrapMaxChars: number
  probeDir: string
  openclaw: Record<string, unknown>
}

export interface ClawprobeBootstrapResult {
  ok: boolean
  alreadyRunning: boolean
  daemonRunning: boolean
  message: string
  stdout?: string
  stderr?: string
}
