import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { platform } from '@/adapters'
import { PasswordField } from '@/shared/components/PasswordField'
import { WorkflowModelSuggestion } from '@/shared/components/WorkflowModelSuggestion'
import { getProviderModelCatalogResult, setConfigResult } from '@/shared/adapters/openclaw'
import { supportsProviderCatalog, type ProviderCatalogModel } from '@/shared/providerCatalog'
import { getSetupAdapter } from '@/modules/setup/adapters'
import {
  PROVIDERS,
  PRIMARY_PROVIDERS,
  PRIMARY_IMAGE_PROVIDERS,
  TEXT_PROVIDER_TIERS,
  PROVIDER_BADGES,
  getProviderCredentialLabel,
  getProviderDefaultTarget,
  getProviderKind,
  getProviderLabel,
  getProviderRuntimeId,
} from '@/modules/setup/types'
import { getToolModelRecommendations } from '@/modules/setup/toolModelRecommendations'
import type { OpenClawConfig, ModelInfo, OpenClawModelProvider, OpenClawModelRef } from '@/lib/types'

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

function getConfiguredDisplayProviderIds(providers: Record<string, OpenClawModelProvider>) {
  const definedIds = Object.keys(PROVIDERS).filter((providerId) => Boolean(providers[getProviderRuntimeId(providerId)]))
  const coveredRuntimeIds = new Set(definedIds.map((providerId) => getProviderRuntimeId(providerId)))
  const fallbackIds = Object.keys(providers).filter((providerId) => !coveredRuntimeIds.has(providerId))

  return {
    textIds: sortProviderIds([
      ...definedIds.filter((providerId) => getProviderKind(providerId) !== 'text-to-image'),
      ...fallbackIds,
    ]),
    imageIds: sortProviderIds(
      definedIds.filter((providerId) => getProviderKind(providerId) === 'text-to-image'),
    ),
  }
}

type ProviderModelOption = {
  id: string
  name: string
}

type ConfiguredProvider = OpenClawModelProvider & {
  apiKey?: string
  api_key?: string
  api?: string
  imageApiKey?: string
  imageBaseUrl?: string
}

type ProviderCatalogStatus = 'idle' | 'loading' | 'live' | 'fallback' | 'error'

function getModelSourceId(model: string | OpenClawModelRef | undefined): string | null {
  if (!model) return null
  if (typeof model === 'string') {
    const id = model.trim()
    return id || null
  }

  const id = model.id?.trim()
  return id || null
}

function shouldUseCanonicalErnieCatalog(providerId: string, models: Array<string | OpenClawModelRef> | undefined) {
  if (providerId !== 'baidu-aistudio' || !models?.length) {
    return false
  }

  return models.some((model) => {
    const id = getModelSourceId(model)
    return id === 'deepseek-v3' || id === 'deepseek-r1'
  })
}

function normalizeModelOption(model: string | OpenClawModelRef | undefined): ProviderModelOption | null {
  if (!model) return null
  if (typeof model === 'string') {
    const id = model.trim()
    return id ? { id, name: id } : null
  }

  const id = model.id?.trim()
  if (!id) return null
  return {
    id,
    name: model.name?.trim() || id,
  }
}

function hasSelectableProviderModels(models: Array<string | OpenClawModelRef> | undefined) {
  return Boolean(models?.some((model) => getModelSourceId(model)))
}

function mergeProviderModelOptions(
  ...sources: Array<Array<string | OpenClawModelRef | ProviderModelOption> | undefined>
) {
  const merged: ProviderModelOption[] = []

  for (const source of sources) {
    if (!source?.length) continue
    for (const model of source) {
      const option = typeof model === 'object' && model !== null && 'id' in model && 'name' in model
        ? model as ProviderModelOption
        : normalizeModelOption(model as string | OpenClawModelRef | undefined)
      if (!option) continue
      if (merged.some((item) => item.id === option.id)) continue
      merged.push(option)
    }
  }

  return merged
}

