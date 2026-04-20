import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { platformResults } from '@/shared/adapters/platformResults'
import {
  Shell,
  Check,
  ExternalLink,
  Globe,
  Download,
  Loader2,
  Server,
  HardDrive,
  ArrowRight,
  CircleDashed,
  CheckCircle2,
  AlertCircle,
  Bot,
  Radar,
  ScanSearch,
  Copy,
  FolderInput,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import { InstallTask } from '@/shared/components/InstallTask'
import { BrandMark } from '@/shared/components/BrandMark'
import {
  getOllamaStatus,
  installOllama,
  startOllama,
  pullModel,
  type OllamaStatus,
  formatModelSize,
} from '@/shared/adapters/ollama'
import { changeLanguage } from '@/i18n'
import { buildGatewayUrl } from '@/shared/gatewayUrl'
import { isWindowsHostPlatform } from '@/shared/hostPlatform'
import { getSetupAdapter } from './adapters'
import { useCapabilityManager } from './useCapabilityManager'
import {
  CAPABILITIES,
  PROVIDERS,
  PRIMARY_PROVIDERS,
  PROVIDER_BADGES,
  providerSupportsSetup,
  getProviderCredentialLabel,
  getProviderLabel,
  CHANNEL_TYPES,
  DEFAULT_ONBOARDING_STATE,
} from './types'
import type { SystemInfo } from '@/lib/types'
import type { OpenclawProfileInput, OpenclawProfileSeedInput } from '@/shared/adapters/system'
import type { SetupAdapter } from './adapters'
import type {
  CapabilityStatus,
  InstallProgress,
  SetupPhase,
  CapabilityId,
  OnboardingState,
  ChannelTypeConfig,
} from './types'

interface SetupWizardProps {
  onComplete: () => void
}

const CAPABILITY_TONES: Record<CapabilityId, string> = {
  engine: 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900',
  memory: 'bg-emerald-600 text-white',
  observe: 'bg-amber-500 text-stone-950',
  ocr: 'bg-sky-600 text-white',
  agent: 'bg-rose-600 text-white',
}

const CAPABILITY_DESC_KEYS: Record<CapabilityId, string> = {
  engine: 'capability.engine.desc',
  memory: 'capability.memory.desc',
  observe: 'capability.observe.desc',
  ocr: 'capability.ocr.desc',
  agent: 'capability.agent.desc',
}

const CAPABILITY_ICONS: Record<CapabilityId, LucideIcon> = {
  engine: Shell,
  memory: HardDrive,
  observe: Radar,
  ocr: ScanSearch,
  agent: Bot,
}

const providerBadgeToneClass = 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'

function isGoldenSponsor(providerId: string) {
  return PROVIDER_BADGES[providerId as keyof typeof PROVIDER_BADGES] === 'golden-sponsor'
}

function sortProviderIds(providerIds: string[]) {
  return [...providerIds].sort((left, right) => {
    const leftScore = isGoldenSponsor(left) ? 0 : 1
    const rightScore = isGoldenSponsor(right) ? 0 : 1
    if (leftScore !== rightScore) return leftScore - rightScore
    return left.localeCompare(right)
  })
}

function ProviderBadge({ providerId }: { providerId: string }) {
  const { t } = useTranslation()
  if (PROVIDER_BADGES[providerId as keyof typeof PROVIDER_BADGES] !== 'golden-sponsor') {
    return null
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${providerBadgeToneClass}`}>
      <Sparkles className="h-3.5 w-3.5" />
      {t('providers.badgeGoldenSponsor')}
    </span>
  )
}

/**
 * 安装向导
 *
 * 统一入口：检测 → 安装/补全 → 完成 → 进入 Dashboard
 * 支持 ?demo=install 模拟全流程
 */
export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t, i18n } = useTranslation()
  const [phase, setPhase] = useState<SetupPhase>('detecting')
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [profileMode, setProfileMode] = useState<OpenclawProfileInput['kind']>('default')
  const [profileName, setProfileName] = useState('')
  const [profileSeedMode, setProfileSeedMode] = useState<OpenclawProfileSeedInput['mode']>('empty')
  const [profileSeedPath, setProfileSeedPath] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [onboard, setOnboard] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE)
  const updateOnboard = useCallback(
    (patch: Partial<OnboardingState>) => setOnboard((prev) => ({ ...prev, ...patch })),
    [],
  )

  const adapter = getSetupAdapter()
  const {
    capabilities,
    installProgress,
    error,
    detect: detectCapabilities,
    install: installCapabilitiesFn,
  } = useCapabilityManager(adapter)

  const loadSystemInfo = useCallback(async () => {
    const result = await platformResults.detectSystem()
    if (!result.success || !result.data) return
    setSystemInfo(result.data)
    setProfileMode(result.data.openclaw.profileMode ?? 'default')
    setProfileName(result.data.openclaw.profileName ?? '')
    setProfileSeedMode('empty')
    setProfileSeedPath('')
    setProfileError(null)
  }, [])

  // ─── 检测阶段 ───
  const startDetection = useCallback(async () => {
    setPhase('detecting')
    const requiredIds = new Set(CAPABILITIES.filter((c) => c.required).map((c) => c.id))
    let advanced = false

    try {
      const results = await detectCapabilities((_status, latest) => {
        if (advanced) return
        const requiredStatuses = Array.from(requiredIds)
          .map((id) => latest.get(id))
          .filter((item): item is CapabilityStatus => Boolean(item))
        const requiredSettled =
          requiredStatuses.length === requiredIds.size &&
          requiredStatuses.every((item) => item.status !== 'checking')

        if (!requiredSettled) return

        advanced = true
        const requiredAllInstalled = requiredStatuses.every((item) => item.status === 'installed')
        setPhase(requiredAllInstalled ? 'done' : 'ready')
      })

      const requiredAllInstalled = results
        .filter((r) => requiredIds.has(r.id))
        .every((r) => r.status === 'installed')
      if (!advanced) {
        setPhase(requiredAllInstalled ? 'done' : 'ready')
      }
    } catch {
      setPhase('error')
    }
  }, [detectCapabilities])

  // 首次挂载自动开始检测
  useEffect(() => {
    startDetection()
  }, [startDetection])

  useEffect(() => {
    void loadSystemInfo()
  }, [loadSystemInfo])

  // ─── 安装阶段 ───
  const startInstall = useCallback(async (requestedIds?: CapabilityId[]) => {
    // 只安装 required 的缺失能力
    const requiredIds = new Set(CAPABILITIES.filter((c) => c.required).map((c) => c.id))
    const missing =
      requestedIds && requestedIds.length > 0
        ? requestedIds
        : capabilities
            .filter((c) => c.status === 'not_installed' && requiredIds.has(c.id))
            .map((c) => c.id)

    if (missing.length === 0) {
      setPhase('done')
      return
    }

    setPhase('installing')

    try {
      await installCapabilitiesFn(missing)
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }, [installCapabilitiesFn, capabilities])

  // ─── 配置引导 ───

  const runInitConfig = useCallback(async () => {
    updateOnboard({ busy: true, error: null })
    try {
      await adapter.onboarding.initConfig()
      updateOnboard({ busy: false })
      setPhase('onboard_apikey')
    } catch (err) {
      updateOnboard({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [adapter, updateOnboard])

  const runSetApiKey = useCallback(async () => {
    // Ollama: auto-fill placeholder key
    const effectiveKey = onboard.provider === 'ollama' ? (onboard.apiKey.trim() || 'ollama') : onboard.apiKey.trim()
    if (!effectiveKey) return
    const providerCfg = PROVIDERS[onboard.provider]
    // 需要 baseUrl 但未填
    if (providerCfg?.needsBaseUrl && !onboard.customBaseUrl.trim()) {
      updateOnboard({ error: t('setup.enterBaseUrl') })
      return
    }
    updateOnboard({ busy: true, error: null })
    try {
      // 先验证 key 是否可用
      const valid = await adapter.onboarding.testApiKey(
        onboard.provider,
        effectiveKey,
        onboard.customBaseUrl.trim() || undefined,
      )
      if (!valid) {
        updateOnboard({ busy: false, error: onboard.provider === 'ollama' ? t('ollama.notRunning') : t('setup.apiKeyInvalid') })
        return
      }
      // 验证通过，保存配置
      await adapter.onboarding.setApiKey(
        onboard.provider,
        effectiveKey,
        onboard.customBaseUrl.trim() || undefined,
      )
      // 预选默认模型
      updateOnboard({ busy: false, model: providerCfg?.defaultModel ?? '', customModelId: '' })
      setPhase('onboard_model')
    } catch (err) {
      updateOnboard({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [adapter, onboard.provider, onboard.apiKey, onboard.customBaseUrl, updateOnboard])

  const runSetModel = useCallback(async () => {
    const modelId = onboard.model || onboard.customModelId.trim()
    if (!modelId) return
    // openclaw models set 需要 provider/model 格式
    const providerCfg = PROVIDERS[onboard.provider]
    const configKey = providerCfg?.configKeyOverride ?? onboard.provider
    const fullModelId = `${configKey}/${modelId}`
    updateOnboard({ busy: true, error: null })
    try {
      await adapter.onboarding.setDefaultModel(fullModelId)
      updateOnboard({ busy: false, model: modelId })
      setPhase('onboard_gateway')
    } catch (err) {
      updateOnboard({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [adapter, onboard.provider, onboard.model, onboard.customModelId, updateOnboard])

  const runStartGateway = useCallback(async () => {
    updateOnboard({ busy: true, error: null })
    try {
      await adapter.onboarding.startGateway(onboard.gatewayPort)
      // 轮询等待网关启动
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const ok = await adapter.onboarding.checkGateway(onboard.gatewayPort)
        if (ok) {
          updateOnboard({ busy: false, gatewayRunning: true })
          return
        }
      }
      updateOnboard({ busy: false, error: t('setup.gatewayTimeout') })
    } catch (err) {
      updateOnboard({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [adapter, onboard.gatewayPort, updateOnboard])

  const runAddChannel = useCallback(async () => {
    if (!onboard.channelType) return
    updateOnboard({ busy: true, error: null })
    try {
      await adapter.onboarding.addChannel(onboard.channelType, onboard.channelTokens)
      updateOnboard({ busy: false })
      setPhase('onboard_done')
    } catch (err) {
      updateOnboard({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [adapter, onboard.channelType, onboard.channelTokens, updateOnboard])

  // 自动触发：初始化配置 & 启动网关
  useEffect(() => {
    if (phase === 'onboard_init') runInitConfig()
  }, [phase, runInitConfig])

  useEffect(() => {
    if (phase === 'onboard_gateway') runStartGateway()
  }, [phase, runStartGateway])

  // ─── 渲染 ───

  const requiredIds = new Set(CAPABILITIES.filter((c) => c.required).map((c) => c.id))
  const capabilityCards = CAPABILITIES.map(
    (capability) =>
      capabilities.find((item) => item.id === capability.id) ?? {
        id: capability.id,
        name: capability.name,
        status: 'checking' as const,
      },
  )
  const requiredMissing = capabilityCards.filter(
    (c) => c.status === 'not_installed' && requiredIds.has(c.id),
  )
  const optionalMissing = capabilityCards.filter(
    (c) => c.status === 'not_installed' && !requiredIds.has(c.id),
  )
  const installedCount = capabilityCards.filter((c) => c.status === 'installed').length
  const pendingCount = capabilityCards.filter((c) => c.status === 'not_installed').length
  const workingCount =
    phase === 'installing'
      ? Object.values(installProgress).filter(
          (item) => item.status === 'installing' || item.status === 'waiting',
        ).length
      : capabilityCards.filter((c) => c.status === 'checking').length
  const isCapabilityPhase = ['detecting', 'ready', 'installing', 'done', 'error'].includes(phase)
  const showProfileFallback = Boolean(
    isCapabilityPhase &&
      systemInfo &&
      (!systemInfo.openclaw.installed ||
        systemInfo.openclaw.overrideActive ||
        (systemInfo.openclaw.existingConfigPaths?.length ?? 0) > 1),
  )
  const stageLabel =
    phase === 'detecting'
      ? t('setup.stageDetecting')
      : phase === 'installing'
        ? t('setup.stageInstalling')
        : phase === 'done'
          ? t('setup.stageConfigured')
          : phase === 'error'
            ? t('setup.failed')
            : t('setup.stageReady')
  const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'install'

  async function saveProfileFallback() {
    setProfileError(null)
    if (profileMode === 'named' && !profileName.trim()) {
      setProfileError(t('settings.profileNameRequired'))
      return
    }
    if (profileMode === 'named' && profileSeedMode === 'import-config' && !profileSeedPath.trim()) {
      setProfileError(t('settings.profileSeedPathRequired'))
      return
    }

    setProfileSaving(true)
    const result =
      profileMode === 'default'
        ? await platformResults.clearOpenclawProfile()
        : await platformResults.saveOpenclawProfile({
            kind: profileMode,
            name: profileMode === 'named' ? profileName.trim() : undefined,
          }, profileMode === 'named'
            ? {
                mode: profileSeedMode,
                sourcePath: profileSeedMode === 'import-config' ? profileSeedPath.trim() : undefined,
              }
            : undefined)
    setProfileSaving(false)

    if (!result.success) {
      setProfileError(result.error ?? t('setup.unknownError'))
      return
    }

    await Promise.all([loadSystemInfo(), startDetection()])
  }

  return (
    <div className="fullscreen-shell px-6">
      <div className="setup-language-switcher">
        <div className="setup-language-switcher-control">
          <Globe className="w-4 h-4" />
          <select
            value={i18n.language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="text-xs bg-transparent border border-border rounded px-1.5 py-1 cursor-pointer hover:text-foreground"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </div>

      {isCapabilityPhase ? (
        <div className="fullscreen-step setup-stage">
          <section className="setup-hero">
            <div className="setup-hero-grid">
              <div>
                <div className="setup-brand-lockup">
                  <BrandMark animated className="setup-brand-mark" imageClassName="setup-brand-mark-image" />
                  <div>
                    <p className="setup-hero-kicker">{stageLabel}</p>
                    <h1 className="setup-hero-title">{t('setup.appName')}</h1>
                  </div>
                </div>
                <p className="setup-hero-copy">{t('setup.capabilityReview')}</p>
                {isDemo && (
                  <div className="mt-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {t('setup.demoMode')}
                  </div>
                )}
              </div>

              <div className="setup-summary-card">
                <p className="setup-summary-label">{t('setup.capabilityOverview')}</p>
                <div className="setup-summary-grid">
                  <SummaryMetric label={t('setup.summaryInstalled')} value={String(installedCount)} />
                  <SummaryMetric label={t('setup.summaryPending')} value={String(pendingCount)} />
                  <SummaryMetric label={t('setup.summaryWorking')} value={String(workingCount)} />
                </div>
              </div>
            </div>
          </section>

          {phase === 'error' && (
            <div className="surface-card-danger text-sm text-destructive">
              {error ?? t('setup.unknownError')}
            </div>
          )}

          <CapabilityDeck
            capabilities={capabilityCards}
            progress={installProgress}
            phase={phase}
            onInstall={startInstall}
          />

          <div className="surface-card-muted">
            <div className="setup-action-row">
              {phase === 'detecting' && (
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleDashed className="h-4 w-4 animate-spin" />
                  <span>{t('setup.detecting')}</span>
                </div>
              )}

              {phase === 'ready' && requiredMissing.length > 0 && (
                <button onClick={() => void startInstall()} className="button-primary">
                  <Download className="h-4 w-4" />
                  {t('setup.installCore')}
                </button>
              )}

              {phase === 'ready' && requiredMissing.length === 0 && (
                <>
                  <button onClick={() => setPhase('onboard_init')} className="button-primary">
                    <ArrowRight className="h-4 w-4" />
                    {t('setup.startConfig')}
                  </button>
                  <button onClick={onComplete} className="button-secondary">
                    {t('setup.enterMaster')}
                  </button>
                </>
              )}

              {phase === 'installing' && (
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('setup.installing')}</span>
                </div>
              )}

              {phase === 'done' && (
                <>
                  <button onClick={() => setPhase('onboard_init')} className="button-primary">
                    <ArrowRight className="h-4 w-4" />
                    {t('setup.startConfig')}
                  </button>
                  <button onClick={onComplete} className="button-secondary">
                    {t('setup.skipConfig')}
                  </button>
                </>
              )}

              {phase === 'error' && (
                <button onClick={startDetection} className="button-secondary">
                  {t('common.retry')}
                </button>
              )}
            </div>

            {(optionalMissing.length > 0 || phase === 'ready' || phase === 'done') && (
              <p className="mt-3 text-sm text-muted-foreground">
                {requiredMissing.length > 0
                  ? t('setup.coreNotInstalled')
                  : optionalMissing.length > 0
                    ? t('setup.optionalLater')
                    : t('setup.coreReady')}
              </p>
            )}
          </div>

          {showProfileFallback && systemInfo && (
            <SetupProfileCard
              systemInfo={systemInfo}
              profileMode={profileMode}
              profileName={profileName}
              profileSaving={profileSaving}
              profileError={profileError}
              profileSeedMode={profileSeedMode}
              profileSeedPath={profileSeedPath}
              onModeChange={(value) => {
                setProfileMode(value)
                setProfileError(null)
              }}
              onNameChange={(value) => {
                setProfileName(value)
                setProfileError(null)
              }}
              onSeedModeChange={(value) => {
                setProfileSeedMode(value)
                if (value !== 'import-config') {
                  setProfileSeedPath('')
                }
                setProfileError(null)
              }}
              onSeedPathChange={(value) => {
                setProfileSeedPath(value)
                setProfileError(null)
              }}
              onSave={() => void saveProfileFallback()}
            />
          )}
        </div>
      ) : (
        <>
          <BrandMark animated className="setup-intro-brand" imageClassName="setup-brand-mark-image" />
          <h1 className="mb-1 text-2xl font-bold">{t('setup.appName')}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t('setup.appSlogan')}</p>
        </>
      )}

      {/* ─── 配置引导步骤 ─── */}

      {/* 步骤 1: 初始化配置文件 */}
      {phase === 'onboard_init' && (
        <div className="fullscreen-step">
          <OnboardingProgress current={0} />
          {onboard.busy && (
            <p className="text-center text-muted-foreground animate-pulse">{t('setup.initConfig')}</p>
          )}
          {onboard.error && (
            <div className="text-center">
              <p className="text-red-500 mb-4">{onboard.error}</p>
              <button onClick={runInitConfig} className="px-6 py-2 border border-border rounded-lg hover:bg-accent">
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 步骤 2: API Key */}
      {phase === 'onboard_apikey' && (
        <ProviderStep
          onboard={onboard}
          updateOnboard={updateOnboard}
          onSubmit={runSetApiKey}
          onSkip={onComplete}
        />
      )}

      {/* 步骤 3: 选择模型 */}
      {phase === 'onboard_model' && (() => {
        const models = PROVIDERS[onboard.provider]?.models ?? []
        const hasModels = models.length > 0
        return (
          <div className="fullscreen-step">
            <OnboardingProgress current={2} />
            <p className="text-center font-medium mb-4">{t('setup.selectModel')}</p>
            {hasModels && (
              <div className="bg-card border border-border rounded-lg divide-y divide-border">
                {models.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition"
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.id}
                      checked={onboard.model === m.id}
                      onChange={() => updateOnboard({ model: m.id, customModelId: '' })}
                      className="accent-primary"
                    />
                    <span className="text-sm">{m.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto font-mono">{m.id}</span>
                  </label>
                ))}
              </div>
            )}
            {!hasModels && (
              <p className="text-center text-sm text-muted-foreground mb-2">{t('setup.enterModelId')}</p>
            )}
            <input
              type="text"
              placeholder={t('setup.modelIdPlaceholder')}
              value={onboard.customModelId}
              onChange={(e) => updateOnboard({ customModelId: e.target.value, model: '' })}
              className="mt-3 w-full px-4 py-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {onboard.error && <p className="text-red-500 text-xs mt-2">{onboard.error}</p>}
            <button
              onClick={runSetModel}
              disabled={(!onboard.model && !onboard.customModelId.trim()) || onboard.busy}
              className="mt-4 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {onboard.busy ? t('setup.settingModel') : t('common.nextStep')}
            </button>
          </div>
        )
      })()}

      {/* 步骤 4: 启动网关 */}
      {phase === 'onboard_gateway' && (
        <div className="fullscreen-step">
          <OnboardingProgress current={3} />
          <p className="text-center font-medium mb-4">{t('setup.startGateway')}</p>
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            {onboard.busy && !onboard.gatewayRunning && (
              <p className="text-muted-foreground animate-pulse">{t('setup.startingGateway')}</p>
            )}
            {onboard.gatewayRunning && (
              <>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-green-600 font-medium">{t('setup.gatewayStarted')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('setup.gatewayPort', { port: onboard.gatewayPort })}
                </p>
              </>
            )}
            {onboard.error && (
              <>
                <p className="text-red-500 mb-3">{onboard.error}</p>
                <button
                  onClick={runStartGateway}
                  className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
                >
                  {t('common.retry')}
                </button>
              </>
            )}
          </div>
          {onboard.gatewayRunning && (
            <button
              onClick={() => setPhase('onboard_channel')}
              className="mt-4 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
            >
              {t('common.nextStep')}
            </button>
          )}
        </div>
      )}

      {/* 步骤 5: 添加通道（可选） */}
      {phase === 'onboard_channel' && (() => {
        const selectedChannel = CHANNEL_TYPES.find((c) => c.id === onboard.channelType)
        const allTokensFilled = selectedChannel
          ? selectedChannel.tokenFields.every((f) => onboard.channelTokens[f.key]?.trim())
          : false
        return (
          <div className="fullscreen-step">
            <OnboardingProgress current={4} />
            <p className="text-center font-medium mb-1">{t('setup.addChannel')}</p>
            <p className="text-center text-xs text-muted-foreground mb-4">{t('setup.channelOptional')}</p>
            <div className="flex gap-2 mb-4 justify-center flex-wrap">
              {CHANNEL_TYPES.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => updateOnboard({ channelType: ch.id, channelTokens: {} })}
                  className={`px-4 py-2 rounded-lg text-sm border transition ${
                    onboard.channelType === ch.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {t(ch.name)}
                </button>
              ))}
            </div>
            {selectedChannel && (
              <div className="bg-card border border-border rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">{t('setup.setupSteps')}</p>
                  <a
                    href={selectedChannel.guideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {t('setup.openGuide', { label: t(selectedChannel.guideLabel) })}
                  </a>
                </div>
                <ol className="text-xs space-y-2">
                  {selectedChannel.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0 w-4 text-right">{i + 1}.</span>
                      <span className="text-muted-foreground">
                        {t(step.text)}
                        {step.highlight && (
                          <>
                            {'：'}
                            <span className="text-foreground font-medium">{t(step.highlight)}</span>
                          </>
                        )}
                        {step.yieldsToken && <span className="text-primary ml-1" title={t('setup.yieldsToken')}>*</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {/* Feishu permissions template */}
            {selectedChannel?.permissionsTemplate && (
              <div className="bg-muted/50 border border-border rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium">{t('channel.feishu.permissionsTitle')}</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedChannel.permissionsTemplate!)
                      updateOnboard({ error: null })
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('common.copyToClipboard')}
                  </button>
                </div>
                <pre className="text-[10px] text-muted-foreground max-h-24 overflow-auto font-mono">{selectedChannel.permissionsTemplate}</pre>
              </div>
            )}
            {/* QR login channels */}
            {selectedChannel?.qrLogin && (
              <QrLoginPanel
                channel={selectedChannel}
                onConnected={() => setPhase('onboard_done')}
                adapter={adapter}
              />
            )}
            {/* Token-based channels */}
            {selectedChannel && !selectedChannel.qrLogin && selectedChannel.tokenFields.map((field) => (
              <div key={field.key} className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">{field.label}</label>
                  <span className="text-[10px] text-muted-foreground">{t(field.hint)}</span>
                </div>
                <input
                  type="password"
                  placeholder={field.placeholder}
                  value={onboard.channelTokens[field.key] ?? ''}
                  onChange={(e) =>
                    updateOnboard({
                      channelTokens: { ...onboard.channelTokens, [field.key]: e.target.value },
                    })
                  }
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
            {onboard.error && <p className="text-red-500 text-xs mt-2">{onboard.error}</p>}
            {selectedChannel && (
              <button
                onClick={runAddChannel}
                disabled={!allTokensFilled || onboard.busy}
                className="mt-2 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {onboard.busy ? t('setup.addingChannel') : t('setup.addAndFinish')}
              </button>
            )}
            <button
              onClick={() => {
                updateOnboard({ channelType: '', channelTokens: {} })
                setPhase('onboard_done')
              }}
              className="mt-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              {selectedChannel ? t('setup.skipChannel') : t('setup.skipAddLater')}
            </button>
          </div>
        )
      })()}

      {/* 配置完成 */}
      {phase === 'onboard_done' && (
        <div className="fullscreen-step">
          <OnboardingProgress current={5} />
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-center text-green-600 font-medium text-lg mb-4">{t('setup.configDone')}</p>
          <div className="bg-card border border-border rounded-lg divide-y divide-border text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">{t('setup.provider')}</span>
              <span>{getProviderLabel(onboard.provider, i18n.language)}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">{t('setup.defaultModel')}</span>
              <span className="font-mono">{onboard.model || t('common.notSet')}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">{t('setup.gateway')}</span>
              <span className={onboard.gatewayRunning ? 'text-green-600' : 'text-orange-500'}>
                {onboard.gatewayRunning ? t('setup.gatewayRunning', { port: onboard.gatewayPort }) : t('setup.gatewayNotStarted')}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">{t('setup.channel')}</span>
              <span>
                {onboard.channelType
                  ? CHANNEL_TYPES.find((c) => c.id === onboard.channelType)?.name
                  : t('common.notConfigured')}
              </span>
            </div>
          </div>
          {onboard.gatewayRunning && (
            <a
              href={buildGatewayUrl({ gateway: { port: onboard.gatewayPort } })}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 w-full py-3 border border-primary text-primary rounded-lg font-medium hover:bg-primary/5 transition block text-center"
            >
              <ExternalLink className="w-4 h-4 inline mr-1" />{t('setup.openConsoleVerify')}
            </a>
          )}
          <button
            onClick={onComplete}
            className="mt-2 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            {t('setup.enterMaster')}
          </button>
        </div>
      )}

      {/* 错误 */}
      {phase === 'error' && (
        <div className="fullscreen-step text-center">
          <p className="text-red-500 mb-4">{error ?? t('setup.unknownError')}</p>
          <button
            onClick={startDetection}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── QR 登录面板 ───

function QrLoginPanel({
  channel,
  onConnected,
  adapter,
}: {
  channel: ChannelTypeConfig
  onConnected: () => void
  adapter: SetupAdapter
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'installing' | 'scanning' | 'connected' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function startLogin() {
    setError(null)
    // Install plugin if needed
    if (channel.installPlugin) {
      setStatus('installing')
      try {
        await adapter.onboarding.installPlugin(channel.installPlugin)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
        return
      }
    }
    // Start QR login
    setStatus('scanning')
    try {
      const result = await adapter.onboarding.loginChannel(channel.id)
      if (result === 'connected') {
        setStatus('connected')
        setTimeout(onConnected, 1000)
      } else {
        setError(t('channel.qr.timeout'))
        setStatus('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 text-center">
      {status === 'idle' && (
        <>
          <p className="text-sm text-muted-foreground mb-3">{t('channel.qr.desc')}</p>
          <button
            onClick={startLogin}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            {t('channel.qr.start')}
          </button>
        </>
      )}
      {status === 'installing' && (
        <p className="text-muted-foreground animate-pulse">{t('channel.qr.installing', { name: t(channel.name) })}</p>
      )}
      {status === 'scanning' && (
        <>
          <div className="mx-auto mb-3 flex aspect-square w-[min(70vw,16rem)] items-center justify-center rounded-lg border-2 border-dashed border-border">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{t('channel.qr.waiting')}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t('channel.qr.scanHint')}</p>
        </>
      )}
      {status === 'connected' && (
        <div>
          <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-green-600 font-medium">{t('channel.qr.connected')}</p>
        </div>
      )}
      {status === 'error' && (
        <>
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button onClick={startLogin} className="px-4 py-2 border border-border rounded-lg hover:bg-accent">
            {t('common.retry')}
          </button>
        </>
      )}
    </div>
  )
}

// ─── 子组件 ───

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="setup-summary-label">{label}</p>
      <p className="setup-summary-value">{value}</p>
    </div>
  )
}

function SetupProfileCard({
  systemInfo,
  profileMode,
  profileName,
  profileSaving,
  profileError,
  profileSeedMode,
  profileSeedPath,
  onModeChange,
  onNameChange,
  onSeedModeChange,
  onSeedPathChange,
  onSave,
}: {
  systemInfo: SystemInfo
  profileMode: OpenclawProfileInput['kind']
  profileName: string
  profileSaving: boolean
  profileError: string | null
  profileSeedMode: OpenclawProfileSeedInput['mode']
  profileSeedPath: string
  onModeChange: (value: OpenclawProfileInput['kind']) => void
  onNameChange: (value: string) => void
  onSeedModeChange: (value: OpenclawProfileSeedInput['mode']) => void
  onSeedPathChange: (value: string) => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  return (
    <section className="surface-card">
      <div className="section-heading">
        <div>
          <h3 className="section-title">{t('settings.profileTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('setup.profileFallbackDesc')}</p>
        </div>
      </div>

      {isWindowsHostPlatform(systemInfo.runtime?.hostPlatform)
        && systemInfo.runtime?.wslAvailable
        && !systemInfo.openclaw.installed && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {t('setup.runtimeWslHint')}
          </div>
        )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(14rem,0.8fr)]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { id: 'default' as const, label: t('settings.profileDefault') },
              { id: 'dev' as const, label: t('settings.profileDev') },
              { id: 'named' as const, label: t('settings.profileNamed') },
            ]).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onModeChange(option.id)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  profileMode === option.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {profileMode === 'named' && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground">{t('settings.profileName')}</label>
                <input
                  value={profileName}
                  onChange={(event) => onNameChange(event.target.value)}
                  placeholder={t('settings.profileNamePlaceholder')}
                  className="control-input"
                />
              </div>

              <div className="rounded-[1.5rem] border border-border/80 bg-muted/35 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t('settings.profileSeedTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.profileSeedDesc')}</p>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {([
                    { id: 'empty' as const, icon: Sparkles, label: t('settings.profileSeedEmpty'), desc: t('settings.profileSeedEmptyDesc') },
                    { id: 'clone-current' as const, icon: Copy, label: t('settings.profileSeedClone'), desc: t('settings.profileSeedCloneDesc') },
                    { id: 'import-config' as const, icon: FolderInput, label: t('settings.profileSeedImport'), desc: t('settings.profileSeedImportDesc') },
                  ]).map((option) => {
                    const Icon = option.icon
                    const active = profileSeedMode === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onSeedModeChange(option.id)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          active
                            ? 'border-primary bg-background shadow-sm'
                            : 'border-border bg-background/70 hover:bg-background'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{option.desc}</p>
                      </button>
                    )
                  })}
                </div>

                {profileSeedMode === 'clone-current' && (
                  <div className="mt-4 rounded-2xl bg-background/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {t('settings.profileSeedCloneSource')}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-foreground/80">
                      {systemInfo.openclaw.configPath}
                    </p>
                  </div>
                )}

                {profileSeedMode === 'import-config' && (
                  <div className="mt-4 grid gap-2">
                    <label className="text-sm text-muted-foreground">{t('settings.profileSeedPath')}</label>
                    <input
                      value={profileSeedPath}
                      onChange={(event) => onSeedPathChange(event.target.value)}
                      placeholder={t('settings.profileSeedPathPlaceholder')}
                      className="control-input"
                    />
                    <p className="text-xs text-muted-foreground">{t('settings.profileSeedPathHint')}</p>
                  </div>
                )}

                <p className="mt-4 text-xs text-muted-foreground">{t('settings.profileSeedCopiesConfigOnly')}</p>
              </div>
            </div>
          )}

          {profileError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {profileError}
            </div>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={profileSaving}
            className="button-primary"
          >
            {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {profileSaving ? t('common.saving') : t('settings.profileApply')}
          </button>
        </div>

        <div className="rounded-[1.5rem] border border-border/80 bg-muted/40 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {t('settings.profileResolved')}
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{t('settings.profileCurrent')}</span>
              <span className="text-right font-medium">
                {systemInfo.openclaw.profileMode === 'named'
                  ? `${t('settings.profileNamed')} · ${systemInfo.openclaw.profileName ?? ''}`
                  : systemInfo.openclaw.profileMode === 'dev'
                    ? t('settings.profileDev')
                    : t('settings.profileDefault')}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{t('settings.profileDataDir')}</span>
              <span className="max-w-[16rem] break-all text-right font-mono text-xs">
                {systemInfo.openclaw.dataDir ?? t('common.notSet')}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{t('settings.configPath')}</span>
              <span className="max-w-[16rem] break-all text-right font-mono text-xs">
                {systemInfo.openclaw.configPath}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CapabilityBadge({
  status,
  version,
  progress,
}: {
  status: CapabilityStatus['status']
  version?: string
  progress?: InstallProgress
}) {
  const { t } = useTranslation()
  if (progress?.status === 'installing' || progress?.status === 'waiting') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CircleDashed className="h-3.5 w-3.5 animate-spin" />
        {progress.status === 'installing' ? `${progress.progress ?? 0}%` : t('setup.waiting')}
      </span>
    )
  }

  if (progress?.status === 'error' || status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500">
        <AlertCircle className="h-3.5 w-3.5" />
        {t('setup.checkFailed')}
      </span>
    )
  }

  switch (status) {
    case 'checking':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CircleDashed className="h-3.5 w-3.5 animate-spin" />
          {t('setup.checking')}
        </span>
      )
    case 'installed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {version ? `v${version}` : t('common.installed')}
        </span>
      )
    case 'not_installed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-orange-500">
          <AlertCircle className="h-3.5 w-3.5" />
          {t('common.notInstalled')}
        </span>
      )
  }
}

