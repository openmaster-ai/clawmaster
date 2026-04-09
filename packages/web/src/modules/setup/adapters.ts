/**
 * 安装向导适配器
 *
 * 两套实现：
 * - realSetupAdapter: 调用真实 CLI
 * - demoSetupAdapter: 模拟全流程（?demo=install 触发）
 */

import { execCommand } from '@/shared/adapters/platform'
import { startGatewayResult, getGatewayStatusResult } from '@/shared/adapters/gateway'
import { getConfigResult, resolvePluginRootResult, setConfigResult } from '@/shared/adapters/openclaw'
import { installSkillResult } from '@/shared/adapters/clawhub'
import { detectSystemResult, probeHttpStatusResult } from '@/shared/adapters/system'
import { installOpenclawGlobalResult } from '@/shared/adapters/npmOpenclaw'
import {
  bootstrapAfterInstallResult,
  formatBootstrapSummary,
} from '@/shared/adapters/openclawBootstrap'
import {
  clearPaddleOcrResult,
  getPaddleOcrStatusResult,
  previewPaddleOcrResult,
  setupPaddleOcrResult,
} from '@/shared/adapters/paddleocr'
import {
  capabilityToPaddleOcrModuleId,
  getPaddleOcrModuleStatus,
  PADDLEOCR_DOC_SKILL_ID,
  PADDLEOCR_TEXT_SKILL_ID,
} from '@/shared/paddleocr'
import type {
  PaddleOcrClearInput,
  PaddleOcrPreviewPayload,
  PaddleOcrSetupInput,
  PaddleOcrStatusPayload,
} from '@/lib/types'
import {
  CAPABILITIES,
  PROVIDERS,
  getProviderRuntimeId,
  type CapabilityStatus,
  type InstallProgress,
  type CapabilityId,
} from './types'

const ERNIE_IMAGE_PLUGIN_ID = 'openclaw-ernie-image'
const ERNIE_IMAGE_PLUGIN_DIRNAME = 'openclaw-ernie-image'
const ERNIE_IMAGE_PLUGIN_VERSION = '0.1.0'
const ERNIE_IMAGE_SKILL_ID = 'ernie-image'

function uniquePaths(paths: string[]): string[] {
  return paths.filter((value, index, array) => value.trim() && array.indexOf(value) === index)
}

function trimTrailingPathSeparators(value: string) {
  return value.replace(/[\\/]+$/, '')
}

function replaceLeafPathSegment(candidate: string, newLeaf: string) {
  const trimmed = trimTrailingPathSeparators(candidate)
  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (separatorIndex === -1) return newLeaf
  return `${trimmed.slice(0, separatorIndex + 1)}${newLeaf}`
}