function getProviderModelOptions(
  providerId: string,
  provider: OpenClawModelProvider,
  currentModelId: string | null,
  remoteModels: ProviderModelOption[] | null,
): ProviderModelOption[] {
  const knownProvider = PROVIDERS[providerId]
  const providerKind = getProviderKind(providerId)
  const legacyModels = provider.models?.length ? provider.models : undefined
  const savedModels = providerKind === 'text-to-image'
    ? undefined
    : hasSelectableProviderModels(legacyModels)
      ? legacyModels
      : undefined
  const shouldUseCanonicalFallback = shouldUseCanonicalErnieCatalog(providerId, legacyModels)
  const options = remoteModels?.length
    ? mergeProviderModelOptions(remoteModels)
    : shouldUseCanonicalFallback
      ? mergeProviderModelOptions(knownProvider?.models)
      : providerKind === 'text-to-image'
        ? mergeProviderModelOptions(knownProvider?.models)
        : mergeProviderModelOptions(savedModels, knownProvider?.models)

  if (currentModelId && !options.some((option) => option.id === currentModelId)) {
    options.unshift({ id: currentModelId, name: currentModelId })
  }

  return options.filter((option, index, array) => array.findIndex((item) => item.id === option.id) === index)
}

function getCurrentModelId(defaultModel: string, providerId: string): string | null {
  const prefix = `${providerId}/`
  if (!defaultModel.startsWith(prefix)) {
    return null
  }
  return defaultModel.slice(prefix.length)
}

function getProviderApiKey(providerId: string, provider: ConfiguredProvider): string | undefined {
  if (getProviderKind(providerId) === 'text-to-image') {
    return provider.imageApiKey || provider.apiKey || provider.api_key || undefined
  }

  return provider.apiKey || provider.api_key || undefined
}

function getProviderBaseUrl(providerId: string, provider: ConfiguredProvider): string | undefined {
  if (providerId === 'openai-image' || providerId === 'google-image') {
    return provider.imageBaseUrl
  }

  if (getProviderKind(providerId) === 'text-to-image') {
    return provider.baseUrl
  }

  return provider.baseUrl
}

function getQuickPickModels(models: ProviderModelOption[], currentModelId: string | null) {
  const quickPicks: ProviderModelOption[] = []

  if (currentModelId) {
    const current = models.find((model) => model.id === currentModelId)
    if (current) quickPicks.push(current)
  }

  for (const model of models) {
    if (quickPicks.some((item) => item.id === model.id)) continue
    quickPicks.push(model)
    if (quickPicks.length === 2) break
  }

  return quickPicks
}

function ProviderBadge(_: { providerId: string }) {
  return null
}

function ProviderGuidancePanel({
  providerId,
  toolModelExamples,
}: {
  providerId: string
  toolModelExamples: string[]
}) {
  const { t } = useTranslation()
  const provider = PROVIDERS[providerId]
  const shouldShowModelSuggestion = getProviderKind(providerId) === 'text-to-image'
  if (!provider?.guideKey && !provider?.recommendedSkill && !shouldShowModelSuggestion) {
    return null
  }

  return (
    <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-4">
      {provider.guideKey && (
        <p className="text-sm text-foreground/90">{t(provider.guideKey)}</p>
      )}
      {provider.recommendedSkill && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="control-label">{t('models.recommendedSkill')}</p>
            <p className="text-sm font-medium">{provider.recommendedSkill.name}</p>
            <p className="text-xs text-muted-foreground">{t(provider.recommendedSkill.descriptionKey)}</p>
          </div>
          <Link to="/skills" className="button-secondary text-center">
            {t('models.openSkills')}
          </Link>
        </div>
      )}
      {shouldShowModelSuggestion && (
        <div className={provider.recommendedSkill ? 'mt-4' : 'mt-0'}>
          <WorkflowModelSuggestion
            title={t('workflowModel.title')}
            body={t('workflowModel.imageBody')}
            examples={toolModelExamples}
            examplesLabel={t('workflowModel.examples')}
            footnote={t('workflowModel.examplesOnly')}
          />
        </div>
      )}
    </div>
  )
}

