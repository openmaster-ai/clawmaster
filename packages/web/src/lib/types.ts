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
  storage?: {
    state: 'ready' | 'degraded' | 'blocked'
    engine: 'seekdb-embedded' | 'fallback' | 'unavailable'
    runtimeTarget: 'native' | 'wsl2'
    profileKey: string
    dataRoot?: string | null
    engineRoot?: string | null
    nodeRequirement: string
    supportsEmbedded: boolean
    targetPlatform: string
    targetArch: string
    reasonCode?: 'node_missing' | 'node_too_old' | 'embedded_platform_unsupported' | 'wsl_distro_missing' | null
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
  watchdog?: {
    enabled: boolean
    state: 'disabled' | 'idle' | 'healthy' | 'checking' | 'restarting' | 'paused' | 'error'
    intervalMs: number
    restartCount: number
    lastCheckAt?: string
    lastRestartAt?: string
    lastError?: string
  }
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

export interface OpenClawOcrProvider {
  endpoint?: string
  accessToken?: string
  defaultFileType?: 0 | 1
  useDocOrientationClassify?: boolean
  useDocUnwarping?: boolean
  useLayoutDetection?: boolean
  useChartRecognition?: boolean
  restructurePages?: boolean
  mergeTables?: boolean
  relevelTitles?: boolean
  prettifyMarkdown?: boolean
  visualize?: boolean
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
      imageGenerationModel?: { primary?: string }
      workspace?: string
      maxConcurrent?: number
    }
    list?: OpenClawAgentListItem[]
  }
  channels?: Record<string, OpenClawChannelEntry>
  models?: { providers?: Record<string, OpenClawModelProvider> }
  ocr?: {
    providers?: Record<string, OpenClawOcrProvider>
    defaults?: {
      provider?: string
    }
  }
  skills?: {
    entries?: Record<
      string,
      {
        enabled?: boolean
      }
    >
  }
  bindings?: OpenClawBinding[]
  /** OpenClaw plugins.entries + metadata (from openclaw.json) */
  plugins?: {
    load?: {
      paths?: string[]
    }
    entries?: Record<
      string,
      {
        enabled?: boolean
        config?: Record<string, unknown>
      }
    >
    installs?: Record<
      string,
      {
        source?: string
        sourcePath?: string
        installPath?: string
        version?: string
        installedAt?: string
      }
    >
  }
}

export interface PaddleOcrSampleAsset {
  id: string
  name: string
  description: string
  type: 'image' | 'pdf'
  url: string
  previewUrl?: string
}

export interface PaddleOcrRequestOptions {
  fileType?: 0 | 1
  useDocOrientationClassify?: boolean
  useDocUnwarping?: boolean
  useLayoutDetection?: boolean
  useChartRecognition?: boolean
  restructurePages?: boolean
  mergeTables?: boolean
  relevelTitles?: boolean
  prettifyMarkdown?: boolean
  visualize?: boolean
}

export interface PaddleOcrParseRequest extends PaddleOcrRequestOptions {
  endpoint: string
  accessToken: string
  file: string
}

export interface PaddleOcrTestRequest extends PaddleOcrRequestOptions {
  endpoint: string
  accessToken: string
  file?: string
}

export interface PaddleOcrMarkdownPayload {
  text: string
  images: Record<string, string>
}

export interface PaddleOcrPageResult {
  prunedResult?: unknown
  markdown: PaddleOcrMarkdownPayload
  outputImages?: Record<string, string> | null
  inputImage?: string | null
}

export interface PaddleOcrParseResult {
  layoutParsingResults: PaddleOcrPageResult[]
  dataInfo?: Record<string, unknown>
}

export interface PaddleOcrTestResult {
  ok: boolean
  sampleFile: string
  pageCount: number
}

export interface ContentDraftVariantSummary {
  id: string
  runId: string
  platform: string
  title: string | null
  slug: string | null
  sourceUrl: string | null
  savedAt: string | null
  draftPath: string
  manifestPath: string
  imagesDir: string
  imageFiles: string[]
}

export interface ContentDraftTextFile {
  path: string
  content: string
}

export interface ContentDraftImageFile {
  path: string
  mimeType: string
  base64: string
}

export interface ContentDraftDeleteResult {
  removedPath: string
}

/** `openclaw memory status --json` (backend may still set exitCode !== 0) */
export interface OpenclawMemoryStatusPayload {
  exitCode: number
  data: unknown
  stderr?: string
}

export interface OpenclawMemorySearchCapabilityPayload {
  mode: 'native' | 'fallback' | 'unsupported'
  reason?: 'fts5_unavailable' | 'command_unavailable'
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

export interface ManagedMemoryRecord {
  id: string
  memoryId: string
  content: string
  userId?: string
  agentId?: string
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  accessCount?: number
}

export interface ManagedMemorySearchHit {
  memoryId: string
  content: string
  score?: number
  userId?: string
  agentId?: string
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface ManagedMemoryStoreContext {
  implementation: 'powermem'
  engine: 'powermem-sqlite' | 'powermem-seekdb'
  runtimeMode: 'host-managed' | 'wsl-managed'
  runtimeTarget: 'native' | 'wsl2'
  hostPlatform: string
  hostArch: string
  targetPlatform: string
  targetArch: string
  selectedWslDistro: string | null
  profileKey: string
  dataRoot: string
  runtimeRoot: string
  storagePath: string
  dbPath?: string
  legacyDbPath: string
}

export interface ManagedMemoryBridgeConfig {
  dataRoot: string
  engine: ManagedMemoryStoreContext['engine']
  autoCapture: boolean
  autoRecall: boolean
  inferOnAdd: boolean
  recallLimit: number
  recallScoreThreshold: number
  userId?: string
  agentId?: string
}

export interface ManagedMemoryBridgeEntry {
  enabled: boolean
  config: ManagedMemoryBridgeConfig
}

export interface ManagedMemoryBridgeStatusPayload {
  pluginId: 'memory-clawmaster-powermem'
  slotKey: 'memory'
  state: 'missing' | 'ready' | 'drifted' | 'unsupported'
  issues: string[]
  installed: boolean
  pluginStatus: string | null
  installedPluginPath: string | null
  runtimePluginPath: string | null
  pluginPath: string
  pluginPathExists: boolean
  store: ManagedMemoryStoreContext
  currentSlotValue: string | null
  currentEntry: ManagedMemoryBridgeEntry | null
  desired: {
    slotValue: 'memory-clawmaster-powermem'
    entry: ManagedMemoryBridgeEntry | null
  }
}

export interface ManagedMemoryStatusPayload extends ManagedMemoryStoreContext {
  available: true
  backend: 'service'
  storageType: string
  provisioned: boolean
}

export interface ManagedMemoryStatsPayload extends ManagedMemoryStoreContext {
  storageType: string
  totalMemories: number
  userCount: number
  oldestMemory: string | null
  newestMemory: string | null
}

export interface ManagedMemoryListPayload {
  memories: ManagedMemoryRecord[]
  total: number
  limit: number
  offset: number
}

export interface ManagedMemoryImportRunSummary {
  scanned: number
  imported: number
  updated: number
  skipped: number
  duplicate: number
  failed: number
  importedMemoryCount: number
  lastImportedAt: string
}

export interface ManagedMemoryImportStatusPayload {
  profileKey: string
  runtimeRoot: string
  stateFile: string
  availableSourceCount: number
  trackedSources: number
  importedMemoryCount: number
  lastImportedAt: string | null
  lastRun: ManagedMemoryImportRunSummary | null
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
