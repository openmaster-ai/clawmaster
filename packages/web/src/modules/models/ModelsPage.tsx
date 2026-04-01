import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { platformResults } from '@/adapters'
import type { OpenClawConfig, ModelInfo, OpenClawModelProvider } from '@/lib/types'
import type { ModelProbeResult } from '@/shared/adapters/openclaw'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { allSuccess2 } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import LoadingState from '@/shared/components/LoadingState'

export default function Models() {
  const { t } = useTranslation()
  const [selectedDefault, setSelectedDefault] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [probePanelProvider, setProbePanelProvider] = useState<string | null>(null)
  const [probeLoading, setProbeLoading] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probeRun, setProbeRun] = useState<ModelProbeResult | null>(null)

  const formatProbeStdout = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    try {
      return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2)
    } catch {
      return raw
    }
  }, [])

  const runModelProbe = useCallback(async (providerId: string) => {
    setProbeError(null)
    setProbeRun(null)
    setProbeLoading(true)
    const r = await platformResults.testModelProvider(providerId)
    setProbeLoading(false)
    if (!r.success || r.data === undefined) {
      setProbeError(r.success ? t('models.probeNoData') : (r.error ?? t('models.probeFailed')))
      return
    }
    setProbeRun(r.data)
  }, [t])

  const fetcher = useCallback(async (): Promise<
    AdapterResult<{ config: OpenClawConfig; models: ModelInfo[] }>
  > => {
    const [cfg, modelList] = await Promise.all([
      platformResults.getConfig(),
      platformResults.getModels(),
    ])
    const combined = allSuccess2(cfg, modelList)
    if (!combined.success) {
      return fail(combined.error ?? t('models.bundleLoadFailed'))
    }
    const bundle = combined.data!
    return ok({ config: bundle.a, models: bundle.b })
  }, [t])

  const { data, loading, error, refetch } = useAdapterCall(fetcher)

  const { config, models } = data ?? { config: undefined as OpenClawConfig | undefined, models: [] as ModelInfo[] }

  const primaryFromConfig = config?.agents?.defaults?.model?.primary ?? ''

  useEffect(() => {
    if (data) {
      setSelectedDefault(primaryFromConfig)
    }
  }, [data, primaryFromConfig])

  const combinedOptions = useMemo(() => {
    const list = [...models]
    const idSet = new Set(list.map((m) => m.id))
    if (primaryFromConfig && !idSet.has(primaryFromConfig)) {
      list.unshift({
        id: primaryFromConfig,
        name: primaryFromConfig,
        provider: 'config',
        enabled: true,
      })
    }
    return list
  }, [models, primaryFromConfig])

  const handleDefaultModelChange = useCallback(
    async (modelId: string) => {
      if (!modelId || modelId === primaryFromConfig) {
        setSelectedDefault(modelId)
        return
      }
      setActionError(null)
      setSelectedDefault(modelId)
      setSavingDefault(true)
      const r = await platformResults.setDefaultModel(modelId)
      setSavingDefault(false)
      if (!r.success) {
        setActionError(r.error ?? t('models.savePrimaryFailed'))
      }
      void refetch()
    },
    [primaryFromConfig, refetch, t]
  )

  if (loading) {
    return <LoadingState message={t('models.loading')} />
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="py-8 text-center text-sm text-red-500">
          {t('models.loadFailed')}
          {error ?? t('common.unknownError')}
        </p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void refetch()}
            className="px-3 py-1.5 border border-border rounded text-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  const providers: Record<string, OpenClawModelProvider> = config?.models?.providers ?? {}

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <h1 className="text-2xl font-bold shrink-0">{t('models.title')}</h1>
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor="default-model" className="text-xs text-muted-foreground">
            {t('models.defaultLabel')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="default-model"
              className="px-3 py-1.5 bg-background rounded border border-border text-sm min-w-[12rem] max-w-full"
              value={selectedDefault}
              disabled={savingDefault || combinedOptions.length === 0}
              onChange={(e) => void handleDefaultModelChange(e.target.value)}
            >
              {combinedOptions.length === 0 ? (
                <option value="">{t('models.noModels')}</option>
              ) : (
                combinedOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))
              )}
            </select>
            {savingDefault && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {t('models.saving')}
              </span>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-500" role="alert">
          {actionError}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {t('models.currentPrimary')}{' '}
        <span className="font-medium text-foreground font-mono text-xs break-all">
          {primaryFromConfig || '—'}
        </span>
      </p>

      <h2 className="text-base font-medium">{t('models.providersTitle')}</h2>

      <div className="space-y-3">
        {Object.entries(providers).map(([providerId, provider]) => (
          <div key={providerId} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                <span className="font-medium capitalize">{providerId}</span>
                {provider.baseUrl && (
                  <span className="text-xs text-muted-foreground font-mono truncate" title={provider.baseUrl}>
                    ({provider.baseUrl})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Link
                  to="/config"
                  className="inline-flex items-center justify-center px-3 py-1 text-sm border border-border rounded hover:bg-accent"
                >
                  {t('models.edit')}
                </Link>
                <button
                  type="button"
                  className="px-3 py-1 text-sm border border-border rounded hover:bg-accent"
                  onClick={() => {
                    if (probePanelProvider === providerId) {
                      setProbePanelProvider(null)
                      setProbeError(null)
                      setProbeRun(null)
                    } else {
                      setProbeError(null)
                      setProbeRun(null)
                      setProbePanelProvider(providerId)
                    }
                  }}
                >
                  {t('models.test')}
                </button>
              </div>
            </div>

            {probePanelProvider === providerId && (
              <div className="space-y-3 mb-3 rounded-md bg-muted/50 px-3 py-3 border border-border text-sm">
                <p className="text-muted-foreground">
                  {t('models.testBlurb', {
                    cmd: `openclaw models status --json --probe --probe-provider ${providerId}`,
                  })}{' '}
                  <a
                    href="https://openclaws.io/docs/cli/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {t('models.testDocLink')}
                  </a>
                  .
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={probeLoading}
                    className="px-3 py-1.5 text-sm border border-border rounded bg-background hover:bg-accent disabled:opacity-50"
                    onClick={() => void runModelProbe(providerId)}
                  >
                    {probeLoading ? t('models.testBusy') : t('models.testRun')}
                  </button>
                </div>
                {probeError && (
                  <p className="text-red-500 text-sm" role="alert">
                    {probeError}
                  </p>
                )}
                {probeRun && (
                  <div className="space-y-2 text-xs">
                    <p className="text-muted-foreground">
                      {t('models.exitCode')}{' '}
                      <span className={probeRun.exitCode === 0 ? 'text-emerald-600' : 'text-amber-600'}>
                        {probeRun.exitCode}
                      </span>
                      {probeRun.exitCode === 0 ? t('models.exitOkHint') : ''}
                    </p>
                    {probeRun.stderr ? (
                      <pre className="max-h-40 overflow-auto rounded border border-border bg-background p-2 text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
                        {probeRun.stderr}
                      </pre>
                    ) : null}
                    {probeRun.stdout ? (
                      <pre className="max-h-64 overflow-auto rounded border border-border bg-background p-2 font-mono whitespace-pre-wrap break-all">
                        {formatProbeStdout(probeRun.stdout)}
                      </pre>
                    ) : (
                      <p className="text-muted-foreground">{t('models.stdoutEmpty')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {provider.models && provider.models.length > 0 && (
              <div className="text-sm text-muted-foreground">
                <p>
                  {t('models.availableModels')}{' '}
                  {provider.models
                    .map((m) => (typeof m === 'string' ? m : m.name || m.id || ''))
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            )}

            <p className="text-emerald-600 dark:text-emerald-500 text-sm mt-2">{t('models.written')}</p>
          </div>
        ))}

        {Object.keys(providers).length === 0 && (
          <div className="bg-card border border-border rounded-lg p-4 text-muted-foreground text-sm">
            {t('models.noProviders')}{' '}
            <code className="font-mono text-xs">models.providers</code>.
          </div>
        )}
      </div>

      <Link
        to="/config"
        className="inline-flex px-4 py-2 border border-border rounded hover:bg-accent text-sm"
      >
        {t('models.addProvider')}
      </Link>

      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-medium mb-2">{t('models.fallbackTitle')}</h2>
        <p className="text-sm text-muted-foreground mb-3">{t('models.fallbackBody')}</p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="px-3 py-1 bg-primary/10 text-primary rounded font-mono text-xs break-all">
            {primaryFromConfig || '—'}
          </span>
          <span className="text-muted-foreground">→</span>
          <Link to="/config" className="px-3 py-1 border border-border rounded hover:bg-accent text-sm">
            {t('models.fallbackGoto')}
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('models.jsonHint')}</p>
    </div>
  )
}
