import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { platform } from '@/adapters'
import { PasswordField } from '@/shared/components/PasswordField'
import { getSetupAdapter } from '@/modules/setup/adapters'
import { PROVIDERS, PRIMARY_PROVIDERS, PROVIDER_BADGES, getProviderCredentialLabel } from '@/modules/setup/types'
import type { OpenClawConfig, ModelInfo } from '@/lib/types'

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
  const { t } = useTranslation()
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
                        <p className="font-medium">{PROVIDERS[providerId]?.label ?? providerId}</p>
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
}: {
  providerId: string
  provider: any
  isDefault: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const adapter = getSetupAdapter()
  const knownProvider = PROVIDERS[providerId]

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

  return (
    <div className="surface-card">
      <div className="section-heading mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${isDefault ? 'bg-primary' : 'bg-green-500'}`} />
          <span className="font-medium">{knownProvider?.label ?? providerId}</span>
          <ProviderBadge providerId={providerId} />
          {isDefault && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{t('models.default')}</span>}
          {provider.baseUrl && (
            <span className="text-xs text-muted-foreground font-mono">({provider.baseUrl})</span>
          )}
        </div>
        <div className="flex gap-2">
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

      {(provider.apiKey || provider.api_key) && (
        <div className="mb-2 grid gap-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <span className="text-muted-foreground">API Key:</span>
          <PasswordField value={provider.apiKey || provider.api_key} className="flex-1" />
        </div>
      )}

      {provider.models?.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {t('models.availableModels', { models: provider.models.map((m: any) => m.name || m.id).join(', ') })}
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
  return (
    <button
      onClick={onSelect}
      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
        selected ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent'
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <span>{PROVIDERS[providerId].label}</span>
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
    <div id="models-add-provider" className="surface-card-muted space-y-3">
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
          {t('models.getApiKey', { provider: cfg.label, credential: credentialLabel })} &rarr;
        </a>
      )}
      {cfg?.needsBaseUrl && (
        <input
          type="url"
          placeholder={t('models.baseUrlPlaceholder')}
          value={customBaseUrl}
          onChange={(e) => setCustomBaseUrl(e.target.value)}
          className="control-input font-mono"
        />
      )}
      <input
        type="password"
        placeholder={t('models.apiKeyPlaceholder', {
          provider: cfg?.label ?? provider,
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