function CapabilityDeck({
  capabilities,
  progress,
  phase,
  onInstall,
}: {
  capabilities: CapabilityStatus[]
  progress: Record<CapabilityId, InstallProgress>
  phase: SetupPhase
  onInstall: (ids?: CapabilityId[]) => Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <div className="setup-capability-grid">
      {capabilities.map((capability) => {
        const Icon = CAPABILITY_ICONS[capability.id]
        const installState = progress[capability.id]
        const isRequired = CAPABILITIES.find((item) => item.id === capability.id)?.required ?? false
        const installLocked =
          phase === 'installing' &&
          !installState &&
          Object.values(progress).some(
            (item) => item.status === 'installing' || item.status === 'waiting',
          )

        return (
          <div key={capability.id} className="setup-capability-card">
            <div className="setup-capability-head">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${CAPABILITY_TONES[capability.id]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="setup-capability-title">{t(capability.name)}</p>
                    <CapabilityBadge
                      status={capability.status}
                      version={capability.version}
                      progress={installState}
                    />
                  </div>
                </div>
                <p className="setup-capability-desc">{t(CAPABILITY_DESC_KEYS[capability.id])}</p>
              </div>
            </div>

            <div className="setup-capability-tags">
              <span className="setup-capability-tag">
                {isRequired ? t('setup.requiredCapability') : t('setup.optionalCapability')}
              </span>
              {capability.version && <span className="setup-capability-tag">v{capability.version}</span>}
              {installState?.log && <span className="setup-capability-tag">{installState.log}</span>}
            </div>

            <div className="setup-capability-action">
              {capability.status === 'installed' || installState?.status === 'done' ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('setup.stageReady')}
                </span>
              ) : installState?.status === 'installing' || installState?.status === 'waiting' ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {installState.status === 'installing'
                    ? t('capability.installing')
                    : t('setup.waiting')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void onInstall([capability.id])}
                  disabled={capability.status === 'checking' || installLocked}
                  className="button-secondary"
                >
                  {t('setup.installCapability', { name: t(capability.name) })}
                </button>
              )}
            </div>

            {installState?.progress !== undefined &&
              (installState.status === 'installing' || installState.status === 'done') && (
                <div className="setup-capability-progress">
                  <div
                    className="setup-capability-progress-bar"
                    style={{ width: `${installState.progress ?? 0}%` }}
                  />
                </div>
              )}

            {installState?.error && (
              <p className="mt-3 text-xs text-red-500">{installState.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── 提供商选择步骤 ───

const allProviderIds = Object.keys(PROVIDERS).filter(providerSupportsSetup)
const primaryIds = PRIMARY_PROVIDERS as readonly string[]
const secondaryIds = allProviderIds.filter((id) => !primaryIds.includes(id))

function ProviderStep({
  onboard,
  updateOnboard,
  onSubmit,
  onSkip,
}: {
  onboard: OnboardingState
  updateOnboard: (patch: Partial<OnboardingState>) => void
  onSubmit: () => void
  onSkip: () => void
}) {
  const { t, i18n } = useTranslation()
  const [showMore, setShowMore] = useState(false)
  const visibleIds = sortProviderIds(showMore ? allProviderIds : [...primaryIds])
  const sponsorIds = visibleIds.filter((providerId) => isGoldenSponsor(providerId))
  const otherIds = visibleIds.filter((providerId) => !isGoldenSponsor(providerId))
  const providerCfg = PROVIDERS[onboard.provider]
  const credentialLabel = getProviderCredentialLabel(onboard.provider, i18n.language)
  const providerLabel = getProviderLabel(onboard.provider, i18n.language)

  return (
    <div className="fullscreen-step">
      <OnboardingProgress current={1} />
      <p className="text-center font-medium mb-4">{t('setup.configureLLM')}</p>
      {sponsorIds.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('providers.badgeGoldenSponsor')}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {sponsorIds.map((p) => (
              <ProviderStepButton
                key={p}
                providerId={p}
                selected={onboard.provider === p}
                onSelect={() => updateOnboard({
                  provider: p,
                  apiKey: '',
                  model: '',
                  customBaseUrl: PROVIDERS[p]?.baseUrl ?? '',
                })}
              />
            ))}
          </div>
        </div>
      )}
      {otherIds.length > 0 && (
        <div className="mb-2 space-y-2">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('models.recommendedProviders')}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {otherIds.map((p) => (
              <ProviderStepButton
                key={p}
                providerId={p}
                selected={onboard.provider === p}
                onSelect={() => updateOnboard({
                  provider: p,
                  apiKey: '',
                  model: '',
                  customBaseUrl: PROVIDERS[p]?.baseUrl ?? '',
                })}
              />
            ))}
          </div>
        </div>
      )}
      {secondaryIds.length > 0 && (
        <button
          onClick={() => setShowMore(!showMore)}
          className="mb-4 w-full text-xs text-muted-foreground hover:text-foreground transition"
        >
          {showMore ? t('setup.collapse') : t('setup.moreProviders', { count: secondaryIds.length })}
        </button>
      )}
      {onboard.provider === 'ollama' ? (
        <OllamaSetupPanel
          onboard={onboard}
          updateOnboard={updateOnboard}
          onSubmit={onSubmit}
        />
      ) : (
        <>
          {providerCfg?.keyUrl && (
            <a
              href={providerCfg.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-3 text-center text-xs text-primary hover:underline"
            >
              {t('setup.getApiKey', { provider: providerLabel, credential: credentialLabel })}
            </a>
          )}
          {providerCfg?.noteKey && (
            <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {t(providerCfg.noteKey)}
            </p>
          )}
          {providerCfg?.needsBaseUrl && (
            <input
              type="url"
              placeholder={t('setup.baseUrlPlaceholder')}
              value={onboard.customBaseUrl}
              onChange={(e) => updateOnboard({ customBaseUrl: e.target.value })}
              className="w-full px-4 py-3 mb-2 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
          <input
            type="password"
            placeholder={t('setup.apiKeyPlaceholder', {
              provider: providerLabel,
              credential: credentialLabel,
            })}
            value={onboard.apiKey}
            onChange={(e) => updateOnboard({ apiKey: e.target.value })}
            className="w-full px-4 py-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {onboard.error && <p className="text-red-500 text-xs mt-2">{onboard.error}</p>}
          <button
            onClick={onSubmit}
            disabled={!onboard.apiKey.trim() || onboard.busy}
            className="mt-4 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {onboard.busy ? t('setup.verifying') : t('common.nextStep')}
          </button>
        </>
      )}
      <button
        onClick={onSkip}
        className="mt-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition"
      >
        {t('setup.skipRemaining')}
      </button>
    </div>
  )
}

function ProviderStepButton({
  providerId,
  selected,
  onSelect,
}: {
  providerId: string
  selected: boolean
  onSelect: () => void
}) {
  const { i18n } = useTranslation()
  return (
    <button
      onClick={onSelect}
      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border hover:bg-accent'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <span>{getProviderLabel(providerId, i18n.language)}</span>
        <ProviderBadge providerId={providerId} />
      </span>
    </button>
  )
}

// ─── Ollama 安装面板 ───

function OllamaSetupPanel({
  onboard,
  updateOnboard,
  onSubmit,
}: {
  onboard: OnboardingState
  updateOnboard: (patch: Partial<OnboardingState>) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const installTask = useInstallTask()
  const startTask = useInstallTask()
  const pullTask = useInstallTask()

  const checkStatus = useCallback(async () => {
    setChecking(true)
    const result = await getOllamaStatus(
      onboard.customBaseUrl.trim().replace(/\/v1\/?$/, '') || 'http://localhost:11434',
    )
    if (result.success && result.data) {
      setStatus(result.data)
      // Auto-fill models from running Ollama
      if (result.data.running && result.data.models.length > 0) {
        updateOnboard({ apiKey: 'ollama' })
      }
    }
    setChecking(false)
  }, [onboard.customBaseUrl, updateOnboard])

  useEffect(() => { checkStatus() }, [checkStatus])

  async function handleInstall() {
    await installTask.run(async () => {
      updateOnboard({ error: null })
      const result = await installOllama()
      if (!result.success) throw new Error(result.error ?? t('ollama.installFailed'))
    })
    await checkStatus()
  }

  async function handleStart() {
    await startTask.run(async () => {
      updateOnboard({ error: null })
      await startOllama()
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const result = await getOllamaStatus(
          onboard.customBaseUrl.trim().replace(/\/v1\/?$/, '') || 'http://localhost:11434',
        )
        if (result.success && result.data?.running) {
          setStatus(result.data)
          updateOnboard({ apiKey: 'ollama' })
          return
        }
      }
      throw new Error(t('ollama.startFailed'))
    })
    await checkStatus()
  }

  async function handlePullModel(modelId: string) {
    await pullTask.run(async () => {
      const result = await pullModel(modelId)
      if (!result.success) {
        throw new Error(result.error ?? t('ollama.installFailed'))
      }
    })
    await checkStatus()
  }

  function handleProceed() {
    updateOnboard({ apiKey: 'ollama' })
    onSubmit()
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('ollama.detecting')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Base URL */}
      <input
        type="url"
        placeholder="http://localhost:11434/v1"
        value={onboard.customBaseUrl}
        onChange={(e) => updateOnboard({ customBaseUrl: e.target.value })}
        className="w-full px-4 py-3 rounded-lg border border-border bg-card text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {/* Step 1: Install */}
      {!status?.installed && (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{t('ollama.installTitle')}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{t('ollama.installDesc')}</p>
            {installTask.status === 'idle' && (
              <button
                onClick={handleInstall}
                className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
              >
                {t('ollama.installButton')}
              </button>
            )}
          </div>
          {installTask.status !== 'idle' && (
            <InstallTask label="Ollama" status={installTask.status} error={installTask.error} onRetry={installTask.reset} />
          )}
        </div>
      )}

      {/* Step 2: Start service */}
      {status?.installed && !status?.running && (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{t('ollama.startTitle')}</span>
              <span className="text-xs text-muted-foreground">v{status.version}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{t('ollama.notRunning')}</p>
            {startTask.status === 'idle' && (
              <button
                onClick={handleStart}
                className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90"
              >
                {t('ollama.startButton')}
              </button>
            )}
          </div>
          {startTask.status !== 'idle' && (
            <InstallTask label="Ollama" description={t('ollama.starting')} status={startTask.status} error={startTask.error} onRetry={startTask.reset} />
          )}
        </div>
      )}

      {/* Step 3: Running — show models */}
      {status?.installed && status?.running && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium">{t('ollama.running')}</span>
            <span className="text-xs text-muted-foreground">v{status.version}</span>
          </div>

          {/* Available models */}
          {status.models.length > 0 ? (
            <div className="space-y-2 mb-3">
              <p className="text-xs text-muted-foreground">{t('ollama.availableModels')}</p>
              {status.models.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-sm px-2 py-1.5 bg-muted/50 rounded">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono">{m.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatModelSize(m.size)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-3">{t('ollama.noModels')}</p>
          )}

          {/* Pull popular models */}
          {pullTask.status !== 'idle' && (
            <InstallTask label={pullTask.log ?? ''} status={pullTask.status} error={pullTask.error} onRetry={pullTask.reset} />
          )}
          {pullTask.status === 'idle' && (
            <div className="flex flex-wrap gap-2 mb-3">
              {['llama3.2', 'qwen2.5', 'deepseek-r1', 'gemma3', 'phi4'].map((m) => {
                const alreadyPulled = status.models.some((sm) => sm.name.startsWith(m))
                if (alreadyPulled) return null
                return (
                  <button
                    key={m}
                    onClick={() => { void handlePullModel(m) }}
                    className="px-3 py-1 text-xs border border-border rounded-lg hover:bg-accent flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    {m}
                  </button>
                )
              })}
            </div>
          )}

          <a
            href="https://ollama.com/library"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {t('ollama.browseLibrary')}
          </a>
        </div>
      )}

      {onboard.error && <p className="text-red-500 text-xs">{onboard.error}</p>}

      {/* Proceed button — only when Ollama is running */}
      {status?.installed && status?.running && (
        <button
          onClick={handleProceed}
          disabled={onboard.busy || status.models.length === 0}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {onboard.busy ? t('setup.verifying') : t('common.nextStep')}
        </button>
      )}
    </div>
  )
}

// ─── 步骤指示器 ───

function OnboardingProgress({ current }: { current: number }) {
  const { t } = useTranslation()
  const ONBOARDING_STEPS = [t('setup.step.init'), t('setup.step.apiKey'), t('setup.step.model'), t('setup.step.gateway'), t('setup.step.channel')]
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {ONBOARDING_STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition ${
                i < current
                  ? 'bg-green-100 text-green-600'
                  : i === current
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < current ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className="text-[10px] text-muted-foreground mt-1">{label}</span>
          </div>
          {i < ONBOARDING_STEPS.length - 1 && (
            <div className={`w-6 h-px mb-4 ${i < current ? 'bg-green-300' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  )
}
