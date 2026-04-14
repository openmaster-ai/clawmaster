import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Search, Sparkles } from 'lucide-react'
import { platform } from '@/adapters'
import { PasswordField } from '@/shared/components/PasswordField'
import { getProviderModelCatalogResult } from '@/shared/adapters/openclaw'
import { supportsProviderCatalog, type ProviderCatalogModel } from '@/shared/providerCatalog'
import { getSetupAdapter } from '@/modules/setup/adapters'
import { PROVIDERS, PRIMARY_PROVIDERS, PROVIDER_BADGES, getProviderCredentialLabel, getProviderLabel } from '@/modules/setup/types'
import type { OpenClawConfig, ModelInfo, OpenClawModelProvider, OpenClawModelRef } from '@/lib/types'

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

function splitProviderIds(providerIds: string[]) {
  const ordered = sortProviderIds(providerIds)
  return {
    sponsorIds: ordered.filter((providerId) => isGoldenSponsor(providerId)),
    otherIds: ordered.filter((providerId) => !isGoldenSponsor(providerId)),
  }
}

type ProviderModelOption = {
  id: string
  name: string
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
  const legacyModels = provider.models?.length ? provider.models : undefined
  const savedModels = hasSelectableProviderModels(legacyModels) ? legacyModels : undefined
  const shouldUseCanonicalFallback = shouldUseCanonicalErnieCatalog(providerId, legacyModels)
  const options = remoteModels?.length
    ? mergeProviderModelOptions(remoteModels)
    : shouldUseCanonicalFallback
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

function ProviderBadge({ providerId }: { providerId: string }) {
  const { t } = useTranslation()
  if (PROVIDER_BADGES[providerId as keyof typeof PROVIDER_BADGES] !== 'golden-sponsor') {
    return null
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${providerBadgeToneClass}`}>
      <Sparkles className="h-3.5 w-3.5" />
      {t('providers.badgeGoldenSponsor')}
    </span>
  )
}

export default function Models() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [preferredProvider, setPreferredProvider] = useState('baidu-aistudio')

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

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  const defaultModel = config?.agents?.defaults?.model?.primary || '-'
  const providers = config?.models?.providers || {}
  const hasProviders = Object.keys(providers).length > 0
  const orderedProviderEntries = Object.entries(providers).sort(([leftId], [rightId]) => {
    const leftScore = isGoldenSponsor(leftId) ? 0 : 1
    const rightScore = isGoldenSponsor(rightId) ? 0 : 1
    if (leftScore !== rightScore) return leftScore - rightScore
    return leftId.localeCompare(rightId)
  })

  return (
    <div className="page-shell page-shell-medium">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('models.title')}</h1>
          <p className="page-subtitle">
            {t('models.defaultModel', { model: defaultModel })}
          </p>
        </div>
        <button
          id="models-add-provider-trigger"
          onClick={() => {
            setPreferredProvider('baidu-aistudio')
            setShowAdd(true)
          }}
          className="button-primary"
        >
          {t('models.addProvider')}
        </button>
      </div>

      {/* 已配置的提供商 */}
      <div id="models-providers" className="space-y-3">
        {orderedProviderEntries.map(([providerId, provider]: [string, any]) => (
          <ProviderCard
            key={providerId}
            providerId={providerId}
            provider={provider}
            isDefault={defaultModel.startsWith(providerId + '/')}
            defaultModel={defaultModel}
            onRefresh={loadData}
          />
        ))}

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
                <p className="control-label">{t('models.recommendedProviders')}</p>
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
            </div>
          </div>
        )}
      </div>

      {/* 添加提供商面板 */}
      {showAdd && (
        <AddProviderPanel
          initialProvider={preferredProvider}
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
  provider,
  isDefault,
  defaultModel,
  onRefresh,
}: {
  providerId: string
  provider: OpenClawModelProvider & { apiKey?: string; api_key?: string; api?: string }
  isDefault: boolean
  defaultModel: string
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
  const currentModelId = getCurrentModelId(defaultModel, providerId)
  const canLoadProviderCatalog = supportsProviderCatalog(providerId, provider)
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
      providerId,
      apiKey: provider.apiKey || provider.api_key || undefined,
      baseUrl: provider.baseUrl,
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
  }, [canLoadProviderCatalog, providerId, provider.apiKey, provider.api_key, provider.baseUrl, t])

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
      provider.apiKey || provider.api_key || '',
      provider.baseUrl,
    )
    setTestResult(ok)
    setTesting(false)
  }

  const handleSetDefaultModel = async () => {
    if (!selectedModelId) return

    try {
      setSettingDefault(true)
      setSetModelError(null)
      await platform.setDefaultModel(`${providerId}/${selectedModelId}`)
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
          {isDefault && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{t('models.default')}</span>}
          {provider.baseUrl && (
            <span className="text-xs text-muted-foreground font-mono">({provider.baseUrl})</span>
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

      {(provider.apiKey || provider.api_key) && (
        <div className="mb-2 grid gap-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <span className="text-muted-foreground">API Key:</span>
          <PasswordField value={(provider.apiKey || provider.api_key) ?? ''} className="flex-1" />
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
              {providerId}
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
              {settingDefault ? t('models.settingDefault') : t('models.setAsDefault')}
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
      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
        selected ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent'
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
  onClose,
  onAdded,
}: {
  initialProvider: string
  onClose: () => void
  onAdded: () => void
}) {
  const { t, i18n } = useTranslation()
  const [provider, setProvider] = useState(initialProvider)
  const [apiKey, setApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const adapter = getSetupAdapter()

  const allIds = Object.keys(PROVIDERS)
  const primaryIds = PRIMARY_PROVIDERS as readonly string[]
  const visibleIds = showMore ? allIds : [...primaryIds]
  const { sponsorIds, otherIds } = splitProviderIds(visibleIds)
  const cfg = PROVIDERS[provider]
  const credentialLabel = getProviderCredentialLabel(provider, i18n.language)
  const providerLabel = getProviderLabel(provider, i18n.language)

  useEffect(() => {
    setProvider(initialProvider)
    setApiKey('')
    setCustomBaseUrl('')
    setError(null)
  }, [initialProvider])

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
    <div
      id="models-add-provider"
      data-provider={provider}
      className="surface-card-muted space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="section-title text-lg">{t('models.addProviderTitle')}</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">{t('common.cancel')}</button>
      </div>
      {sponsorIds.length > 0 && (
        <div className="space-y-2">
          <p className="control-label">{t('providers.badgeGoldenSponsor')}</p>
          <div className="flex gap-2 flex-wrap">
            {sponsorIds.map((p) => (
              <ProviderSelectButton
                key={p}
                providerId={p}
                selected={provider === p}
                onSelect={() => { setProvider(p); setApiKey(''); setCustomBaseUrl(''); setError(null) }}
              />
            ))}
          </div>
        </div>
      )}
      {otherIds.length > 0 && (
        <div className="space-y-2">
          <p className="control-label">{t('models.recommendedProviders')}</p>
          <div className="flex gap-2 flex-wrap">
            {otherIds.map((p) => (
              <ProviderSelectButton
                key={p}
                providerId={p}
                selected={provider === p}
                onSelect={() => { setProvider(p); setApiKey(''); setCustomBaseUrl(''); setError(null) }}
              />
            ))}
          </div>
        </div>
      )}
      {allIds.length > primaryIds.length && (
        <button onClick={() => setShowMore(!showMore)} className="text-xs text-muted-foreground hover:text-foreground">
          {showMore ? t('setup.collapse') : t('models.showMore', { count: allIds.length - primaryIds.length })}
        </button>
      )}
      {cfg?.keyUrl && (
        <a href={cfg.keyUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline">
          {t('models.getApiKey', { provider: providerLabel, credential: credentialLabel })} &rarr;
        </a>
      )}
      {cfg?.noteKey && (
        <p
          id="models-provider-note"
          className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
        >
          {t(cfg.noteKey)}
        </p>
      )}
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
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        onClick={handleAdd}
        disabled={!apiKey.trim() || busy}
        className="button-primary w-full"
      >
        {busy ? t('models.verifyAndAdding') : t('models.verifyAndAdd')}
      </button>
    </div>
  )
}
