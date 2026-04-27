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
    name: 'capability.engine',
    detectCmd: 'openclaw',
    detectArgs: ['--version'],
    required: true,
    installSteps: [
      { cmd: 'npm', args: ['install', '-g', 'openclaw'] },
    ],
  },
  {
    id: 'memory',
    name: 'capability.memory',
    detectCmd: 'openclaw',
    detectArgs: ['--version'],
    required: false,
    installSteps: [],
  },
  {
    id: 'observe',
    name: 'capability.observe',
    detectCmd: 'clawprobe',
    detectArgs: ['--version'],
    required: false,
    installSteps: [
      { cmd: 'npm', args: ['install', '-g', 'clawprobe'] },
    ],
  },
  {
    id: 'ocr',
    name: 'capability.ocr',
    detectCmd: 'openclaw',
    detectArgs: ['skills', 'list', '--json'],
    required: false,
    installSteps: [],
  },
  {
    id: 'agent',
    name: 'capability.agent',
    detectCmd: 'openclaw',
    detectArgs: ['--version'],
    required: false,
    installSteps: [],
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
  channelTokens: Record<string, string> // key → value for each tokenField
  error: string | null
  busy: boolean
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  provider: 'baidu-aistudio',
  apiKey: '',
  customBaseUrl: '',
  model: '',
  customModelId: '',
  gatewayPort: 18789,
  gatewayRunning: false,
  channelType: '',
  channelTokens: {},
  error: null,
  busy: false,
}

export interface ProviderConfig {
  label: string
  labelByLocale?: Partial<Record<'zh' | 'en' | 'ja', string>>
  models: Array<{ id: string; name: string }>
  defaultModel: string
  kind?: 'text' | 'text-to-image'
  /** Runtime provider id used in model refs and existing OpenClaw config */
  runtimeProviderId?: string
  baseUrl?: string // 预置 baseUrl（如 DeepSeek、SiliconFlow）
  needsBaseUrl?: boolean // 需要用户手动输入 baseUrl（如自定义兼容端点）
  /** 自定义 provider 的 API 类型（如 OpenAI-compatible 端点） */
  api?: string
  /** openclaw config key 覆盖 */
  configKeyOverride?: string
  /** API Key 管理页面链接 */
  keyUrl?: string
  /** 凭证名称，默认 API Key */
  credentialLabel?: string
  /** 本地化凭证名称 */
  credentialLabelByLocale?: Partial<Record<'zh' | 'en' | 'ja', string>>
  /** 提供商说明文案 i18n key */
  noteKey?: string
  /** 更详细的能力说明文案 i18n key */
  guideKey?: string
  /** 是否出现在安装向导内 */
  setupEnabled?: boolean
  /** 是否支持实时模型目录 */
  supportsCatalog?: boolean
  /** 推荐的技能 */
  recommendedSkill?: {
    slug: string
    name: string
    descriptionKey: string
  }
}