function inferRepoPluginPathCandidates(config: Awaited<ReturnType<typeof getConfigResult>>['data']): string[] {
  const memoryInstallRecord = config?.plugins?.installs?.['memory-clawmaster-powermem']
  const ernieInstallRecord = config?.plugins?.installs?.[ERNIE_IMAGE_PLUGIN_ID]
  const exactCandidates = [
    ernieInstallRecord?.sourcePath,
    ernieInstallRecord?.installPath,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const candidates = [
    ...(config?.plugins?.load?.paths ?? []),
    memoryInstallRecord?.sourcePath,
    memoryInstallRecord?.installPath,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const inferred: string[] = []

  for (const candidate of candidates) {
    const trimmedCandidate = trimTrailingPathSeparators(candidate)
    const normalizedCandidate = trimmedCandidate.replace(/\\/g, '/')

    if (normalizedCandidate.endsWith(`/plugins/${ERNIE_IMAGE_PLUGIN_DIRNAME}`)) {
      inferred.push(trimmedCandidate)
      continue
    }

    if (normalizedCandidate.endsWith('/plugins/memory-clawmaster-powermem')) {
      inferred.push(replaceLeafPathSegment(trimmedCandidate, ERNIE_IMAGE_PLUGIN_DIRNAME))
    }
  }

  return uniquePaths([...exactCandidates, ...inferred])
}

async function resolveExistingErnieImagePluginPath(
  config: Awaited<ReturnType<typeof getConfigResult>>['data'],
): Promise<string | null> {
  const inferredCandidates = inferRepoPluginPathCandidates(config)
  const resolved = await resolvePluginRootResult({
    pluginId: ERNIE_IMAGE_PLUGIN_ID,
    candidates: inferredCandidates,
  })
  if (!resolved.success) return null
  return resolved.data ?? null
}

function getAliasedProviderCredentialFields(provider: string): { apiKey: string; baseUrl: string } | null {
  if (provider === 'openai-image' || provider === 'google-image') {
    return {
      apiKey: 'imageApiKey',
      baseUrl: 'imageBaseUrl',
    }
  }

  return null
}

async function ensureErnieImagePluginRegistered(): Promise<void> {
  const configResult = await getConfigResult()
  if (!configResult.success) {
    throw new Error(configResult.error ?? 'Failed to load config before registering ERNIE-Image plugin')
  }

  const pluginPath = await resolveExistingErnieImagePluginPath(configResult.data)
  if (!pluginPath) {
    throw new Error('Failed to resolve ERNIE-Image runtime plugin root')
  }

  const existingPaths = configResult.data?.plugins?.load?.paths ?? []
  const nextPaths = uniquePaths([...existingPaths, pluginPath])
  if (nextPaths.length !== existingPaths.length) {
    const writePaths = await setConfigResult('plugins.load.paths', nextPaths)
    if (!writePaths.success) {
      throw new Error(writePaths.error ?? 'Failed to register ERNIE-Image plugin path')
    }
  }

  const pluginEnabled = configResult.data?.plugins?.entries?.[ERNIE_IMAGE_PLUGIN_ID]?.enabled === true
  if (!pluginEnabled) {
    const writeEntry = await setConfigResult(`plugins.entries.${ERNIE_IMAGE_PLUGIN_ID}`, { enabled: true })
    if (!writeEntry.success) {
      throw new Error(writeEntry.error ?? 'Failed to enable ERNIE-Image plugin')
    }
  }

  const installRecord = configResult.data?.plugins?.installs?.[ERNIE_IMAGE_PLUGIN_ID]
  if (!installRecord) {
    const writeInstall = await setConfigResult(`plugins.installs.${ERNIE_IMAGE_PLUGIN_ID}`, {
      source: 'path',
      sourcePath: pluginPath,
      installPath: pluginPath,
      version: ERNIE_IMAGE_PLUGIN_VERSION,
      installedAt: new Date().toISOString(),
    })
    if (!writeInstall.success) {
      throw new Error(writeInstall.error ?? 'Failed to register ERNIE-Image plugin install')
    }
  }
}

async function ensureErnieImageSkillInstalledAndEnabled(): Promise<void> {
  const installResult = await installSkillResult(ERNIE_IMAGE_SKILL_ID)
  if (!installResult.success) {
    throw new Error(installResult.error ?? 'Failed to install ERNIE-Image skill')
  }

  const enableResult = await setConfigResult(`skills.entries.${ERNIE_IMAGE_SKILL_ID}.enabled`, true)
  if (!enableResult.success) {
    throw new Error(enableResult.error ?? 'Failed to enable ERNIE-Image skill')
  }
}

// ─── 接口 ───

export interface OnboardingAdapter {
  /** 初始化配置文件 */
  initConfig(): Promise<void>
  /** 快速验证 API Key 是否可用 */
  testApiKey(provider: string, apiKey: string, baseUrl?: string): Promise<boolean>
  /** 设置 LLM 提供商 API Key（及 baseUrl） */
  setApiKey(provider: string, apiKey: string, baseUrl?: string): Promise<void>
  /** 设置默认模型 */
  setDefaultModel(model: string): Promise<void>
  /** 后台启动网关 */
  startGateway(port: number): Promise<void>
  /** 检测网关是否可达 */
  checkGateway(port: number): Promise<boolean>
  /** 添加消息通道 */
  addChannel(channelType: string, tokens: Record<string, string>): Promise<void>
  /** QR 码登录通道（WeChat/WhatsApp） */
  loginChannel(channelType: string): Promise<string>
  /** 安装插件包 */
  installPlugin(packageName: string): Promise<void>
}

export interface PaddleOcrAdapter {
  getStatus(): Promise<PaddleOcrStatusPayload>
  setup(input: PaddleOcrSetupInput): Promise<PaddleOcrStatusPayload>
  preview(input: PaddleOcrSetupInput): Promise<PaddleOcrPreviewPayload>
  clear(input: PaddleOcrClearInput): Promise<PaddleOcrStatusPayload>
}

export interface SetupAdapter {
  /** 逐项检测五项能力，通过回调报告每项状态 */
  detectCapabilities(onUpdate: (status: CapabilityStatus) => void): Promise<CapabilityStatus[]>
  /** 安装指定能力列表，通过回调报告进度 */
  installCapabilities(ids: CapabilityId[], onProgress: (progress: InstallProgress) => void): Promise<void>
  /** 配置引导 */
  onboarding: OnboardingAdapter
  paddleocr: PaddleOcrAdapter
}

// ─── 真实实现 ───

const realOnboardingAdapter: OnboardingAdapter = {
  async initConfig() {
    await execCommand('openclaw', ['onboard', '--mode', 'local', '--non-interactive', '--accept-risk', '--skip-health'])
  },

  async testApiKey(provider, apiKey, baseUrl?) {
    const cfg = PROVIDERS[provider]
    const providerKind = cfg?.kind ?? 'text'
    const runtimeProviderId = getProviderRuntimeId(provider)

    // Ollama: probe native /api/tags endpoint (no auth needed)
    if (provider === 'ollama') {
      const ollamaBase = (baseUrl || cfg?.baseUrl || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '')
      try {
        const result = await probeHttpStatusResult({
          url: `${ollamaBase}/api/tags`,
          method: 'GET',
          timeoutMs: 5000,
        })
        return result.success && result.data?.ok === true
      } catch {
        return false
      }
    }

    if (provider === 'google-image') {
      const root = (baseUrl || cfg?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
      const modelId = cfg?.defaultModel || cfg?.models?.[0]?.id || 'gemini-3.1-flash-image-preview'
      try {
        const result = await probeHttpStatusResult({
          url: `${root}/models/${encodeURIComponent(modelId)}?key=${encodeURIComponent(apiKey)}`,
          method: 'GET',
          timeoutMs: 10000,
        })
        return result.success && result.data?.status === 200
      } catch {
        return false
      }
    }

    const endpoint = baseUrl || cfg?.baseUrl || 'https://api.openai.com/v1'

    if (providerKind === 'text-to-image') {
      try {
        const result = await probeHttpStatusResult({
          url: `${endpoint}/images/generations`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: cfg?.defaultModel || cfg?.models?.[0]?.id || 'ernie-image-turbo',
            prompt: 'A small paper lantern on a wooden table',
            n: 1,
            response_format: 'url',
            size: '1024x1024',
          }),
          timeoutMs: 20000,
        })
        return result.success && result.data?.status === 200
      } catch {
        return false
      }
    }

    const configResult = await getConfigResult()
    const configuredProvider = configResult.success ? configResult.data?.models?.providers?.[runtimeProviderId] : undefined
    const defaultModel = configResult.success ? configResult.data?.agents?.defaults?.model?.primary : undefined
    const activeModelId = defaultModel?.startsWith(`${runtimeProviderId}/`)
      ? defaultModel.slice(runtimeProviderId.length + 1)
      : undefined
    const configuredModel = configuredProvider?.models?.find((model) => {
      const id = typeof model === 'string' ? model.trim() : model?.id?.trim()
      return id && id === activeModelId
    }) ?? configuredProvider?.models?.[0]
    const configuredModelId = typeof configuredModel === 'string'
      ? configuredModel.trim()
      : configuredModel?.id?.trim()
    const probeModels = [
      activeModelId?.trim() || undefined,
      cfg?.defaultModel,
      cfg?.models?.[0]?.id,
      configuredModelId,
      'gpt-4o-mini',
    ].filter((model, index, array): model is string => {
      if (!model) return false
      return array.indexOf(model) === index
    })

    const probeModel = async (model: string) => {
      const result = await probeHttpStatusResult({
        url: `${endpoint}/chat/completions`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        timeoutMs: 10000,
      })
      return result.success && result.data?.status === 200
    }

    try {
      for (const model of probeModels) {
        if (await probeModel(model)) {
          return true
        }
      }

      return false
    } catch {
      return false
    }
  },

  async setApiKey(provider, apiKey, baseUrl?) {
    const cfg = PROVIDERS[provider]
    const configKey = getProviderRuntimeId(provider)
    const effectiveBaseUrl = baseUrl || cfg?.baseUrl
    const configResult = await getConfigResult()
    const existingProvider =
      configResult.success && configResult.data?.models?.providers?.[configKey]
        ? configResult.data.models.providers[configKey]
        : undefined
    const aliasedCredentialFields = getAliasedProviderCredentialFields(provider)
    const isAliasedProvider = Boolean(aliasedCredentialFields)
    // Ollama: use placeholder key, always include baseUrl
    const effectiveKey = provider === 'ollama' ? (apiKey || 'ollama') : apiKey
    const providerObj: Record<string, unknown> = {
      ...(existingProvider ?? {}),
    }
    const hasPrimaryApiKey =
      (typeof providerObj.apiKey === 'string' && providerObj.apiKey.trim().length > 0) ||
      (typeof providerObj.api_key === 'string' && providerObj.api_key.trim().length > 0)

    if (aliasedCredentialFields) {
      providerObj[aliasedCredentialFields.apiKey] = effectiveKey
      if (!hasPrimaryApiKey) {
        providerObj.apiKey = effectiveKey
      }
    } else {
      providerObj.apiKey = effectiveKey
    }
    if (!isAliasedProvider) {
      providerObj.models = []
    }
    if (cfg?.api && !isAliasedProvider) {
      providerObj.api = cfg.api
      providerObj.models = cfg.models.map((model) => ({
        id: model.id,
        name: model.name,
      }))
    }
    if (effectiveBaseUrl) {
      if (aliasedCredentialFields) {
        providerObj[aliasedCredentialFields.baseUrl] = effectiveBaseUrl
        if (!providerObj.baseUrl) {
          providerObj.baseUrl = effectiveBaseUrl
        }
      } else {
        providerObj.baseUrl = effectiveBaseUrl
      }
    }

    if (provider === 'baidu-aistudio-image') {
      await ensureErnieImagePluginRegistered()
      await ensureErnieImageSkillInstalledAndEnabled()
    }

    const r = await setConfigResult(`models.providers.${configKey}`, providerObj)
    if (!r.success) throw new Error(r.error ?? 'Failed to set API key')
  },

  async setDefaultModel(model) {
    await execCommand('openclaw', ['models', 'set', model])
  },

  async startGateway(_port) {
    // Use the cross-platform gateway adapter (Tauri invoke or POST /api/gateway/start)
    const r = await startGatewayResult()
    if (!r.success) throw new Error(r.error ?? 'Failed to start gateway')
    // Give the gateway a moment to start
    await new Promise((r) => setTimeout(r, 2000))
  },

  async checkGateway(_port) {
    // Use the cross-platform gateway status adapter
    const r = await getGatewayStatusResult()
    return r.success && !!r.data?.running
  },

  async addChannel(channelType, tokens) {
    const args = ['channels', 'add', '--channel', channelType]
    for (const [key, value] of Object.entries(tokens)) {
      if (value.trim()) args.push(`--${key}`, value.trim())
    }
    await execCommand('openclaw', args)
  },

  async loginChannel(channelType) {
    // Fire-and-forget: interactive login runs in background
    // The user scans QR in phone app; CLI handles the rest
    execCommand('openclaw', ['channels', 'login', '--channel', channelType]).catch(() => {})
    // Poll channel status until connected
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const out = await execCommand('openclaw', ['channels', 'status', '--channel', channelType])
        if (out.includes('connected') || out.includes('ready') || out.includes('online')) {
          return 'connected'
        }
      } catch { /* keep polling */ }
    }
    return 'timeout'
  },

  async installPlugin(packageName) {
    await execCommand('npm', ['install', '-g', packageName])
  },
}