export default function Models() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [preferredProvider, setPreferredProvider] = useState('baiduqianfancodingplan')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [cfg, modelList] = await Promise.all([
        platform.getConfig(),
        platform.getModels(),
      ])
      setConfig(cfg)
      setModels(modelList)
    } catch (err) {
      console.error('Failed to load models:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const toolModelExamples = getToolModelRecommendations(config, i18n.language)
    .map((example) => `${example.providerLabel} / ${example.modelLabel}`)

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  const defaultModel = config?.agents?.defaults?.model?.primary || '-'
  const defaultImageModel = config?.agents?.defaults?.imageGenerationModel?.primary || ''
  const providers = config?.models?.providers || {}
  const { textIds: configuredTextProviderIds, imageIds: configuredImageProviderIds } = getConfiguredDisplayProviderIds(providers)
  const hasProviders = configuredTextProviderIds.length > 0 || configuredImageProviderIds.length > 0

  return (
    <div className="page-shell page-shell-medium">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('models.title')}</h1>
          <p className="page-subtitle">
            {t('models.defaultModel', { model: defaultModel })}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
              <p className="control-label">{t('models.textDefault')}</p>
              <p className="mt-1 truncate text-sm font-medium">{defaultModel}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
              <p className="control-label">{t('models.imageGenerationDefault')}</p>
              <p className="mt-1 truncate text-sm font-medium">{defaultImageModel || t('common.notSet')}</p>
            </div>
          </div>
        </div>
        <button
          id="models-add-provider-trigger"
          onClick={() => {
            setPreferredProvider('baiduqianfancodingplan')
            setShowAdd(true)
          }}
          className="button-primary"
        >
          {t('models.addProvider')}
        </button>
      </div>

      {/* 已配置的提供商 */}
      <div id="models-providers" className="space-y-3">
        {configuredTextProviderIds.length > 0 && (
          <section id="models-text-providers" className="space-y-3">
            <div className="section-heading">
              <div>
                <h2 className="section-title">{t('models.textProviders')}</h2>
                <p className="section-subtitle">{t('models.textProvidersDesc')}</p>
              </div>
            </div>
            {configuredTextProviderIds.map((providerId) => {
              const runtimeProviderId = getProviderRuntimeId(providerId)
              const provider = providers[runtimeProviderId] as ConfiguredProvider
              return (
                <ProviderCard
                  key={providerId}
                  providerId={providerId}
                  runtimeProviderId={runtimeProviderId}
                  provider={provider}
                  isDefault={defaultModel.startsWith(runtimeProviderId + '/')}
                  defaultModel={defaultModel}
                  toolModelExamples={toolModelExamples}
                  onRefresh={loadData}
                />
              )
            })}
          </section>
        )}

        {configuredImageProviderIds.length > 0 && (
          <section id="models-image-providers" className="space-y-3">
            <div className="section-heading">
              <div>
                <h2 className="section-title">{t('models.imageProviders')}</h2>
                <p className="section-subtitle">{t('models.imageProvidersDesc')}</p>
              </div>
            </div>
            {configuredImageProviderIds.map((providerId) => {
              const runtimeProviderId = getProviderRuntimeId(providerId)
              const provider = providers[runtimeProviderId] as ConfiguredProvider
              return (
                <ProviderCard
                  key={providerId}
                  providerId={providerId}
                  runtimeProviderId={runtimeProviderId}
                  provider={provider}
                  isDefault={defaultImageModel.startsWith(runtimeProviderId + '/')}
                  defaultModel={defaultImageModel}
                  toolModelExamples={toolModelExamples}
                  onRefresh={loadData}
                />
              )
            })}
          </section>
        )}

        {!hasProviders && (
          <div id="models-first-run" className="surface-card">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
              <div className="space-y-3">
                <div className="section-heading">
                  <div>
                    <h3 className="section-title">{t('models.firstRunTitle')}</h3>
                    <p className="section-subtitle">{t('models.firstRunDesc')}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="surface-card-muted">
                    <p className="control-label">1</p>
                    <p className="mt-2 text-sm font-medium">{t('models.firstRunStepProvider')}</p>
                  </div>
                  <div className="surface-card-muted">
                    <p className="control-label">2</p>
                    <p className="mt-2 text-sm font-medium">{t('models.firstRunStepVerify')}</p>
                  </div>
                  <div className="surface-card-muted">
                    <p className="control-label">3</p>
                    <p className="mt-2 text-sm font-medium">{t('models.firstRunStepDefault')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="control-label">{t('models.textProviders')}</p>
                  {([...PRIMARY_PROVIDERS] as string[]).slice(0, 4).map((providerId) => (
                    <button
                      key={providerId}
                      type="button"
                      onClick={() => {
                        setPreferredProvider(providerId)
                        setShowAdd(true)
                      }}
                      className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-background/80"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{getProviderLabel(providerId, i18n.language)}</p>
                          <ProviderBadge providerId={providerId} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {(PROVIDERS[providerId]?.models ?? [])
                            .slice(0, 2)
                            .map((item) => item.name)
                            .join(' / ') || t('models.addProviderTitle')}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-primary">{t('models.recommendedProviderCta')}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="control-label">{t('models.imageProviders')}</p>
                  {(PRIMARY_IMAGE_PROVIDERS as readonly string[]).map((providerId) => (
                    <button
                      key={providerId}
                      type="button"
                      onClick={() => {
                        setPreferredProvider(providerId)
                        setShowAdd(true)
                      }}
                      className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-background/80"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{getProviderLabel(providerId, i18n.language)}</p>
                          <ProviderBadge providerId={providerId} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {(PROVIDERS[providerId]?.models ?? [])
                            .slice(0, 2)
                            .map((item) => item.name)
                            .join(' / ') || t('models.addProviderTitle')}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-primary">{t('models.recommendedProviderCta')}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 添加提供商面板 */}
      {showAdd && (
        <AddProviderPanel
          initialProvider={preferredProvider}
          toolModelExamples={toolModelExamples}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

// ─── 提供商卡片 ───

function ProviderCard({
  providerId,
  runtimeProviderId,
  provider,
  isDefault,
  defaultModel,
  toolModelExamples,
  onRefresh,
}: {
  providerId: string
  runtimeProviderId: string
  provider: ConfiguredProvider
  isDefault: boolean
  defaultModel: string
  toolModelExamples: string[]
  onRefresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [modelQuery, setModelQuery] = useState('')
  const [settingDefault, setSettingDefault] = useState(false)
  const [setModelError, setSetModelError] = useState<string | null>(null)
  const [remoteModels, setRemoteModels] = useState<ProviderModelOption[] | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<ProviderCatalogStatus>('idle')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const adapter = getSetupAdapter()
  const providerConfig = PROVIDERS[providerId]
  const defaultTarget = getProviderDefaultTarget(providerId)
  const currentModelId = getCurrentModelId(defaultModel, runtimeProviderId)
  const providerApiKey = getProviderApiKey(providerId, provider)
  const providerBaseUrl = getProviderBaseUrl(providerId, provider)
  const canLoadProviderCatalog = providerConfig?.supportsCatalog !== false && supportsProviderCatalog(runtimeProviderId, provider)
  const displayModels = useMemo(
    () => getProviderModelOptions(providerId, provider, currentModelId, remoteModels),
    [providerId, provider, currentModelId, remoteModels],
  )
  const quickPicks = useMemo(
    () => getQuickPickModels(displayModels, currentModelId),
    [displayModels, currentModelId],
  )
  const selectedModelExists = displayModels.some((model) => model.id === selectedModelId)

  useEffect(() => {
    setSelectedModelId(currentModelId || '')
  }, [providerId, currentModelId])

  useEffect(() => {
    setSelectedModelId((previous) => previous || displayModels[0]?.id || '')
  }, [providerId, displayModels])

  useEffect(() => {
    if (!showModelPicker) {
      setModelQuery('')
    }
  }, [showModelPicker])

  const loadRemoteModels = useCallback(async () => {
    if (!canLoadProviderCatalog) {
      setRemoteModels(null)
      setCatalogStatus('fallback')
      setCatalogError(null)
      return
    }

    setCatalogStatus('loading')
    setCatalogError(null)
        const result = await getProviderModelCatalogResult({
      providerId: runtimeProviderId,
      apiKey: providerApiKey,
      baseUrl: providerBaseUrl,
    })

    if (result.success && result.data?.length) {
      setRemoteModels(result.data.map((model: ProviderCatalogModel) => ({
        id: model.id,
        name: model.name,
      })))
      setCatalogStatus('live')
      setCatalogError(null)
      return
    }

    setRemoteModels(null)
    setCatalogStatus(result.success ? 'fallback' : 'error')
    setCatalogError(result.success ? null : (result.error ?? t('common.requestFailed')))
  }, [canLoadProviderCatalog, runtimeProviderId, providerApiKey, providerBaseUrl, t])

  useEffect(() => {
    let active = true

    const run = async () => {
      await loadRemoteModels()
      if (!active) return
    }

    run()

    return () => {
      active = false
    }
  }, [loadRemoteModels])

  const selectedModel = displayModels.find((model) => model.id === selectedModelId) ?? null
  const currentModel = displayModels.find((model) => model.id === currentModelId) ?? null
  const isLiveCatalog = catalogStatus === 'live'
  const normalizedQuery = modelQuery.trim().toLowerCase()
  const filteredModels = useMemo(() => {
    const rankedModels = [...displayModels].sort((left, right) => {
      const leftRank = left.id === selectedModelId ? 0 : left.id === currentModelId ? 1 : 2
      const rightRank = right.id === selectedModelId ? 0 : right.id === currentModelId ? 1 : 2
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.name.localeCompare(right.name)
    })

    if (!normalizedQuery) {
      return rankedModels
    }

    return rankedModels.filter((model) =>
      `${model.name} ${model.id}`.toLowerCase().includes(normalizedQuery),
    )
  }, [displayModels, currentModelId, normalizedQuery, selectedModelId])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const ok = await adapter.onboarding.testApiKey(
      providerId,
      providerApiKey || '',
      providerBaseUrl,
    )
    setTestResult(ok)
    setTesting(false)
  }

  const handleSetDefaultModel = async () => {
    if (!selectedModelId) return

    try {
      setSettingDefault(true)
      setSetModelError(null)
      const runtimeModelRef = `${runtimeProviderId}/${selectedModelId}`
      if (defaultTarget === 'imageGeneration') {
        const result = await setConfigResult('agents.defaults.imageGenerationModel.primary', runtimeModelRef)
        if (!result.success) {
          throw new Error(result.error ?? t('common.requestFailed'))
        }
      } else {
        await platform.setDefaultModel(runtimeModelRef)
      }
      await onRefresh()
      setShowModelPicker(false)
    } catch (error) {
      setSetModelError(error instanceof Error ? error.message : String(error))
    } finally {
      setSettingDefault(false)
    }
  }

  return (
    <div className="surface-card">
      <div className="section-heading mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${isDefault ? 'bg-primary' : 'bg-green-500'}`} />
          <span className="font-medium">{getProviderLabel(providerId, i18n.language)}</span>
          <ProviderBadge providerId={providerId} />
          {isDefault && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
              {defaultTarget === 'imageGeneration' ? t('models.imageDefaultShort') : t('models.default')}
            </span>
          )}
          {providerBaseUrl && (
            <span className="text-xs text-muted-foreground font-mono">({providerBaseUrl})</span>
          )}
        </div>
        <div className="flex gap-2">
          {canLoadProviderCatalog && (
            <button
              type="button"
              onClick={() => { void loadRemoteModels() }}
              disabled={catalogStatus === 'loading'}
              className="button-secondary inline-flex items-center gap-2 px-3 py-1"
            >
              {catalogStatus === 'loading' ? t('models.refreshingModels') : t('models.refreshModels')}
            </button>
          )}
          {displayModels.length > 0 && (
            <button
              type="button"
              onClick={() => setShowModelPicker((value) => !value)}
              className="button-secondary inline-flex items-center gap-2 px-3 py-1"
            >
              <ChevronsUpDown className="h-4 w-4" />
              {showModelPicker ? t('models.hideModelPicker') : t('models.chooseModel')}
            </button>
          )}
          <button
            onClick={handleTest}
            disabled={testing}
            className="button-secondary px-3 py-1"
          >
            {testing ? t('models.testing') : t('models.testConnection')}
          </button>
          {testResult === true && <span className="text-green-600 text-sm self-center">{t('models.connectionOk')}</span>}
          {testResult === false && <span className="text-red-500 text-sm self-center">{t('models.connectionFailed')}</span>}
        </div>
      </div>

      <ProviderGuidancePanel providerId={providerId} toolModelExamples={toolModelExamples} />

      {canLoadProviderCatalog && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2.5 py-1 font-medium ${
            isLiveCatalog
              ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : catalogStatus === 'error'
                ? 'border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-300'
                : 'border-border/80 bg-card text-muted-foreground'
          }`}>
            {isLiveCatalog
              ? t('models.liveCatalog')
              : catalogStatus === 'loading'
                ? t('models.loadingLiveModels')
                : catalogStatus === 'error'
                  ? t('models.catalogUnavailable')
                  : t('models.fallbackCatalog')}
          </span>
          <span className="text-muted-foreground">
            {isLiveCatalog
              ? t('models.liveCatalogDesc')
              : t('models.fallbackCatalogDesc')}
          </span>
        </div>
      )}

      {quickPicks.length > 0 && (
        <div className="mb-4 rounded-2xl border border-border/70 bg-background/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="control-label">{t('models.quickPicks')}</p>
              <div className="flex flex-wrap gap-2">
                {quickPicks.map((model) => {
                  const isCurrent = model.id === currentModelId
                  return (
                    <span
                      key={model.id}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                        isCurrent
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground/80'
                      }`}
                    >
                      {isCurrent && <Check className="h-3.5 w-3.5" />}
                      <span>{model.name}</span>
                    </span>
                  )
                })}
              </div>
            </div>
            {currentModelId && (
              <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium text-background">
                {t('models.current')}
              </span>
            )}
          </div>
        </div>
      )}

      {providerApiKey && (
        <div className="mb-2 grid gap-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <span className="text-muted-foreground">API Key:</span>
          <PasswordField value={providerApiKey} className="flex-1" />
        </div>
      )}

      {showModelPicker && displayModels.length > 0 && (
        <div
          id={`models-provider-picker-${providerId}`}
          className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{t('models.pickModel')}</p>
              <p className="text-xs text-muted-foreground">{t('models.pickModelDesc')}</p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {runtimeProviderId}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="control-label">{t('common.search')}</span>
              <p className="text-[11px] text-muted-foreground">
                {catalogStatus === 'loading'
                  ? t('models.loadingLiveModels')
                  : t('models.showingModels', { count: filteredModels.length, total: displayModels.length })}
              </p>
            </div>
            <label className="block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder={t('models.searchModelsPlaceholder')}
                  className="control-input h-10 pl-9"
                />
              </div>
            </label>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-2.5">
              {canLoadProviderCatalog && (
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  isLiveCatalog
                    ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-border bg-card text-muted-foreground'
                }`}>
                  {isLiveCatalog ? t('models.liveCatalog') : t('models.fallbackCatalog')}
                </span>
              )}
              <div className="min-w-0">
                {selectedModelId === currentModelId ? (
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t('models.current')}
                    </span>
                    <span className="font-medium">{currentModel?.name ?? currentModelId ?? '-'}</span>
                    {currentModel?.id && (
                      <span className="truncate font-mono text-[11px] text-muted-foreground">{currentModel.id}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="rounded-full border border-border/80 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {t('models.current')}
                    </span>
                    <span className="font-medium">{currentModel?.name ?? currentModelId ?? '-'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t('models.selected')}
                    </span>
                    <span className="font-medium text-primary">{selectedModel?.name ?? '-'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 grid max-h-[44vh] gap-1.5 overflow-y-auto pr-1">
            {filteredModels.map((model) => {
              const selected = selectedModelId === model.id
              const current = currentModelId === model.id
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedModelId(model.id)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                    selected
                      ? 'border-primary/40 bg-background shadow-sm ring-1 ring-primary/15'
                      : 'border-border/80 bg-card/60 hover:border-primary/20 hover:bg-background/80'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={`mt-0.5 inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : current
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-border bg-background text-transparent'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium leading-5">{model.name}</p>
                      <p className="truncate text-[11px] font-mono text-muted-foreground">{model.id}</p>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-1.5">
                    {current && (
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {t('models.current')}
                      </span>
                    )}
                    {selected && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                        {t('models.selected')}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {filteredModels.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
              {t('models.noMatchingModels')}
            </div>
          )}

          {catalogError && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-300/50 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <span>{catalogError}</span>
              <button
                type="button"
                onClick={() => { void loadRemoteModels() }}
                className="button-secondary px-2.5 py-1 text-xs"
              >
                {t('common.refresh')}
              </button>
            </div>
          )}

          {setModelError && (
            <p className="mt-3 text-xs text-red-500">{setModelError}</p>
          )}

          <div className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-background/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="control-label">
                {selectedModelId === currentModelId ? t('models.current') : t('models.selected')}
              </p>
              <p className="truncate text-[13px] font-medium">
                {selectedModel?.name ?? (selectedModelId !== currentModelId ? selectedModelId : currentModel?.name) ?? '-'}
              </p>
              <p className="truncate text-[11px] font-mono text-muted-foreground">
                {selectedModel?.id ?? (selectedModelId !== currentModelId ? selectedModelId : currentModel?.id) ?? currentModelId ?? '-'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowModelPicker(false)}
              className="button-secondary px-3 py-1"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSetDefaultModel}
              disabled={!selectedModelId || !selectedModelExists || selectedModelId === currentModelId || settingDefault}
              className="button-primary px-3 py-1"
            >
              {settingDefault
                ? t('models.settingDefault')
                : defaultTarget === 'imageGeneration'
                  ? t('models.setAsImageDefault')
                  : t('models.setAsDefault')}
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProviderSelectButton({
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
      type="button"
      data-provider-id={providerId}
      onClick={onSelect}
      className={`w-full rounded-[1.15rem] border px-4 py-3 text-left text-sm transition ${
        selected
          ? 'border-foreground bg-foreground text-background shadow-sm'
          : 'border-border/80 bg-card/70 hover:border-primary/25 hover:bg-background/85'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <span>{getProviderLabel(providerId, i18n.language)}</span>
        <ProviderBadge providerId={providerId} />
      </span>
    </button>
  )
}

// ─── 添加提供商面板 ───

function AddProviderPanel({
  initialProvider,
  toolModelExamples,
  onClose,
  onAdded,
}: {
  initialProvider: string
  toolModelExamples: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const { t, i18n } = useTranslation()
  const [provider, setProvider] = useState(initialProvider)
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({})
  const adapter = getSetupAdapter()

  const allIds = Object.keys(PROVIDERS)
  const primaryImageIds = PRIMARY_IMAGE_PROVIDERS as readonly string[]
  const imageIds = sortProviderIds(primaryImageIds.filter((providerId) => allIds.includes(providerId)))
  // Count hidden (collapsible) text providers to decide whether to show the
  // tier-level "更多" toggles. Non-tiered text providers (if any) fall into
  // a legacy bucket shown in the compatible-and-local tier's tail.
  const tieredTextIds = new Set(
    TEXT_PROVIDER_TIERS.flatMap((tier) => [
      ...tier.members,
      ...(tier.collapsible?.members ?? []),
    ]),
  )
  const legacyTextIds = allIds.filter(
    (id) => getProviderKind(id) !== 'text-to-image' && !tieredTextIds.has(id),
  )
  const cfg = PROVIDERS[provider]
  const credentialLabel = getProviderCredentialLabel(provider, i18n.language)
  const providerLabel = getProviderLabel(provider, i18n.language)
  const willInstallBundledSkill = provider === 'baidu-aistudio-image'
  const providerExamples = (cfg?.models ?? []).slice(0, 3).map((model) => model.name).join(' / ')

  function selectProvider(nextProvider: string) {
    setProvider(nextProvider)
    setApiKey('')
    setCustomBaseUrl('')
    setError(null)
  }

  useEffect(() => {
    setProvider(initialProvider)
    setApiKey('')
    setCustomBaseUrl('')
    setError(null)
  }, [initialProvider])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleAdd = async () => {
    if (!apiKey.trim()) return
    if (cfg?.needsBaseUrl && !customBaseUrl.trim()) {
      setError(t('models.enterBaseUrl'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const ok = await adapter.onboarding.testApiKey(provider, apiKey, customBaseUrl || undefined)
      if (!ok) {
        setError(t('models.verifyFailed'))
        setBusy(false)
        return
      }
      await adapter.onboarding.setApiKey(provider, apiKey, customBaseUrl || undefined)
      setBusy(false)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 py-4 sm:px-6 sm:py-8">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div
        id="models-add-provider"
        role="dialog"
        aria-modal="true"
        aria-labelledby="models-add-provider-title"
        data-provider={provider}
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[min(92rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-background/95 shadow-2xl sm:max-h-[calc(100vh-4rem)] sm:max-w-[min(96vw,96rem)]"
      >
        <div className="shrink-0 border-b border-border/70 bg-card/80 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="models-add-provider-title" className="section-title text-[1.35rem]">
                  {t('models.addProviderTitle')}
                </h3>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {providerLabel}
                </span>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {providerExamples || t('models.defaultModel', { model: providerLabel })}
              </p>
            </div>
            <button type="button" onClick={onClose} className="button-secondary px-3">
              {t('common.cancel')}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-border/70 bg-card/55 px-5 py-5 sm:px-6 xl:border-b-0 xl:border-r">
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="control-label">{t('models.textProviders')}</p>
                  <p className="text-sm text-muted-foreground">{t('models.textProvidersDesc')}</p>
                </div>
                {TEXT_PROVIDER_TIERS.map((tier) => {
                  const visible = tier.members.filter((id) => allIds.includes(id))
                  const hidden = tier.collapsible
                    ? tier.collapsible.members.filter((id) => allIds.includes(id))
                    : []
                  if (visible.length === 0 && hidden.length === 0) return null

                  const expanded = expandedTiers[tier.id] === true
                  const rendered = expanded ? [...visible, ...hidden] : visible

                  return (
                    <div key={tier.id} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {t(tier.labelKey)}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        {rendered.map((p) => (
                          <ProviderSelectButton
                            key={p}
                            providerId={p}
                            selected={provider === p}
                            onSelect={() => selectProvider(p)}
                          />
                        ))}
                      </div>
                      {hidden.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTiers((prev) => ({ ...prev, [tier.id]: !expanded }))
                          }
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {expanded
                            ? t('setup.collapse')
                            : t(tier.collapsible!.labelKey, { count: hidden.length })}
                        </button>
                      )}
                    </div>
                  )
                })}
                {legacyTextIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('providers.tierCompatibleAndLocal')}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      {sortProviderIds(legacyTextIds).map((p) => (
                        <ProviderSelectButton
                          key={p}
                          providerId={p}
                          selected={provider === p}
                          onSelect={() => selectProvider(p)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {imageIds.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="control-label">{t('models.imageProviders')}</p>
                    <p className="text-sm text-muted-foreground">{t('models.imageProvidersDesc')}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    {imageIds.map((p) => (
                      <ProviderSelectButton
                        key={p}
                        providerId={p}
                        selected={provider === p}
                        onSelect={() => selectProvider(p)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <div className="mx-auto grid max-w-6xl gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,24rem)]">
              <div className="space-y-5">
                <div className="rounded-[1.7rem] border border-border/80 bg-card/85 p-5 backdrop-blur-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[1.15rem] font-semibold tracking-tight">{providerLabel}</p>
                        <ProviderBadge providerId={provider} />
                      </div>
                      {providerExamples && (
                        <p className="text-sm text-muted-foreground">{providerExamples}</p>
                      )}
                    </div>
                    {cfg?.keyUrl && (
                      <a href={cfg.keyUrl} target="_blank" rel="noopener noreferrer" className="button-secondary text-sm">
                        {t('models.getApiKey', { provider: providerLabel, credential: credentialLabel })} &rarr;
                      </a>
                    )}
                  </div>

                  {cfg?.noteKey && (
                    <p
                      id="models-provider-note"
                      className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
                    >
                      {t(cfg.noteKey)}
                    </p>
                  )}

                  {willInstallBundledSkill && (
                    <div
                      id="models-provider-skill-install-note"
                      className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100"
                    >
                      <p className="font-medium">{t('models.skillInstallNoticeTitle')}</p>
                      <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-100/90">
                        {t('models.ernieImageSkillInstallNotice')}
                      </p>
                    </div>
                  )}
                </div>

                <ProviderGuidancePanel providerId={provider} toolModelExamples={toolModelExamples} />
              </div>

              <div className="space-y-4 rounded-[1.7rem] border border-border/80 bg-card/90 p-5 backdrop-blur-sm 2xl:sticky 2xl:top-0 2xl:self-start">
                <div className="space-y-1">
                  <p className="control-label">{t('models.addProviderTitle')}</p>
                  <p className="text-sm text-muted-foreground">
                    {providerLabel}
                  </p>
                </div>

                {cfg?.needsBaseUrl && (
                  <input
                    id="models-provider-base-url"
                    type="url"
                    placeholder={t('models.baseUrlPlaceholder')}
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    className="control-input font-mono"
                  />
                )}

                <input
                  id="models-provider-api-key"
                  type="password"
                  placeholder={t('models.apiKeyPlaceholder', {
                    provider: providerLabel,
                    credential: credentialLabel,
                  })}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="control-input font-mono"
                />

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  onClick={handleAdd}
                  disabled={!apiKey.trim() || busy}
                  className="button-primary w-full"
                >
                  {busy ? t('models.verifyAndAdding') : t('models.verifyAndAdd')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
