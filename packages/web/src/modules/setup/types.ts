/** 能力项 ID */
export type CapabilityId = 'engine' | 'memory' | 'observe' | 'ocr' | 'agent'

/** 能力项状态 */
export interface CapabilityStatus {
  id: CapabilityId
  name: string
  status: 'checking' | 'installed' | 'not_installed' | 'error'
  version?: string
  error?: string
}

/** 安装进度 */
export interface InstallProgress {
  id: CapabilityId
  status: 'waiting' | 'installing' | 'done' | 'error'
  progress?: number // 0-100
  log?: string // 当前安装输出行
  error?: string
}

/** 安装向导总状态 */
export type SetupPhase =
  | 'detecting' | 'ready' | 'installing' | 'done' | 'error'
  | 'onboard_init' | 'onboard_apikey' | 'onboard_model'
  | 'onboard_gateway' | 'onboard_channel' | 'onboard_done'

/** 能力定义（用户看到的名称和底层安装命令的映射） */
export interface CapabilityDef {
  id: CapabilityId
  name: string
  detectCmd: string
  detectArgs: string[]
  installSteps: Array<{ cmd: string; args: string[] }>
  /** 是否必装。false 表示可在对应模块页面按需安装 */
  required: boolean
}

/** 五项内置能力定义 */
export const CAPABILITIES: CapabilityDef[] = [
  {
    id: 'engine',
    name: '核心引擎',
    detectCmd: 'openclaw',
    detectArgs: ['--version'],
    required: true,
    installSteps: [
      { cmd: 'npm', args: ['install', '-g', 'openclaw'] },
    ],
  },
  {
    id: 'memory',
    name: '记忆管理',
    detectCmd: 'openclaw',
    detectArgs: ['ltm', 'health'],
    required: false,
    installSteps: [
      // 1. 创建目录 + 虚拟环境
      { cmd: 'mkdir', args: ['-p', '~/.openclaw/powermem'] },
      { cmd: 'python3', args: ['-m', 'venv', '~/.openclaw/powermem/.venv'] },
      // 2. 在虚拟环境中安装 PowerMem
      { cmd: '~/.openclaw/powermem/.venv/bin/pip', args: ['install', 'powermem'] },
      // 3. 安装 OpenClaw 插件
      { cmd: 'openclaw', args: ['plugins', 'install', 'memory-powermem'] },
      // 4. 通过 ClawHub Skill 自动完成配置 + 槽位切换
      { cmd: 'clawhub', args: ['install', 'teingi/install-powermem-memory-minimal'] },
      // 5. 启动 PowerMem HTTP API 服务（供大师 GUI 调用）
      { cmd: 'bash', args: ['-c', 'cd ~/.openclaw/powermem && source .venv/bin/activate && nohup powermem-server --host 0.0.0.0 --port 8000 > powermem.log 2>&1 &'] },
    ],
  },
  {
    id: 'observe',
    name: '可观测性',
    detectCmd: 'clawprobe',
    detectArgs: ['--version'],
    required: false,
    installSteps: [
      { cmd: 'npm', args: ['install', '-g', 'clawprobe'] },
    ],
  },
  {
    id: 'ocr',
    name: '文档与图像识别',
    detectCmd: 'clawhub',
    detectArgs: ['list', '--json'],
    required: false,
    installSteps: [
      { cmd: 'clawhub', args: ['install', 'paddleocr-doc-parsing'] },
      { cmd: 'clawhub', args: ['install', 'paddleocr-text-recognition'] },
    ],
  },
  {
    id: 'agent',
    name: '智能体编排',
    detectCmd: 'python3',
    detectArgs: ['-c', 'import deepagents; print(deepagents.__version__)'],
    required: false,
    installSteps: [
      { cmd: 'pip', args: ['install', 'langchain', 'langgraph', 'deepagents'] },
    ],
  },
]

// ─── 配置引导（Onboarding）类型 ───

export interface OnboardingState {
  provider: string // provider id (key in PROVIDERS)
  apiKey: string
  customBaseUrl: string // 用于 custom-openai-compatible 或有自定义 baseUrl 需求的提供商
  model: string
  customModelId: string // 用于手动输入模型 ID
  gatewayPort: number
  gatewayRunning: boolean
  channelType: string
  channelToken: string
  error: string | null
  busy: boolean
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  provider: 'openai',
  apiKey: '',
  customBaseUrl: '',
  model: '',
  customModelId: '',
  gatewayPort: 18789,
  gatewayRunning: false,
  channelType: '',
  channelToken: '',
  error: null,
  busy: false,
}