const realPaddleOcrAdapter: PaddleOcrAdapter = {
  async getStatus() {
    const result = await getPaddleOcrStatusResult()
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to load PaddleOCR status')
    }
    return result.data
  },

  async setup(input) {
    const result = await setupPaddleOcrResult(input)
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to configure PaddleOCR')
    }
    return result.data
  },

  async preview(input) {
    const result = await previewPaddleOcrResult(input)
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to preview PaddleOCR')
    }
    return result.data
  },

  async clear(input) {
    const result = await clearPaddleOcrResult(input)
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to clear PaddleOCR configuration')
    }
    return result.data
  },
}

function detectInstalledCapability(cap: (typeof CAPABILITIES)[number]): Promise<CapabilityStatus> {
  if (cap.id === 'memory') {
    return detectMemoryCapability()
  }

  return execCommand(cap.detectCmd, cap.detectArgs).then((output) => {
    const match = output.match(/v?(\d+\.\d+[\w.-]*)/)
    return {
      id: cap.id,
      name: cap.name,
      status: 'installed',
      version: match ? match[1] : output.trim().slice(0, 20),
    } satisfies CapabilityStatus
  })
}

function mapPaddleOcrCapabilityStatus(
  cap: (typeof CAPABILITIES)[number],
  payload: PaddleOcrStatusPayload,
): CapabilityStatus {
  const moduleId = capabilityToPaddleOcrModuleId(cap.id as 'ocr_text' | 'ocr_doc')
  const moduleStatus = getPaddleOcrModuleStatus(payload, moduleId)

  if (moduleStatus.configured) {
    return {
      id: cap.id,
      name: cap.name,
      status: 'ready',
    }
  }

  if (moduleStatus.apiUrlConfigured && moduleStatus.missing) {
    return {
      id: cap.id,
      name: cap.name,
      status: 'error',
      error: 'Bundled module is missing',
    }
  }

  return {
    id: cap.id,
    name: cap.name,
    status: 'needs_setup',
  }
}

