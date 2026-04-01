import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { platformResults } from '@/adapters'
import type { OpenClawPluginInfo } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'

/** Typical CLI values: enabled / loaded / disabled, etc. */
function isPluginEnabled(status?: string): boolean {
  const s = status?.trim().toLowerCase() ?? ''
  if (!s) return false
  if (/\bdisabled\b/.test(s) || /\boff\b/.test(s)) return false
  if (/\benabled\b/.test(s) || /\bactive\b/.test(s) || /\bloaded\b/.test(s)) return true
  return false
}

/** Matches CLI “Plugins (n/m loaded)” semantics: disabled rows are not counted as loaded */
function isPluginDisabledStatus(status?: string): boolean {
  const s = status?.trim().toLowerCase() ?? ''
  return /\bdisabled\b/.test(s) || /\boff\b/.test(s)
}

type StatusFilterMode = 'loaded' | 'all' | 'disabled'

const DESCRIPTION_COLLAPSE_CHARS = 96

function PluginDescriptionCell({ text }: { text: string | undefined }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rawText = text?.trim() ?? ''
  if (!rawText) {
    return <span className="text-muted-foreground">—</span>
  }
  const collapsible = rawText.length > DESCRIPTION_COLLAPSE_CHARS
  return (
    <div className="min-w-0 max-w-md">
      <p
        className={`text-muted-foreground break-words ${!open && collapsible ? 'line-clamp-2' : ''}`}
      >
        {rawText}
      </p>
      {collapsible && (
        <button
          type="button"
          className="mt-1 text-xs text-primary hover:underline"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t('plugins.collapse') : t('plugins.expand')}
        </button>
      )}
    </div>
  )
}

export default function PluginsPage() {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterMode>('loaded')
  const [busy, setBusy] = useState<{ id: string; enabling: boolean } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [installId, setInstallId] = useState('')

  const statusFilterOptions = useMemo(
    () =>
      [
        { value: 'loaded' as const, label: t('plugins.filterLoaded') },
        { value: 'all' as const, label: t('plugins.filterAll') },
        { value: 'disabled' as const, label: t('plugins.filterDisabled') },
      ] as const,
    [t]
  )

  const fetcher = useCallback(async () => platformResults.listPlugins(), [])
  const { data, loading, error, refetch } = useAdapterCall(fetcher)

  const runSetEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      setActionError(null)
      setBusy({ id, enabling: enabled })
      const r = await platformResults.setPluginEnabled(id, enabled)
      setBusy(null)
      if (!r.success) {
        setActionError(r.error ?? t('plugins.opFailed'))
        return
      }
      void refetch()
    },
    [refetch, t]
  )

  const runInstall = useCallback(async () => {
    const id = installId.trim()
    if (!id) {
      setActionError(t('plugins.idRequired'))
      return
    }
    setActionError(null)
    setBusy({ id, enabling: true })
    const r = await platformResults.installPlugin(id)
    setBusy(null)
    if (!r.success) {
      setActionError(r.error ?? t('plugins.installFailed'))
      return
    }
    setInstallId('')
    void refetch()
  }, [installId, refetch, t])

  const plugins = data?.plugins ?? []
  const rawCliOutput = data?.rawCliOutput

  const sortLocale = i18n.language === 'zh' ? 'zh-Hans-CN' : i18n.language === 'ja' ? 'ja' : 'en'

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list =
      statusFilter === 'all'
        ? plugins
        : statusFilter === 'disabled'
          ? plugins.filter((p) => isPluginDisabledStatus(p.status))
          : plugins.filter((p) => !isPluginDisabledStatus(p.status))

    if (q) {
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.status && p.status.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      )
    }

    list = [...list].sort((a, b) => {
      const ae = isPluginEnabled(a.status)
      const be = isPluginEnabled(b.status)
      if (ae !== be) return ae ? -1 : 1
      return (a.name || a.id).localeCompare(b.name || b.id, sortLocale)
    })
    return list
  }, [plugins, filter, statusFilter, sortLocale])

  if (loading) {
    return <LoadingState message={t('plugins.loading')} />
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-500">
          {t('plugins.loadFailed')}
          {error ?? t('common.unknownError')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="px-3 py-1.5 border border-border rounded text-sm"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('plugins.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t('plugins.intro')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent shrink-0"
        >
          {t('plugins.refresh')}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="search"
          placeholder={t('plugins.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:max-w-md px-3 py-2 rounded border border-border bg-background text-sm"
        />
        <label className="flex items-center gap-2 text-sm shrink-0">
          <span className="text-muted-foreground whitespace-nowrap">{t('plugins.statusLabel')}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilterMode)}
            className="px-3 py-2 rounded border border-border bg-background text-sm min-w-[7.5rem]"
            aria-label={t('plugins.statusFilterAria')}
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={installId}
            onChange={(e) => setInstallId(e.target.value)}
            placeholder={t('plugins.installPlaceholder')}
            className="px-3 py-2 rounded border border-border bg-background text-sm min-w-[16rem]"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runInstall()}
            className="px-3 py-2 text-sm border border-border rounded hover:bg-accent disabled:opacity-50"
          >
            {busy?.id === installId.trim() ? t('plugins.installBusy') : t('plugins.install')}
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-500" role="alert">
          {actionError}
        </p>
      )}

      {plugins.length > 0 && (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm table-fixed min-w-[640px]">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium w-[20%]">{t('plugins.thNameId')}</th>
                <th className="px-4 py-2 font-medium w-[22%] min-w-[11rem]">{t('plugins.thStatus')}</th>
                <th className="px-4 py-2 font-medium w-[10%]">{t('plugins.thVersion')}</th>
                <th className="px-4 py-2 font-medium">{t('plugins.thDescription')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: OpenClawPluginInfo) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30 align-top">
                  <td className="px-4 py-2 font-mono text-xs">
                    <div className="font-semibold text-foreground break-words">{p.name}</div>
                    <div className="text-muted-foreground break-all">{p.id}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-2 min-w-0">
                      {p.status ? (
                        <span
                          className={
                            isPluginEnabled(p.status)
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium break-words'
                              : 'text-muted-foreground break-words'
                          }
                        >
                          {p.status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busy !== null || isPluginEnabled(p.status)}
                          onClick={() => void runSetEnabled(p.id, true)}
                          className="px-2 py-0.5 text-xs rounded border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {busy?.id === p.id && busy.enabling ? '…' : t('plugins.enable')}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null || isPluginDisabledStatus(p.status)}
                          onClick={() => void runSetEnabled(p.id, false)}
                          className="px-2 py-0.5 text-xs rounded border border-border bg-background hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {busy?.id === p.id && !busy.enabling ? '…' : t('plugins.disable')}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {p.version ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <PluginDescriptionCell text={p.description} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground text-sm">{t('plugins.noMatch')}</p>
          )}
        </div>
      )}

      {plugins.length === 0 && rawCliOutput && (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground mb-2">{t('plugins.rawCliTitle')}</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-96 overflow-auto">
            {rawCliOutput}
          </pre>
        </div>
      )}

      {plugins.length === 0 && !rawCliOutput && (
        <p className="text-sm text-muted-foreground">{t('plugins.emptyList')}</p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <p className="text-muted-foreground w-full">{t('plugins.footerNote')}</p>
        <a
          href="https://docs.openclaw.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="px-px text-primary underline"
        >
          {t('plugins.docs')}
        </a>
        <Link to="/config" className="text-primary underline">
          {t('plugins.editConfig')}
        </Link>
        <Link to="/skills" className="text-primary underline">
          {t('plugins.gotoSkills')}
        </Link>
      </div>
    </div>
  )
}
