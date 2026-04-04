import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { platformResults } from '@/adapters'
import type { OpenclawMemoryStatusPayload, PowermemMemoryRow, PowermemMeta } from '@/lib/types'
import type { OpenclawMemoryHit } from '@/shared/memoryOpenclawParse'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import type { PowermemBootstrapClientEvent } from '@/shared/adapters/memory'
import { POWMEM_DEFAULT_ENV_META_SENTINEL } from '@/shared/powermemFromOpenclawConfig'
import { getIsTauri } from '@/shared/adapters/platform'

function needsManagedPowermemBootstrap(m: PowermemMeta): boolean {
  return (
    m.configured &&
    m.enabled &&
    m.mode === 'cli' &&
    Boolean(m.managedRuntimeDir) &&
    !m.managedRuntimeReady &&
    !m.managedRuntimeDisabled
  )
}

/** Full PowerMem configuration template (database, LLM, embedding, HTTP server, …). */
const POWERMEM_ENV_EXAMPLE_URL = 'https://github.com/oceanbase/powermem/blob/main/.env.example'

function formatPowermemEnvErr(raw: string, t: TFunction): string {
  const m = raw.match(/POWERMEM_[A-Z_]+/)
  const code = m?.[0]
  switch (code) {
    case 'POWERMEM_ENV_HTTP_MODE':
      return t('memory.powermemEnvHttpMode')
    case 'POWERMEM_ENV_NO_PATH':
      return t('memory.powermemEnvNoPath')
    case 'POWERMEM_NOT_CONFIGURED':
      return t('memory.powermemEnvNotConfigured')
    case 'POWERMEM_PLUGIN_DISABLED':
      return t('memory.powermemEnvPluginDisabled')
    case 'POWERMEM_ENV_TOO_LARGE':
      return t('memory.powermemEnvTooLarge')
    default:
      return raw.trim() ? raw : t('memory.powermemEnvLoadFailed')
  }
}