export interface ProviderConfig {
  label: string
  models: Array<{ id: string; name: string }>
  defaultModel: string
  baseUrl?: string // 预置 baseUrl（如 DeepSeek、SiliconFlow）
  needsBaseUrl?: boolean // 需要用户手动输入 baseUrl（如自定义兼容端点）
  /** openclaw config key 覆盖（如 siliconflow 使用 openrouter 作为 config key 以支持带斜杠的模型 ID） */
  configKeyOverride?: string
  /** API Key 管理页面链接 */
  keyUrl?: string
}

/**
 * 所有提供商共用 config path 模式: models.providers.<id>.apiKey
 * baseUrl 仅在需要自定义端点时设置
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  // ── 国际主流 ──
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
    defaultModel: 'gpt-4.1-mini',
  },
  anthropic: {
    label: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    defaultModel: 'claude-sonnet-4-6',
  },
  google: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
    defaultModel: 'gemini-2.5-flash',
  },
  xai: {
    label: 'xAI (Grok)',
    keyUrl: 'https://console.x.ai/team/default/api-keys',
    models: [
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini' },
      { id: 'grok-2', name: 'Grok 2' },
    ],
    defaultModel: 'grok-3-mini',
  },
  mistral: {
    label: 'Mistral AI',
    keyUrl: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'codestral-latest', name: 'Codestral' },
    ],
    defaultModel: 'mistral-small-latest',
  },
  groq: {
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    ],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  // ── 国内主流 ──
  deepseek: {
    label: 'DeepSeek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
    ],
    defaultModel: 'deepseek-chat',
  },
  minimax: {
    label: 'MiniMax',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 高速' },
    ],
    defaultModel: 'MiniMax-M2.7',
  },
  'kimi-coding': {
    label: 'Kimi (月之暗面)',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: [
      { id: 'kimi-k2', name: 'Kimi K2' },
    ],
    defaultModel: 'kimi-k2',
  },
  siliconflow: {
    label: 'SiliconFlow (硅基流动)',
    // 使用 openrouter 作为 config key，因为 openclaw 的 openrouter 提供商
    // 正确处理 baseUrl + 带斜杠的模型 ID（如 deepseek-ai/DeepSeek-V3）
    configKeyOverride: 'openrouter',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B' },
      { id: 'Qwen/Qwen3-30B-A3B', name: 'Qwen3 30B' },
      { id: 'Pro/deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 (Pro)' },
      { id: 'Pro/deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1 (Pro)' },
    ],
    defaultModel: 'deepseek-ai/DeepSeek-V3',
  },
  // ── 聚合平台 ──
  openrouter: {
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
    ],
    defaultModel: 'anthropic/claude-sonnet-4',
  },
  // ── 云厂商 ──
  'amazon-bedrock': {
    label: 'Amazon Bedrock',
    keyUrl: 'https://console.aws.amazon.com/bedrock/',
    models: [
      { id: 'anthropic.claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'amazon.nova-premier-v1:0', name: 'Nova Premier' },
      { id: 'amazon.nova-pro-v1:0', name: 'Nova Pro' },
    ],
    defaultModel: 'anthropic.claude-sonnet-4-6',
  },
  'google-vertex': {
    label: 'Google Vertex AI',
    keyUrl: 'https://console.cloud.google.com/apis/credentials',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    defaultModel: 'gemini-2.5-flash',
  },
  'azure-openai-responses': {
    label: 'Azure OpenAI',
    keyUrl: 'https://portal.azure.com/',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
    ],
    defaultModel: 'gpt-4.1-mini',
  },
  cerebras: {
    label: 'Cerebras',
    keyUrl: 'https://cloud.cerebras.ai/',
    models: [
      { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen 3 235B' },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B' },
    ],
    defaultModel: 'qwen-3-235b-a22b-instruct-2507',
  },
  // ── 自定义兼容端点 ──
  'custom-openai-compatible': {
    label: '自定义 (OpenAI 兼容)',
    configKeyOverride: 'openrouter', // 使用 openrouter 以支持带斜杠的模型 ID
    needsBaseUrl: true,
    models: [], // 用户手动输入模型 ID
    defaultModel: '',
  },
}

/** 首屏展示的提供商（按钮行），其余折叠在"更多"中 */
export const PRIMARY_PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'siliconflow', 'openrouter'] as const

export interface ChannelTypeConfig {
  id: string
  name: string
  tokenLabel: string
}

export const CHANNEL_TYPES: ChannelTypeConfig[] = [
  { id: 'telegram', name: 'Telegram', tokenLabel: 'Bot Token' },
  { id: 'discord', name: 'Discord', tokenLabel: 'Bot Token' },
  { id: 'feishu', name: '飞书 (Feishu)', tokenLabel: 'App Token' },
  { id: 'slack', name: 'Slack', tokenLabel: 'Bot Token' },
]