export type ProviderBadgeTone = 'golden-sponsor'

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
  zai: {
    label: 'GLM (Z.AI)',
    labelByLocale: {
      zh: '智谱 GLM',
      en: 'GLM (Z.AI)',
      ja: 'GLM (Z.AI)',
    },
    api: 'openai-completions',
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    models: [
      { id: 'glm-5.1', name: 'GLM-5.1' },
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-5-turbo', name: 'GLM-5 Turbo' },
      { id: 'glm-5v-turbo', name: 'GLM-5V Turbo' },
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash' },
      { id: 'glm-4.7-flashx', name: 'GLM-4.7 FlashX' },
      { id: 'glm-4.6', name: 'GLM-4.6' },
      { id: 'glm-4.6v', name: 'GLM-4.6V' },
      { id: 'glm-4.5', name: 'GLM-4.5' },
      { id: 'glm-4.5-air', name: 'GLM-4.5 Air' },
      { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash' },
      { id: 'glm-4.5v', name: 'GLM-4.5V' },
    ],
    defaultModel: 'glm-5.1',
  },
  minimax: {
    label: 'MiniMax',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed' },
    ],
    defaultModel: 'MiniMax-M2.7',
  },
  'kimi-coding': {
    label: 'Kimi (Moonshot)',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: [
      { id: 'kimi-k2', name: 'Kimi K2' },
    ],
    defaultModel: 'kimi-k2',
  },
  siliconflow: {
    label: 'SiliconFlow',
    api: 'openai-completions',
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
  'baidu-aistudio': {
    label: 'ERNIE LLM API',
    labelByLocale: {
      zh: '文心大模型',
      en: 'ERNIE LLM API',
      ja: 'ERNIE大規模言語モデルAPI',
    },
    api: 'openai-completions',
    keyUrl: 'https://aistudio.baidu.com/usercenter/token',
    credentialLabel: 'Access Token',
    credentialLabelByLocale: {
      zh: '令牌',
      en: 'Access Token',
      ja: 'アクセストークン',
    },
    noteKey: 'providers.ernieQuotaNote',
    baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
    models: [
      { id: 'ernie-5.0-thinking-preview', name: 'ERNIE 5.0 Thinking Preview' },
      { id: 'ernie-4.5-turbo-vl', name: 'ERNIE 4.5 Turbo VL' },
      { id: 'ernie-4.5-vl-28b-a3b-thinking', name: 'ERNIE 4.5 VL 28B A3B Thinking' },
      { id: 'ernie-4.5-21b-a3b-thinking', name: 'ERNIE 4.5 21B A3B Thinking' },
      { id: 'ernie-4.5-turbo-vl-preview', name: 'ERNIE 4.5 Turbo VL Preview' },
      { id: 'ernie-4.5-turbo-vl-32k', name: 'ERNIE 4.5 Turbo VL 32K' },
      { id: 'ernie-4.5-turbo-128k', name: 'ERNIE 4.5 Turbo 128K' },
      { id: 'ernie-4.5-turbo-128k-preview', name: 'ERNIE 4.5 Turbo 128K Preview' },
      { id: 'ernie-4.5-turbo-32k', name: 'ERNIE 4.5 Turbo 32K' },
      { id: 'ernie-4.5-vl-28b-a3b', name: 'ERNIE 4.5 VL 28B A3B' },
      { id: 'ernie-4.5-21b-a3b', name: 'ERNIE 4.5 21B A3B' },
      { id: 'ernie-4.5-0.3b', name: 'ERNIE 4.5 0.3B' },
      { id: 'ernie-x1.1-preview', name: 'ERNIE X1.1 Preview' },
      { id: 'ernie-x1-turbo-32k', name: 'ERNIE X1 Turbo 32K' },
      { id: 'ernie-4.0-turbo-128k', name: 'ERNIE 4.0 Turbo 128K' },
      { id: 'ernie-4.0-turbo-8k-latest', name: 'ERNIE 4.0 Turbo 8K Latest' },
      { id: 'ernie-4.0-turbo-8k', name: 'ERNIE 4.0 Turbo 8K' },
      { id: 'ernie-4.0-8k-latest', name: 'ERNIE 4.0 8K Latest' },
      { id: 'ernie-4.0-8k', name: 'ERNIE 4.0 8K' },
      { id: 'ernie-3.5-8k', name: 'ERNIE 3.5 8K' },
      { id: 'ernie-speed-pro-128k', name: 'ERNIE Speed Pro 128K' },
      { id: 'ernie-lite-pro-128k', name: 'ERNIE Lite Pro 128K' },
      { id: 'ernie-speed-128k', name: 'ERNIE Speed 128K' },
      { id: 'ernie-speed-8k', name: 'ERNIE Speed 8K' },
      { id: 'ernie-lite-8k', name: 'ERNIE Lite 8K' },
      { id: 'ernie-tiny-8k', name: 'ERNIE Tiny 8K' },
      { id: 'ernie-char-8k', name: 'ERNIE Character 8K' },
    ],
    defaultModel: 'ernie-5.0-thinking-preview',
  },
  'baidu-aistudio-image': {
    label: 'ERNIE-Image',
    labelByLocale: {
      zh: '文心绘图',
      en: 'ERNIE-Image',
      ja: 'ERNIE-Image',
    },
    kind: 'text-to-image',
    api: 'openai-completions',
    keyUrl: 'https://aistudio.baidu.com/usercenter/token',
    credentialLabel: 'Access Token',
    credentialLabelByLocale: {
      zh: '令牌',
      en: 'Access Token',
      ja: 'アクセストークン',
    },
    noteKey: 'providers.ernieImageNote',
    guideKey: 'providers.ernieImageGuide',
    setupEnabled: false,
    supportsCatalog: false,
    recommendedSkill: {
      slug: 'ernie-image',
      name: 'ERNIE-Image Guide',
      descriptionKey: 'providers.ernieImageSkillDesc',
    },
    baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
    models: [
      { id: 'ernie-image-turbo', name: 'ERNIE-Image Turbo' },
    ],
    defaultModel: 'ernie-image-turbo',
  },
  'google-image': {
    label: 'Gemini Image',
    labelByLocale: {
      zh: 'Gemini 绘图',
      en: 'Gemini Image',
      ja: 'Gemini Image',
    },
    kind: 'text-to-image',
    runtimeProviderId: 'google',
    keyUrl: 'https://aistudio.google.com/apikey',
    guideKey: 'providers.googleImageGuide',
    setupEnabled: false,
    supportsCatalog: false,
    recommendedSkill: {
      slug: 'image-generate',
      name: 'Image Generate',
      descriptionKey: 'providers.imageGenerateSkillDesc',
    },
    models: [
      { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image Preview' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
    ],
    defaultModel: 'gemini-3.1-flash-image-preview',
  },
  'openai-image': {
    label: 'GPT Image',
    labelByLocale: {
      zh: 'GPT 绘图',
      en: 'GPT Image',
      ja: 'GPT Image',
    },
    kind: 'text-to-image',
    runtimeProviderId: 'openai',
    keyUrl: 'https://platform.openai.com/api-keys',
    guideKey: 'providers.gptImageGuide',
    setupEnabled: false,
    supportsCatalog: false,
    recommendedSkill: {
      slug: 'image-generate',
      name: 'Image Generate',
      descriptionKey: 'providers.imageGenerateSkillDesc',
    },
    models: [
      { id: 'gpt-image-1', name: 'GPT Image 1' },
    ],
    defaultModel: 'gpt-image-1',
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
  // ── 本地推理 ──
  ollama: {
    label: 'Ollama',
    keyUrl: 'https://ollama.com/library',
    baseUrl: 'http://localhost:11434/v1',
    needsBaseUrl: true,
    configKeyOverride: 'ollama',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'qwen2.5', name: 'Qwen 2.5' },
      { id: 'deepseek-r1', name: 'DeepSeek R1' },
      { id: 'gemma3', name: 'Gemma 3' },
      { id: 'phi4', name: 'Phi 4' },
    ],
    defaultModel: 'llama3.2',
  },
  // ── 自定义兼容端点 ──
  'custom-openai-compatible': {
    label: 'Custom (OpenAI Compatible)',
    api: 'openai-completions',
    needsBaseUrl: true,
    models: [], // 用户手动输入模型 ID
    defaultModel: '',
  },
}