function PowermemEnvEditorBlock() {
  const { t } = useTranslation()
  const [path, setPath] = useState('')
  const [draft, setDraft] = useState('')
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const dirty = draft !== baseline

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const r = await platformResults.powermemEnvGet()
    setLoading(false)
    if (!r.success || !r.data) {
      setErr(formatPowermemEnvErr(r.error ?? '', t))
      return
    }
    setPath(r.data.path)
    setDraft(r.data.content)
    setBaseline(r.data.content)
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setErr(null)
    const r = await platformResults.powermemEnvPut(draft)
    setSaving(false)
    if (!r.success) {
      setErr(formatPowermemEnvErr(r.error ?? '', t))
      return
    }
    setBaseline(draft)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <h4 className="text-sm font-medium text-foreground">{t('memory.powermemEnvEditorTitle')}</h4>
      <p className="text-xs text-muted-foreground">{t('memory.powermemEnvEditorHint')}</p>
      <p className="text-xs">
        <a
          href={POWERMEM_ENV_EXAMPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {t('memory.powermemEnvTemplateLink')}
        </a>
        <span className="text-muted-foreground"> {t('memory.powermemEnvTemplateHint')}</span>
      </p>
      {path ? (
        <p className="font-mono text-xs break-all text-muted-foreground">
          <span className="text-muted-foreground">{t('memory.powermemEnvPathLabel')}</span> {path}
        </p>
      ) : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">{t('memory.powermemEnvLoading')}</p>
      ) : (
        <>
          {err ? <p className="text-xs text-red-500 whitespace-pre-wrap">{err}</p> : null}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="control-textarea min-h-[140px] text-xs font-mono"
            aria-label={t('memory.powermemEnvEditorTitle')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
              className="button-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {t('memory.powermemEnvReload')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving || loading}
              className="button-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {saving ? t('memory.powermemEnvSaving') : t('memory.powermemEnvSave')}
            </button>
            {savedFlash ? (
              <span className="text-xs text-green-600 dark:text-green-500">{t('memory.powermemEnvSaved')}</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function JsonPreview({ value }: { value: unknown }) {
  const text =
    value === undefined || value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2)
  return (
    <pre className="mono-note max-h-64 overflow-auto whitespace-pre-wrap">
      {text || '—'}
    </pre>
  )
}

/** OpenClaw CLI `memory` — index + search only in this panel */
function OpenclawMemoryPanel() {
  const { t } = useTranslation()
  const [ocAgent, setOcAgent] = useState('')
  const [ocQuery, setOcQuery] = useState('')
  const [ocHits, setOcHits] = useState<OpenclawMemoryHit[] | null>(null)
  const [ocSearchLoading, setOcSearchLoading] = useState(false)
  const [ocSearchErr, setOcSearchErr] = useState<string | null>(null)

  const statusFetcher = useCallback(async () => platformResults.openclawMemoryStatus(), [])
  const {
    data: ocStatus,
    loading: ocStatusLoading,
    error: ocStatusErr,
    refetch: refetchOcStatus,
  } = useAdapterCall<OpenclawMemoryStatusPayload>(statusFetcher)

  async function runOpenclawSearch() {
    const q = ocQuery.trim()
    if (!q) {
      setOcHits([])
      setOcSearchErr(null)
      return
    }
    setOcSearchLoading(true)
    setOcSearchErr(null)
    const r = await platformResults.openclawMemorySearch(q, {
      agent: ocAgent.trim() || undefined,
      maxResults: 25,
    })
    setOcSearchLoading(false)
    if (!r.success) {
      setOcHits(null)
      setOcSearchErr(r.error ?? t('memory.searchFailed'))
      return
    }
    setOcHits(r.data ?? [])
  }

  return (
    <div className="surface-card space-y-4">
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-semibold">{t('memory.sectionOpenclaw')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('memory.openclawHelp')}</p>
      </div>

      {ocStatusLoading ? (
        <p className="text-sm text-muted-foreground">{t('memory.statusLoading')}</p>
      ) : ocStatusErr ? (
        <div className="space-y-2">
          <p className="text-sm text-red-500">{ocStatusErr}</p>
          <button
            type="button"
            onClick={() => void refetchOcStatus()}
            className="button-secondary px-3 py-1.5 text-sm"
          >
            {t('memory.retry')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t('memory.openclawExit', { code: ocStatus?.exitCode ?? '—' })}
          </p>
          <JsonPreview value={ocStatus?.data} />
          {ocStatus?.stderr ? (
            <p className="text-xs text-amber-600 whitespace-pre-wrap">{ocStatus.stderr}</p>
          ) : null}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">{t('memory.openclawSearchLabel')}</label>
        <input
          type="text"
          placeholder={t('memory.agentPlaceholder')}
          value={ocAgent}
          onChange={(e) => setOcAgent(e.target.value)}
          className="control-input"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder={t('memory.openclawSearchPlaceholder')}
            value={ocQuery}
            onChange={(e) => setOcQuery(e.target.value)}
            className="control-input flex-1"
          />
          <button
            type="button"
            disabled={ocSearchLoading}
            onClick={() => void runOpenclawSearch()}
            className="button-primary shrink-0 disabled:opacity-50"
          >
            {ocSearchLoading ? t('memory.searching') : t('memory.search')}
          </button>
        </div>
      </div>

      {ocSearchErr ? <p className="text-sm text-red-500">{ocSearchErr}</p> : null}
      {ocHits && ocHits.length > 0 ? (
        <ul className="space-y-3">
          {ocHits.map((h) => (
            <li key={h.id} className="list-card bg-background/70 text-sm">
              {h.score !== undefined && Number.isFinite(h.score) ? (
                <span className="text-xs text-muted-foreground mr-2">score: {h.score.toFixed(3)}</span>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap">{h.content}</p>
              {h.path ? (
                <p className="text-xs text-muted-foreground mt-1 font-mono">{h.path}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : ocHits && ocHits.length === 0 && ocQuery.trim() ? (
        <p className="text-sm text-muted-foreground">{t('memory.noHits')}</p>
      ) : null}
    </div>
  )
}

/** PowerMem plugin — separate storage from OpenClaw native memory */
function PowermemMemoryPanel() {
  const { t } = useTranslation()
  const [pmQuery, setPmQuery] = useState('')
  const [pmSearchRows, setPmSearchRows] = useState<PowermemMemoryRow[] | null>(null)
  const [pmSearchLoading, setPmSearchLoading] = useState(false)
  const [pmSearchErr, setPmSearchErr] = useState<string | null>(null)

  const metaFetcher = useCallback(async () => platformResults.powermemMeta(), [])
  const {
    data: pmMeta,
    loading: pmMetaLoading,
    error: pmMetaErr,
    refetch: refetchPmMeta,
  } = useAdapterCall<PowermemMeta>(metaFetcher)
  const refetchPmMetaRef = useRef(refetchPmMeta)
  refetchPmMetaRef.current = refetchPmMeta

  const onBootstrapSse = useCallback((e: PowermemBootstrapClientEvent) => {
    if (e.type === 'phase') {
      setLiveBootstrapPhase(e.phase)
    } else {
      setBootstrapSseLines((prev) => [...prev.slice(-500), e.line])
    }
  }, [])

  const listFetcher = useCallback(async (): Promise<AdapterResult<PowermemMemoryRow[]>> => {
    const meta = await platformResults.powermemMeta()
    if (!meta.success || !meta.data?.configured || !meta.data.enabled) {
      return ok<PowermemMemoryRow[]>([])
    }
    const m = meta.data
    let ranManagedBootstrap = false
    if (needsManagedPowermemBootstrap(m) && !getIsTauri()) {
      ranManagedBootstrap = true
      setBootstrapSseLines([])
      setLiveBootstrapPhase(null)
      const boot = await platformResults.powermemBootstrapStream(onBootstrapSse)
      if (!boot.success) {
        return fail<PowermemMemoryRow[]>(boot.error ?? 'PowerMem bootstrap failed')
      }
    }
    const list = await platformResults.powermemList(80)
    if (list.success) {
      setBootstrapSseLines([])
      setLiveBootstrapPhase(null)
      if (ranManagedBootstrap || needsManagedPowermemBootstrap(m)) {
        void refetchPmMetaRef.current()
      }
    }
    return list
  }, [onBootstrapSse])
  const {
    data: pmList,
    loading: pmListLoading,
    error: pmListErr,
    refetch: refetchPmList,
  } = useAdapterCall<PowermemMemoryRow[]>(listFetcher)

  const pmReady = Boolean(pmMeta?.configured && pmMeta.enabled)

  const [liveBootstrapPhase, setLiveBootstrapPhase] = useState<'venv' | 'pip' | null>(null)
  const [bootstrapSseLines, setBootstrapSseLines] = useState<string[]>([])

  const powermemFirstRunBootstrap =
    pmReady &&
    pmMeta?.mode === 'cli' &&
    Boolean(pmMeta.managedRuntimeDir) &&
    !pmMeta.managedRuntimeReady &&
    !pmMeta.managedRuntimeDisabled

  async function runPowermemSearch() {
    const q = pmQuery.trim()
    setPmSearchLoading(true)
    setPmSearchErr(null)
    const r = await platformResults.powermemSearch(q, 40)
    setPmSearchLoading(false)
    if (!r.success) {
      setPmSearchRows(null)
      setPmSearchErr(r.error ?? t('memory.searchFailed'))
      return
    }
    setPmSearchRows(r.data ?? [])
  }

  async function deletePowermemRow(id: string) {
    if (!window.confirm(t('memory.confirmDelete', { id }))) return
    const r = await platformResults.powermemDelete(id)
    if (!r.success) {
      alert(r.error ?? t('memory.deleteFailed'))
      return
    }
    void refetchPmList()
    setPmSearchRows((prev) => (prev ? prev.filter((row) => row.id !== id) : prev))
  }

  return (
    <div className="surface-card space-y-4">
      <div className="border-b border-border pb-3">
        <h3 className="text-base font-semibold">{t('memory.sectionPowermem')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('memory.powermemHelp')}</p>
      </div>

      {pmMetaLoading ? (
        <p className="text-sm text-muted-foreground">{t('memory.metaLoading')}</p>
      ) : pmMetaErr ? (
        <p className="text-sm text-red-500">{pmMetaErr}</p>
      ) : pmMeta ? (
        <div className="inline-note space-y-1">
          <p>
            <span className="text-muted-foreground">{t('memory.pluginState')}:</span>{' '}
            {!pmMeta.configured
              ? t('memory.pluginNotConfigured')
              : !pmMeta.enabled
                ? t('memory.pluginDisabled')
                : t('memory.pluginReady')}
          </p>
          {pmMeta.configured ? (
            <>
              <p>
                <span className="text-muted-foreground">mode:</span> {pmMeta.mode ?? '—'}
              </p>
              <p>
                <span className="text-muted-foreground">user / agent:</span> {pmMeta.userId} / {pmMeta.agentId}
              </p>
              {pmMeta.pmemPath ? (
                <p className="font-mono text-xs break-all">
                  <span className="text-muted-foreground">pmem:</span> {pmMeta.pmemPath}
                </p>
              ) : null}
              {pmMeta.baseUrl ? (
                <p className="font-mono text-xs break-all">
                  <span className="text-muted-foreground">baseUrl:</span> {pmMeta.baseUrl}
                </p>
              ) : null}
              {pmMeta.mode === 'cli' ? (
                pmMeta.envFileResolved === POWMEM_DEFAULT_ENV_META_SENTINEL ? (
                  <p className="text-xs text-muted-foreground">{t('memory.powermemEnvDefaultHint')}</p>
                ) : pmMeta.envFileResolved ? (
                  <p className="font-mono text-xs break-all">
                    <span className="text-muted-foreground">env:</span> {pmMeta.envFileResolved}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-500">{t('memory.powermemEnvMissingHint')}</p>
                )
              ) : null}
              {pmMeta.mode === 'cli' && pmMeta.managedRuntimeDir ? (
                <div className="mt-3 pt-3 border-t border-border text-xs space-y-1">
                  <p className="font-medium text-foreground">{t('memory.managedRuntimeTitle')}</p>
                  <p className="text-muted-foreground">{t('memory.managedRuntimeBlurb')}</p>
                  <p className="font-mono break-all text-muted-foreground">{pmMeta.managedRuntimeDir}</p>
                  {pmMeta.managedRuntimeDisabled ? (
                    <p className="text-amber-600">{t('memory.managedRuntimeOff')}</p>
                  ) : pmMeta.managedRuntimeReady ? (
                    <p className="text-green-600 dark:text-green-500">{t('memory.managedRuntimeReady')}</p>
                  ) : (
                    <p className="text-muted-foreground">{t('memory.managedRuntimePending')}</p>
                  )}
                </div>
              ) : null}
              {pmReady && pmMeta.mode === 'cli' ? <PowermemEnvEditorBlock /> : null}
            </>
          ) : null}
          <div className="pt-2">
            <Link to="/plugins" className="text-primary text-sm underline">
              {t('memory.goPlugins')}
            </Link>
          </div>
        </div>
      ) : null}

      {!pmReady ? (
        <p className="text-sm text-muted-foreground">{t('memory.powermemNeedPlugin')}</p>
      ) : pmListLoading ? (
        <div className="text-sm text-muted-foreground space-y-2">
          <p>{t('memory.listLoading')}</p>
          {powermemFirstRunBootstrap ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs space-y-2">
              <p>{t('memory.listLoadingBootstrapHint')}</p>
              <p className="text-foreground font-medium">
                {liveBootstrapPhase === 'venv'
                  ? t('memory.bootstrapPhaseVenv')
                  : liveBootstrapPhase === 'pip'
                    ? t('memory.bootstrapPhasePip')
                    : t('memory.bootstrapPhaseStarting')}
              </p>
              {!getIsTauri() && bootstrapSseLines.length > 0 ? (
                <div>
                  <p className="text-muted-foreground mb-1">{t('memory.bootstrapSseLogTitle')}</p>
                  <pre className="max-h-52 overflow-auto rounded border border-border bg-background/80 p-2 text-[11px] leading-snug font-mono whitespace-pre-wrap break-all">
                    {bootstrapSseLines.join('\n')}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : pmListErr ? (
        <div className="space-y-2">
          <p className="text-sm text-red-500">{pmListErr}</p>
          <button
            type="button"
            onClick={() => void refetchPmList()}
            className="button-secondary px-3 py-1.5 text-sm"
          >
            {t('memory.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center gap-2">
            <h4 className="text-sm font-medium">{t('memory.powermemListTitle', { count: pmList?.length ?? 0 })}</h4>
            <button
              type="button"
              onClick={() => void refetchPmList()}
              className="button-secondary px-3 py-1.5 text-xs"
            >
              {t('memory.refreshList')}
            </button>
          </div>
          <ul className="space-y-3">
            {(pmList ?? []).map((row) => (
              <li
                key={row.id}
                className="list-card flex items-start justify-between gap-3 bg-background/70"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">#{row.memoryId}</p>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{row.content}</p>
                  {row.score !== undefined && Number.isFinite(row.score) ? (
                    <p className="text-xs text-muted-foreground mt-1">score: {row.score.toFixed(4)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void deletePowermemRow(row.id)}
                  className="button-danger shrink-0 px-2 py-1 text-xs"
                >
                  {t('memory.delete')}
                </button>
              </li>
            ))}
          </ul>
          {(pmList ?? []).length === 0 ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('memory.powermemEmpty')}</p>
              <p className="text-xs text-muted-foreground">{t('memory.powermemEmptyIsolationHint')}</p>
            </div>
          ) : null}
        </>
      )}

      {pmReady ? (
        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-sm font-medium">{t('memory.powermemSearchTitle')}</h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder={t('memory.powermemSearchPlaceholder')}
              value={pmQuery}
              onChange={(e) => setPmQuery(e.target.value)}
              className="control-input flex-1"
            />
            <button
              type="button"
              disabled={pmSearchLoading}
              onClick={() => void runPowermemSearch()}
              className="button-primary shrink-0 disabled:opacity-50"
            >
              {pmSearchLoading ? t('memory.searching') : t('memory.search')}
            </button>
          </div>
          {pmSearchErr ? <p className="text-sm text-red-500">{pmSearchErr}</p> : null}
          {pmSearchRows && pmSearchRows.length > 0 ? (
            <ul className="space-y-2">
              {pmSearchRows.map((row) => (
                <li key={`s-${row.id}`} className="list-card bg-background/70 p-3 text-sm">
                  <span className="text-xs text-muted-foreground">#{row.memoryId}</span>
                  <p className="mt-1 whitespace-pre-wrap">{row.content}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground pt-2">{t('memory.extensibleHint')}</p>
    </div>
  )
}

export default function MemoryPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'openclaw' | 'powermem'>('openclaw')

  return (
    <div className="page-shell page-shell-medium">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('memory.title')}</h1>
          <p className="page-subtitle">{t('memory.subtitleTabs')}</p>
        </div>
      </div>

      <div className="pill-group">
        <button
          type="button"
          onClick={() => setTab('openclaw')}
          className={`pill-button ${
            tab === 'openclaw'
              ? 'pill-button-active'
              : 'pill-button-inactive'
          }`}
        >
          {t('memory.tabOpenclaw')}
        </button>
        <button
          type="button"
          onClick={() => setTab('powermem')}
          className={`pill-button ${
            tab === 'powermem'
              ? 'pill-button-active'
              : 'pill-button-inactive'
          }`}
        >
          {t('memory.tabPowermem')}
        </button>
      </div>

      {tab === 'openclaw' ? <OpenclawMemoryPanel /> : <PowermemMemoryPanel />}
    </div>
  )
}