async function installEngineCapability(
  onProgress: (progress: InstallProgress) => void,
): Promise<void> {
  onProgress({
    id: 'engine',
    status: 'installing',
    progress: 20,
    log: 'npm install -g openclaw',
  })

  const installResult = await installOpenclawGlobalResult('latest')
  if (!installResult.success || !installResult.data) {
    throw new Error(installResult.error ?? 'Failed to install OpenClaw CLI')
  }
  if (!installResult.data.ok) {
    throw new Error(
      installResult.data.stderr || installResult.data.stdout || 'OpenClaw CLI install failed',
    )
  }

  onProgress({
    id: 'engine',
    status: 'installing',
    progress: 75,
    log: 'openclaw doctor --fix',
  })

  const bootstrapResult = await bootstrapAfterInstallResult()
  if (!bootstrapResult.success) {
    throw new Error(formatBootstrapSummary(bootstrapResult))
  }
}

export const realSetupAdapter: SetupAdapter = {
  onboarding: realOnboardingAdapter,
  paddleocr: realPaddleOcrAdapter,

  async detectCapabilities(onUpdate) {
    const systemResult = await detectSystemResult()
    const detectedOpenclaw = systemResult.success ? systemResult.data?.openclaw : null
    const detectedOpenclawInstalled = Boolean(detectedOpenclaw?.installed)
    const detectedOpenclawVersion = detectedOpenclaw?.version?.trim() || undefined
    let paddlePromise: Promise<PaddleOcrStatusPayload> | null = null

    return Promise.all(
      CAPABILITIES.map(async (cap) => {
        onUpdate({ id: cap.id, name: cap.name, status: 'checking' })

        if (
          (cap.id === 'engine' || cap.id === 'memory' || cap.id === 'agent') &&
          detectedOpenclawInstalled
        ) {
          const status: CapabilityStatus = {
            id: cap.id,
            name: cap.name,
            status: 'installed',
            version: detectedOpenclawVersion,
          }
          onUpdate(status)
          return status
        }

        try {
          if (cap.action === 'configure') {
            paddlePromise ??= realPaddleOcrAdapter.getStatus()
            const payload = await paddlePromise
            const status = mapPaddleOcrCapabilityStatus(cap, payload)
            onUpdate(status)
            return status
          }

          const status = await detectInstalledCapability(cap)
          onUpdate(status)
          return status
        } catch (error) {
          const status: CapabilityStatus = {
            id: cap.id,
            name: cap.name,
            status: cap.action === 'configure' ? 'error' : 'not_installed',
            error: error instanceof Error ? error.message : String(error),
          }
          onUpdate(status)
          return status
        }
      }),
    )
  },

  async installCapabilities(ids, onProgress) {
    // 逐项安装
    const failures: string[] = []
    for (const id of ids) {
      const cap = CAPABILITIES.find((c) => c.id === id)
      if (!cap || cap.action !== 'install' || !cap.installSteps?.length) continue

      onProgress({ id, status: 'installing', progress: 0 })

      try {
        if (id === 'engine') {
          await installEngineCapability(onProgress)
          onProgress({ id, status: 'done', progress: 100 })
          continue
        }

        const totalSteps = cap.installSteps.length
        for (let i = 0; i < totalSteps; i++) {
          const step = cap.installSteps[i]
          onProgress({
            id,
            status: 'installing',
            progress: Math.round(((i + 0.5) / totalSteps) * 100),
            log: `${step.cmd} ${step.args.join(' ')}`,
          })

          await execCommand(step.cmd, step.args)
        }

        onProgress({ id, status: 'done', progress: 100 })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onProgress({
          id,
          status: 'error',
          error: message,
        })
        failures.push(`${id}: ${message}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(failures.join('\n'))
    }
  },
}

// ─── Demo 实现 ───

const DEMO_DETECT_RESULTS: Record<Exclude<CapabilityId, 'ocr_text' | 'ocr_doc'>, { installed: boolean; version: string }> = {
  engine: { installed: true, version: '2026.3.13' },
  memory: { installed: true, version: '2026.3.13' },
  observe: { installed: false, version: '' },
  agent: { installed: true, version: '2026.3.13' },
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const demoOnboardingAdapter: OnboardingAdapter = {
  async initConfig() {
    await delay(800)
  },
  async testApiKey() {
    await delay(800)
    return true
  },
  async setApiKey() {
    await delay(600)
  },
  async setDefaultModel() {
    await delay(400)
  },
  async startGateway() {
    await delay(1200)
  },
  async checkGateway() {
    await delay(500)
    return true
  },
  async addChannel(_type, _tokens) {
    await delay(700)
  },
  async loginChannel() {
    await delay(3000)
    return 'connected'
  },
  async installPlugin() {
    await delay(2000)
  },
}

type DemoPaddleOcrModuleState = {
  configured: boolean
  accessTokenConfigured: boolean
  apiUrl?: string
}

const demoPaddleOcrConfiguredState: Record<
  typeof PADDLEOCR_TEXT_SKILL_ID | typeof PADDLEOCR_DOC_SKILL_ID,
  DemoPaddleOcrModuleState
> = {
  [PADDLEOCR_TEXT_SKILL_ID]: {
    configured: false,
    accessTokenConfigured: false,
  },
  [PADDLEOCR_DOC_SKILL_ID]: {
    configured: false,
    accessTokenConfigured: false,
  },
}

function makeDemoPreviewPayload(
  moduleId: typeof PADDLEOCR_TEXT_SKILL_ID | typeof PADDLEOCR_DOC_SKILL_ID,
  apiUrl: string,
): PaddleOcrPreviewPayload {
  if (moduleId === PADDLEOCR_TEXT_SKILL_ID) {
    const extractedText = [
      'ClawMaster PaddleOCR Preview',
      'Order #A-1024',
      'Total: 42.80 USD',
      'Ship to: Shanghai',
    ].join('\n')
    return {
      moduleId,
      apiUrl,
      latencyMs: 428,
      pageCount: 1,
      textLineCount: 4,
      extractedText,
      responsePreview: JSON.stringify(
        {
          ocrResults: [
            {
              prunedResult: {
                rec_texts: extractedText.split('\n'),
                rec_scores: [0.99, 0.98, 0.97, 0.98],
              },
            },
          ],
          dataInfo: {
            numPages: 1,
            type: 'image',
          },
        },
        null,
        2,
      ),
    }
  }

  const extractedText = [
    '# ClawMaster PaddleOCR Preview',
    '',
    '- Order: A-1024',
    '- Total: 42.80 USD',
    '- Ship to: Shanghai',
  ].join('\n')
  return {
    moduleId,
    apiUrl,
    latencyMs: 612,
    pageCount: 1,
    textLineCount: 4,
    extractedText,
    responsePreview: JSON.stringify(
      {
        layoutParsingResults: [
          {
            markdown: {
              text: extractedText,
            },
          },
        ],
      },
      null,
      2,
    ),
  }
}

function demoPaddleOcrStatus(): PaddleOcrStatusPayload {
  const textState = demoPaddleOcrConfiguredState[PADDLEOCR_TEXT_SKILL_ID]
  const docState = demoPaddleOcrConfiguredState[PADDLEOCR_DOC_SKILL_ID]
  return {
    configured: textState.configured && docState.configured,
    enabledModules: [
      ...(textState.configured ? [PADDLEOCR_TEXT_SKILL_ID] : []),
      ...(docState.configured ? [PADDLEOCR_DOC_SKILL_ID] : []),
    ],
    missingModules: [],
    textRecognition: {
      configured: textState.configured,
      enabled: textState.configured,
      missing: false,
      apiUrlConfigured: Boolean(textState.apiUrl),
      accessTokenConfigured: textState.accessTokenConfigured,
      apiUrl: textState.apiUrl,
    },
    docParsing: {
      configured: docState.configured,
      enabled: docState.configured,
      missing: false,
      apiUrlConfigured: Boolean(docState.apiUrl),
      accessTokenConfigured: docState.accessTokenConfigured,
      apiUrl: docState.apiUrl,
    },
  }
}

const demoPaddleOcrAdapter: PaddleOcrAdapter = {
  async getStatus() {
    await delay(400)
    return demoPaddleOcrStatus()
  },

  async setup(input) {
    await delay(900)
    const existingState = demoPaddleOcrConfiguredState[input.moduleId]
    if (!input.accessToken.trim() && !existingState.accessTokenConfigured) {
      throw new Error('Access Token is required.')
    }
    demoPaddleOcrConfiguredState[input.moduleId] = {
      configured: true,
      accessTokenConfigured: existingState.accessTokenConfigured || Boolean(input.accessToken.trim()),
      apiUrl: input.apiUrl.trim(),
    }
    return demoPaddleOcrStatus()
  },

  async preview(input) {
    await delay(500)
    const existingState = demoPaddleOcrConfiguredState[input.moduleId]
    if (!input.accessToken.trim() && !existingState.accessTokenConfigured) {
      throw new Error('Access Token is required.')
    }
    return makeDemoPreviewPayload(input.moduleId, input.apiUrl.trim())
  },

  async clear(input) {
    await delay(500)
    demoPaddleOcrConfiguredState[input.moduleId] = {
      configured: false,
      accessTokenConfigured: false,
      apiUrl: undefined,
    }
    return demoPaddleOcrStatus()
  },
}

export function resetDemoSetupAdapterState(): void {
  demoPaddleOcrConfiguredState[PADDLEOCR_TEXT_SKILL_ID] = {
    configured: false,
    accessTokenConfigured: false,
    apiUrl: undefined,
  }
  demoPaddleOcrConfiguredState[PADDLEOCR_DOC_SKILL_ID] = {
    configured: false,
    accessTokenConfigured: false,
    apiUrl: undefined,
  }
}

export const demoSetupAdapter: SetupAdapter = {
  onboarding: demoOnboardingAdapter,
  paddleocr: demoPaddleOcrAdapter,

  async detectCapabilities(onUpdate) {
    const results: CapabilityStatus[] = []

    for (const cap of CAPABILITIES) {
      onUpdate({ id: cap.id, name: cap.name, status: 'checking' })
      await delay(400 + Math.random() * 300)

      const status =
        cap.action === 'configure'
          ? mapPaddleOcrCapabilityStatus(cap, demoPaddleOcrStatus())
          : (() => {
              const demo = DEMO_DETECT_RESULTS[cap.id as keyof typeof DEMO_DETECT_RESULTS]
              return {
                id: cap.id,
                name: cap.name,
                status: demo.installed ? 'installed' : 'not_installed',
                version: demo.installed ? demo.version : undefined,
              } satisfies CapabilityStatus
            })()
      onUpdate(status)
      results.push(status)
    }

    return results
  },

  async installCapabilities(ids, onProgress) {
    for (const id of ids) {
      const cap = CAPABILITIES.find((c) => c.id === id)
      if (!cap || cap.action !== 'install') continue

      onProgress({ id, status: 'installing', progress: 0 })

      // 模拟安装过程
      const steps = ['正在下载...', '正在安装...', '正在配置...']
      for (let i = 0; i < steps.length; i++) {
        await delay(600 + Math.random() * 400)
        onProgress({
          id,
          status: 'installing',
          progress: Math.round(((i + 1) / steps.length) * 100),
          log: `> ${steps[i]}`,
        })
      }

      await delay(300)
      onProgress({ id, status: 'done', progress: 100 })
    }
  },
}

// ─── 根据 URL 参数选择 ───

export function getSetupAdapter(): SetupAdapter {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === 'install') return demoSetupAdapter
  }
  return realSetupAdapter
}