export type ProviderTierId = 'sponsors' | 'featured' | 'compatible-and-local'

export interface ProviderTier {
  id: ProviderTierId
  /** i18n key for the tier heading */
  labelKey: string
  /** provider ids shown by default */
  members: readonly string[]
  /** optional collapsible subgroup (e.g. tier-2 "more") */
  collapsible?: {
    /** i18n key for the "show more" button label */
    labelKey: string
    members: readonly string[]
  }
}

/**
 * Text-provider presentation hierarchy.
 *
 * Tier 1 (invited sponsors): special partner placements.
 * Tier 2 (featured): the default global trio stays visible on first load
 *   alongside the existing commonly used providers; the remaining long tail
 *   expands from the "more" toggle.
 * Tier 3 (compatible + local): OpenAI-compatible custom endpoints plus local
 *   runtimes (Ollama). Anthropic-compatible and LM Studio will land here once
 *   they ship in 0.4.
 */
export const TEXT_PROVIDER_TIERS: readonly ProviderTier[] = [
  {
    id: 'sponsors',
    labelKey: 'providers.tierInvitedSponsors',
    members: ['baidu-aistudio'],
  },
  {
    id: 'featured',
    labelKey: 'providers.tierFeatured',
    members: [
      'openai',
      'anthropic',
      'google',
      'deepseek',
      'zai',
      'kimi-coding',
      'minimax',
      'siliconflow',
      'openrouter',
    ],
    collapsible: {
      labelKey: 'providers.tierFeaturedMore',
      members: [
        'xai',
        'mistral',
        'groq',
        'cerebras',
        'amazon-bedrock',
        'google-vertex',
        'azure-openai-responses',
      ],
    },
  },
  {
    id: 'compatible-and-local',
    labelKey: 'providers.tierCompatibleAndLocal',
    members: ['ollama', 'custom-openai-compatible'],
  },
] as const

/**
 * Flat ordering of every text provider from the tier structure. Retained for
 * consumers that need a simple "which providers are preferred?" list (e.g. the
 * first-run quick-add grid, which slices the top 4).
 */
export const PRIMARY_PROVIDERS = TEXT_PROVIDER_TIERS.flatMap((tier) => [
  ...tier.members,
  ...(tier.collapsible?.members ?? []),
])

