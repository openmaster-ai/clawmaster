import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Shell, Check, ExternalLink, Globe } from 'lucide-react'
import { changeLanguage } from '@/i18n'
import { getSetupAdapter } from './adapters'
import {
  CAPABILITIES,
  PROVIDERS,
  PRIMARY_PROVIDERS,
  CHANNEL_TYPES,
  DEFAULT_ONBOARDING_STATE,
} from './types'
import type {
  CapabilityStatus,
  InstallProgress,
  SetupPhase,
  CapabilityId,
  OnboardingState,
} from './types'

interface SetupWizardProps {
  onComplete: () => void
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
  const [capabilities, setCapabilities] = useState<CapabilityStatus[]>([])
  const [installProgress, setInstallProgress] = useState<Record<CapabilityId, InstallProgress>>({} as any)
  const [error, setError] = useState<string | null>(null)

  const [onboard, setOnboard] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE)
  const updateOnboard = useCallback(
    (patch: Partial<OnboardingState>) => setOnboard((prev) => ({ ...prev, ...patch })),
    [],
  )

  const adapter = getSetupAdapter()

  // ─── 检测阶段 ───
  const startDetection = useCallback(async () => {
    setPhase('detecting')
    setError(null)

    try {
      const results = await adapter.detectCapabilities((status) => {
        setCapabilities((prev) => {
          const idx = prev.findIndex((c) => c.id === status.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = status
            return next
          }
          return [...prev, status]
        })
      })

      // 只看 required 能力是否全部就绪
      const requiredIds = new Set(CAPABILITIES.filter((c) => c.required).map((c) => c.id))
      const requiredAllInstalled = results
        .filter((r) => requiredIds.has(r.id))
        .every((r) => r.status === 'installed')
      setPhase(requiredAllInstalled ? 'done' : 'ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [adapter])

  // 首次挂载自动开始检测
  useState(() => {
    startDetection()
  })

  // ─── 安装阶段 ───
  const startInstall = useCallback(async () => {
    // 只安装 required 的缺失能力
    const requiredIds = new Set(CAPABILITIES.filter((c) => c.required).map((c) => c.id))
    const missing = capabilities
      .filter((c) => c.status === 'not_installed' && requiredIds.has(c.id))
      .map((c) => c.id)

    if (missing.length === 0) {
      setPhase('done')
      return
    }

    setPhase('installing')

    // 初始化进度状态
    const initialProgress: Record<string, InstallProgress> = {}
    for (const id of missing) {
      initialProgress[id] = { id, status: 'waiting' }
    }
    setInstallProgress(initialProgress as Record<CapabilityId, InstallProgress>)

    try {
      await adapter.installCapabilities(missing, (progress) => {
        setInstallProgress((prev) => ({ ...prev, [progress.id]: progress }))
        // 安装完成后更新 capabilities 状态
        if (progress.status === 'done') {
          setCapabilities((prev) =>
            prev.map((c) => (c.id === progress.id ? { ...c, status: 'installed' } : c)),
          )
        }
      })
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [adapter, capabilities])

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
    if (!onboard.apiKey.trim()) return
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
        onboard.apiKey,
        onboard.customBaseUrl.trim() || undefined,
      )
      if (!valid) {
        updateOnboard({ busy: false, error: t('setup.apiKeyInvalid') })
        return
      }
      // 验证通过，保存配置
      await adapter.onboarding.setApiKey(
        onboard.provider,
        onboard.apiKey,
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
  const requiredMissing = capabilities.filter((c) => c.status === 'not_installed' && requiredIds.has(c.id))
  const optionalMissing = capabilities.filter((c) => c.status === 'not_installed' && !requiredIds.has(c.id))
  const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'install'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 flex items-center gap-1 text-muted-foreground">
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

      {/* Logo */}
      <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-lg">
        <Shell className="w-9 h-9 text-primary-foreground" />
      </div>
      <h1 className="text-2xl font-bold mb-1">{t('setup.appName')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t('setup.appSlogan')}</p>

      {isDemo && (
        <div className="mb-4 px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
          {t('setup.demoMode')}
        </div>
      )}

      {/* 检测中 */}
      {phase === 'detecting' && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">{t('setup.detecting')}</p>
          <CapabilityList capabilities={capabilities} />
        </div>
      )}

      {/* 检测完成，required 有缺失 → 必须安装 */}
      {phase === 'ready' && requiredMissing.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">
            {t('setup.coreNotInstalled')}
          </p>
          <CapabilityList capabilities={capabilities} />
          <button
            onClick={startInstall}
            className="mt-6 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            {t('setup.installCore')}
          </button>
        </div>
      )}

      {/* 检测完成，required 全部就绪但有 optional 缺失 → 可跳过 */}
      {phase === 'ready' && requiredMissing.length === 0 && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">
            {optionalMissing.length > 0 ? t('setup.coreReadyOptional', { count: optionalMissing.length }) : t('setup.coreReady')}
          </p>
          <CapabilityList capabilities={capabilities} />
          <button
            onClick={onComplete}
            className="mt-6 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            {t('setup.enterMaster')}
          </button>
          {optionalMissing.length > 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t('setup.optionalLater')}
            </p>
          )}
        </div>
      )}

      {/* 安装中 */}
      {phase === 'installing' && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">{t('setup.installing')}</p>
          <InstallList
            capabilities={capabilities}
            progress={installProgress}
          />
        </div>
      )}

      {/* 全部就绪（或 required 就绪）→ 引导配置 */}
      {phase === 'done' && (
        <div className="w-full max-w-md">
          <p className="text-center text-green-600 font-medium mb-4">
            {optionalMissing.length > 0
              ? t('setup.coreReadyOptional', { count: optionalMissing.length })
              : t('setup.allReady')}
          </p>
          <CapabilityList capabilities={capabilities} />
          <button
            onClick={() => setPhase('onboard_init')}
            className="mt-6 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            {t('setup.startConfig')}
          </button>
          <button
            onClick={onComplete}
            className="mt-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            {t('setup.skipConfig')}
          </button>
        </div>
      )}

      {/* ─── 配置引导步骤 ─── */}

      {/* 步骤 1: 初始化配置文件 */}
      {phase === 'onboard_init' && (
        <div className="w-full max-w-md">
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
          <div className="w-full max-w-md">
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
        <div className="w-full max-w-md">
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
          <div className="w-full max-w-md">
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
                  {ch.name}
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
                        {step.yieldsToken && <span className="text-primary ml-1" title="此步骤产出 Token">*</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {selectedChannel?.tokenFields.map((field) => (
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
        <div className="w-full max-w-md">
          <OnboardingProgress current={5} />
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-center text-green-600 font-medium text-lg mb-4">{t('setup.configDone')}</p>
          <div className="bg-card border border-border rounded-lg divide-y divide-border text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">{t('setup.provider')}</span>
              <span>{PROVIDERS[onboard.provider]?.label ?? onboard.provider}</span>
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
              href={`http://127.0.0.1:${onboard.gatewayPort}`}
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
        <div className="w-full max-w-md text-center">
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

// ─── 子组件 ───

function CapabilityList({ capabilities }: { capabilities: CapabilityStatus[] }) {
  const { t } = useTranslation()
  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {capabilities.map((cap) => (
        <div key={cap.id} className="flex items-center justify-between px-4 py-3">
          <span className="text-sm">{t(cap.name)}</span>
          <CapabilityBadge status={cap.status} version={cap.version} />
        </div>
      ))}
    </div>
  )
}

function CapabilityBadge({ status, version }: { status: CapabilityStatus['status']; version?: string }) {
  const { t } = useTranslation()
  switch (status) {
    case 'checking':
      return <span className="text-xs text-muted-foreground animate-pulse">{t('setup.checking')}</span>
    case 'installed':
      return (
        <span className="text-xs text-green-600">
          {version ? `v${version}` : t('common.installed')}
        </span>
      )
    case 'not_installed':
      return <span className="text-xs text-orange-500">{t('common.notInstalled')}</span>
    case 'error':
      return <span className="text-xs text-red-500">{t('setup.checkFailed')}</span>
  }
}

// ─── 提供商选择步骤 ───

const allProviderIds = Object.keys(PROVIDERS)
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
  const { t } = useTranslation()
  const [showMore, setShowMore] = useState(false)
  const visibleIds = showMore ? allProviderIds : [...primaryIds]
  const providerCfg = PROVIDERS[onboard.provider]

  return (
    <div className="w-full max-w-md">
      <OnboardingProgress current={1} />
      <p className="text-center font-medium mb-4">{t('setup.configureLLM')}</p>
      <div className="flex gap-2 mb-2 justify-center flex-wrap">
        {visibleIds.map((p) => (
          <button
            key={p}
            onClick={() => updateOnboard({ provider: p, apiKey: '', model: '' })}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${
              onboard.provider === p
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            }`}
          >
            {PROVIDERS[p].label}
          </button>
        ))}
      </div>
      {secondaryIds.length > 0 && (
        <button
          onClick={() => setShowMore(!showMore)}
          className="mb-4 w-full text-xs text-muted-foreground hover:text-foreground transition"
        >
          {showMore ? t('setup.collapse') : t('setup.moreProviders', { count: secondaryIds.length })}
        </button>
      )}
      {providerCfg?.keyUrl && (
        <a
          href={providerCfg.keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-3 text-center text-xs text-primary hover:underline"
        >
          {t('setup.getApiKey', { provider: providerCfg.label })}
        </a>
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
        placeholder={t('setup.apiKeyPlaceholder', { provider: providerCfg?.label ?? onboard.provider })}
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
      <button
        onClick={onSkip}
        className="mt-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition"
      >
        {t('setup.skipRemaining')}
      </button>
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

function InstallList({
  capabilities,
  progress,
}: {
  capabilities: CapabilityStatus[]
  progress: Record<CapabilityId, InstallProgress>
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {capabilities.map((cap) => {
        const p = progress[cap.id]
        const isInstalling = p && (p.status === 'installing' || p.status === 'waiting')
        const isDone = cap.status === 'installed' || p?.status === 'done'
        const isError = p?.status === 'error'

        return (
          <div key={cap.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">{t(cap.name)}</span>
              {isDone && <span className="text-xs text-green-600">{t('setup.ready')}</span>}
              {isError && <span className="text-xs text-red-500">{t('setup.failed')}</span>}
              {isInstalling && p?.status === 'installing' && (
                <span className="text-xs text-blue-500">{p.progress ?? 0}%</span>
              )}
              {isInstalling && p?.status === 'waiting' && (
                <span className="text-xs text-muted-foreground">{t('setup.waiting')}</span>
              )}
            </div>
            {p?.status === 'installing' && p.progress !== undefined && (
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
            )}
            {p?.log && (
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{p.log}</p>
            )}
            {p?.error && (
              <p className="text-xs text-red-500 mt-1">{p.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
