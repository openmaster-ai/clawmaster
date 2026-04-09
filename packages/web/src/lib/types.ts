// For runtime detection use getIsTauri() from @/shared/adapters/platform

/** Platform adapter contract (legacy) */
export interface PlatformAdapter {
  detectSystem(): Promise<SystemInfo>
  getGatewayStatus(): Promise<GatewayStatus>
  startGateway(): Promise<void>
  stopGateway(): Promise<void>
  restartGateway(): Promise<void>
  getConfig(): Promise<OpenClawConfig>
  setConfig(path: string, value: unknown): Promise<void>
  getChannels(): Promise<ChannelInfo[]>
  addChannel(channel: ChannelConfig): Promise<void>
  removeChannel(id: string): Promise<void>
  getModels(): Promise<ModelInfo[]>
  setDefaultModel(modelId: string): Promise<void>
  getSkills(): Promise<SkillInfo[]>
  searchSkills(query: string): Promise<SkillInfo[]>
  installSkill(slug: string): Promise<void>
  uninstallSkill(slug: string): Promise<void>
  getAgents(): Promise<AgentInfo[]>
  createAgent(agent: AgentConfig): Promise<void>
  deleteAgent(id: string): Promise<void>
  getLogs(lines: number): Promise<LogEntry[]>
  streamLogs(callback: (entry: LogEntry) => void): () => void
}

export interface SystemInfo {
  nodejs: { installed: boolean; version: string }
  npm: { installed: boolean; version: string }
  openclaw: {
    installed: boolean
    version: string
    configPath: string
    dataDir?: string
    pathSource?: string
    profileMode?: 'default' | 'dev' | 'named'
    profileName?: string | null
    overrideActive?: boolean
    configPathCandidates?: string[]
    existingConfigPaths?: string[]
  }
  runtime?: {
    mode: 'native' | 'wsl2'
    hostPlatform?: string
    wslAvailable?: boolean
    selectedDistro?: string | null
    selectedDistroExists?: boolean | null
    backendPort?: number | null
    autoStartBackend?: boolean | null
    distros?: Array<{
      name: string
      state: string
      version: number | null
      isDefault: boolean
      hasOpenclaw?: boolean
      openclawVersion?: string
    }>
  }
}

export interface GatewayStatus {
  running: boolean
  port: number
  uptime?: number
  connections?: number
}

/** Display fields for one account under a channel (common config shape) */
export interface ChannelAccountInfo {
  name?: string
  enabled?: boolean
  groupPolicy?: string
}

export interface OpenClawChannelEntry {
  enabled?: boolean
  accounts?: Record<string, ChannelAccountInfo>
}

export interface OpenClawModelRef {
  id?: string
  name?: string
}

export interface OpenClawModelProvider {
  baseUrl?: string
  models?: Array<string | OpenClawModelRef>
}

export interface OpenClawBinding {
  match?: { channel?: string }
  agentId: string
}

export interface ChannelVerifyResult {
  ok: boolean
  message: string
  detail?: string
}

export interface WhatsAppLoginStatus {
  status: 'idle' | 'pending' | 'authorized' | 'failed'
  qr?: string
  message?: string
  updatedAt: string
}

export interface OpenClawAgentListItem {
  id: string
  name?: string
  workspace?: string
  model?: string
  agentDir?: string
}

export interface OpenClawConfig {
  gateway?: {
    port?: number
    mode?: string
    bind?: string
    auth?: { mode?: string; token?: string }
    /** Control UI path prefix, e.g. `/openclaw` (see OpenClaw `gateway.controlUi.basePath`) */
    controlUi?: { basePath?: string }
  }
  agents?: {
    defaults?: {
      model?: { primary?: string }
      workspace?: string
      maxConcurrent?: number
    }
    list?: OpenClawAgentListItem[]
  }
  channels?: Record<string, OpenClawChannelEntry>
  models?: { providers?: Record<string, OpenClawModelProvider> }
  bindings?: OpenClawBinding[]
  /** OpenClaw plugins.entries + metadata (from openclaw.json) */
  plugins?: {
    entries?: Record<
      string,
      {
        enabled?: boolean
        config?: Record<string, unknown>
      }
    >
  }
}

/** `openclaw memory status --json` (backend may still set exitCode !== 0) */
export interface OpenclawMemoryStatusPayload {
  exitCode: number
  data: unknown
  stderr?: string
}

export interface OpenclawMemorySearchCapabilityPayload {
  mode: 'native' | 'fallback'
  reason?: 'fts5_unavailable'
  detail?: string
}

export interface OpenclawMemoryReindexPayload {
  exitCode: number
  stdout: string
  stderr?: string
}

export interface OpenclawMemoryFileEntry {
  name: string
  relativePath: string
  absolutePath: string
  size: number
  modifiedAtMs: number
  extension: string
  kind: 'sqlite' | 'journal' | 'json' | 'text' | 'other'
}

export interface OpenclawMemoryFilesPayload {
  root: string
  files: OpenclawMemoryFileEntry[]
}

export interface ChannelInfo {
  id: string
  name: string
  type: string
  enabled: boolean
  connected?: boolean
}

export interface ChannelConfig {
  type: string
  name: string
  config: Record<string, unknown>
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  enabled: boolean
}

export interface SkillInfo {
  slug: string
  name: string
  description: string
  version: string
  installed?: boolean
  skillKey?: string
  source?: string
  disabled?: boolean
  eligible?: boolean
  bundled?: boolean
}

export interface ClawhubCliStatus {
  installed: boolean
  version: string
  packageName: string
}

export interface SkillGuardFinding {
  dimension: string
  severity: string
  filePath: string
  lineNumber?: number | null
  pattern?: string
  description: string
  reference?: string
  remediationEn?: string
  remediationZh?: string
}

export interface SkillGuardTokenEstimate {
  l1SkillMd: number
  l2Eager: number
  l2Lazy: number
  l3Total: number
}

export interface SkillGuardReport {
  skillName: string
  skillPath: string
  riskScore: number
  riskLevel: string
  findings: SkillGuardFinding[]
  tokenEstimate: SkillGuardTokenEstimate
}

export interface SkillGuardScanResult {
  auditMetadata: {
    toolVersion: string
    timestamp: string
    target: string
  }
  summary: {
    totalSkills: number
    byLevel: Record<string, number>
  }
  report: SkillGuardReport | null
  severityCounts: Record<string, number>
  totalFindings: number
}

/** One row from parsed `openclaw plugins list` */
export interface OpenClawPluginInfo {
  id: string
  name: string
  /** e.g. enabled / disabled (from CLI Status column or JSON) */
  status?: string
  version?: string
  description?: string
}

/** Response body for GET /api/plugins and Tauri plugin list */
export interface PluginsListPayload {
  plugins: OpenClawPluginInfo[]
  rawCliOutput?: string | null
}

export interface AgentInfo {
  id: string
  name?: string
  model: string
  workspace: string
}

export interface AgentConfig {
  id: string
  name: string
  model: string
}

export interface LogEntry {
  timestamp: string
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'
  message: string
}