export const PRIMARY_IMAGE_PROVIDERS = ['baidu-aistudio-image', 'google-image', 'openai-image'] as const

export const PROVIDER_BADGES: Partial<Record<keyof typeof PROVIDERS, ProviderBadgeTone>> = {
  'baidu-aistudio': 'golden-sponsor',
  'baidu-aistudio-image': 'golden-sponsor',
}

function normalizeProviderLocale(locale?: string): 'zh' | 'en' | 'ja' | undefined {
  return locale?.split('-')[0] as 'zh' | 'en' | 'ja' | undefined
}

export function getProviderLabel(providerId: string, locale?: string): string {
  const provider = PROVIDERS[providerId]
  if (!provider) return providerId

  const normalizedLocale = normalizeProviderLocale(locale)
  return provider.labelByLocale?.[normalizedLocale ?? 'en'] ?? provider.label
}

export function getProviderCredentialLabel(providerId: string, locale?: string): string {
  const provider = PROVIDERS[providerId]
  if (!provider) return 'API Key'

  const normalizedLocale = normalizeProviderLocale(locale)
  return provider.credentialLabelByLocale?.[normalizedLocale ?? 'en'] ?? provider.credentialLabel ?? 'API Key'
}

export function getProviderKind(providerId: string): 'text' | 'text-to-image' {
  return PROVIDERS[providerId]?.kind ?? 'text'
}

export function getProviderRuntimeId(providerId: string): string {
  return PROVIDERS[providerId]?.runtimeProviderId ?? PROVIDERS[providerId]?.configKeyOverride ?? providerId
}

export function getProviderDefaultTarget(providerId: string): 'primary' | 'imageGeneration' {
  return getProviderKind(providerId) === 'text-to-image' ? 'imageGeneration' : 'primary'
}

export function providerSupportsSetup(providerId: string): boolean {
  return PROVIDERS[providerId]?.setupEnabled !== false
}

export interface ChannelTokenField {
  key: string        // CLI flag name (e.g. 'token', 'bot-token')
  label: string      // display label
  placeholder: string
  hint: string       // 格式提示（如 "以 xoxb- 开头，约 70 字符"）
}

export interface ChannelStep {
  /** 操作描述 */
  text: string
  /** 关键路径高亮（如 "Bot → Reset Token"），渲染为加粗 */
  highlight?: string
  /** 此步骤产出的 token field key（渲染为 * 标记） */
  yieldsToken?: string
}

export interface ChannelTypeConfig {
  id: string
  name: string
  tokenFields: ChannelTokenField[]
  /** 创建 Bot 的指引链接 */
  guideUrl: string
  /** 指引链接显示文字 */
  guideLabel: string
  /** 分步设置指引 */
  steps: ChannelStep[]
  /** QR 码扫描登录（无需手动输入 Token） */
  qrLogin?: boolean
  /** 需要先安装的插件包名 */
  installPlugin?: string
  /** 可复制的权限模板 JSON（如飞书） */
  permissionsTemplate?: string
}

// ─── 飞书权限模板 ───

export const FEISHU_PERMISSIONS_TEMPLATE = JSON.stringify([
  "im:message", "im:message:send", "im:message.group_msg", "im:message.p2p_msg",
  "im:chat", "im:chat:create", "im:chat:update", "im:chat:readonly",
  "contact:user.base:readonly", "contact:user.employee_id:readonly",
  "bitable:app", "bitable:app:readonly",
  "docs:doc", "docs:doc:readonly",
  "drive:drive", "drive:drive:readonly",
  "sheets:spreadsheet", "sheets:spreadsheet:readonly",
  "wiki:wiki", "wiki:wiki:readonly",
  "calendar:calendar", "calendar:calendar:readonly",
  "task:task", "task:task:readonly",
  "approval:approval", "approval:approval:readonly",
], null, 2)

export const CHANNEL_TYPES: ChannelTypeConfig[] = [
  {
    id: 'discord',
    name: 'Discord',
    guideUrl: 'https://discord.com/developers/applications',
    guideLabel: 'Discord Developer Portal',
    tokenFields: [
      { key: 'token', label: 'Bot Token', placeholder: 'MTIz...', hint: 'channel.discord.tokenHint' },
    ],
    steps: [
      { text: 'channel.discord.step1', highlight: 'Applications → New Application → Create' },
      { text: 'channel.discord.step2', highlight: 'Bot → Reset Token → Yes, do it! → Copy Token', yieldsToken: 'token' },
      { text: 'channel.discord.step3', highlight: 'Privileged Gateway Intents → Message Content Intent → Save' },
      { text: 'channel.discord.step4', highlight: 'OAuth2 → URL Generator → bot scope → Send Messages, Read Message History' },
      { text: 'channel.discord.step5', highlight: 'Copy URL → Open in browser → Select server → Authorize' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    guideUrl: 'https://api.slack.com/apps',
    guideLabel: 'Slack API Dashboard',
    tokenFields: [
      { key: 'bot-token', label: 'Bot Token (xoxb-)', placeholder: 'xoxb-1234-5678-AbCdEf...', hint: 'channel.slack.botTokenHint' },
      { key: 'app-token', label: 'App Token (xapp-)', placeholder: 'xapp-1-A0123-9876...', hint: 'channel.slack.appTokenHint' },
    ],
    steps: [
      { text: 'channel.slack.step1', highlight: 'Create New App → From scratch → Name → Workspace → Create' },
      { text: 'channel.slack.step2', highlight: 'OAuth & Permissions → Scopes → chat:write, app_mentions:read, im:history' },
      { text: 'channel.slack.step3', highlight: 'Install to Workspace → Allow → Copy Bot User OAuth Token', yieldsToken: 'bot-token' },
      { text: 'channel.slack.step4', highlight: 'Basic Information → App-Level Tokens → Generate → connections:write', yieldsToken: 'app-token' },
      { text: 'channel.slack.step5', highlight: 'Socket Mode → Enable Socket Mode' },
      { text: 'channel.slack.step6', highlight: 'Event Subscriptions → Subscribe to bot events → message.im, app_mention → Save' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    guideUrl: 'https://t.me/BotFather',
    guideLabel: '@BotFather',
    tokenFields: [
      { key: 'token', label: 'Bot Token', placeholder: '123456789:AAHk-AbCdEf...', hint: 'channel.telegram.tokenHint' },
    ],
    steps: [
      { text: 'channel.telegram.step1', highlight: 'Telegram → @BotFather → Start' },
      { text: 'channel.telegram.step2', highlight: '/newbot → Bot name → Bot username (ending in "bot")' },
      { text: 'channel.telegram.step3', highlight: '"Use this token to access the HTTP API:" → Copy token', yieldsToken: 'token' },
    ],
  },
  {
    id: 'feishu',
    name: 'channel.feishu.name',
    guideUrl: 'https://open.feishu.cn/app',
    guideLabel: 'channel.feishu.guideLabel',
    tokenFields: [
      { key: 'token', label: 'App ID + App Secret', placeholder: 'cli_a1b2c3d4e5f6...', hint: 'channel.feishu.tokenHint' },
    ],
    steps: [
      { text: 'channel.feishu.step1', highlight: 'channel.feishu.step1.highlight' },
      { text: 'channel.feishu.step2', highlight: 'channel.feishu.step2.highlight', yieldsToken: 'token' },
      { text: 'channel.feishu.step3', highlight: 'channel.feishu.step3.highlight' },
      { text: 'channel.feishu.step4', highlight: 'channel.feishu.step4.highlight' },
      { text: 'channel.feishu.step5', highlight: 'channel.feishu.step5.highlight' },
      { text: 'channel.feishu.step6', highlight: 'channel.feishu.step6.highlight' },
    ],
    permissionsTemplate: FEISHU_PERMISSIONS_TEMPLATE,
  },
  {
    id: 'wechat',
    name: 'channel.wechat.name',
    guideUrl: 'https://github.com/nicepkg/openclaw-weixin',
    guideLabel: 'openclaw-weixin',
    tokenFields: [],
    qrLogin: true,
    installPlugin: '@tencent-weixin/openclaw-weixin',
    steps: [
      { text: 'channel.wechat.step1', highlight: 'channel.wechat.step1.highlight' },
      { text: 'channel.wechat.step2', highlight: 'channel.wechat.step2.highlight' },
      { text: 'channel.wechat.step3', highlight: 'channel.wechat.step3.highlight' },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    guideUrl: 'https://web.whatsapp.com',
    guideLabel: 'WhatsApp Web',
    tokenFields: [],
    qrLogin: true,
    steps: [
      { text: 'channel.whatsapp.step1', highlight: 'channel.whatsapp.step1.highlight' },
      { text: 'channel.whatsapp.step2', highlight: 'channel.whatsapp.step2.highlight' },
      { text: 'channel.whatsapp.step3', highlight: 'channel.whatsapp.step3.highlight' },
    ],
  },
]
