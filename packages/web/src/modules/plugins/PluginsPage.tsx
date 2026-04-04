import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { platformResults } from '@/adapters'
import type { OpenClawPluginInfo } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { LoadingState } from '@/shared/components/LoadingState'

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

type PluginBusy =
  | { kind: 'enable'; id: string }
  | { kind: 'disable'; id: string }
  | { kind: 'install'; id: string }
  | { kind: 'uninstall'; id: string }

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
    <div className="min-w-0">
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
  const [busy, setBusy] = useState<PluginBusy | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [installId, setInstallId] = useState('')
  const [uninstallKeepFiles, setUninstallKeepFiles] = useState(false)

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
      setBusy({ kind: enabled ? 'enable' : 'disable', id })
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
    setBusy({ kind: 'install', id })
    const r = await platformResults.installPlugin(id)
    setBusy(null)
    if (!r.success) {
      setActionError(r.error ?? t('plugins.installFailed'))
      return
    }
    setInstallId('')
    void refetch()
  }, [installId, refetch, t])

  const runUninstall = useCallback(
    async (p: OpenClawPluginInfo) => {
      if (
        !window.confirm(
          t('plugins.uninstallConfirm', { id: p.id, name: p.name?.trim() || p.id })
        )
      ) {
        return
      }
      setActionError(null)
      setBusy({ kind: 'uninstall', id: p.id })
      const r = await platformResults.uninstallPlugin(p.id, {
        keepFiles: uninstallKeepFiles,
        disableLoadedFirst: isPluginEnabled(p.status),
      })
      setBusy(null)
      if (!r.success) {
        setActionError(r.error ?? t('plugins.uninstallFailed'))
        return
      }
      void refetch()
    },
    [refetch, t, uninstallKeepFiles]
  )

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

  if (error || !data) {
    if (loading && !data && !error) {
      return (
        <div className="page-shell page-shell-wide">
          <div className="page-header">
            <div className="page-header-copy">
              <h1 className="page-title">{t('plugins.title')}</h1>
              <p className="page-subtitle">{t('plugins.intro')}</p>
            </div>
            <button
              type="button"
              disabled
              className="button-secondary shrink-0 opacity-60"
            >
              {t('plugins.refresh')}
            </button>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <input
              type="search"
              placeholder={t('plugins.filterPlaceholder')}
              disabled
              className="w-full xl:flex-[1_1_18rem] px-3 py-2 rounded border border-border bg-background text-sm opacity-60"
            />
            <label className="flex flex-wrap items-center gap-2 text-sm shrink-0 opacity-60">
              <span className="text-muted-foreground whitespace-nowrap">{t('plugins.statusLabel')}</span>
              <select
                disabled
                className="w-full sm:w-auto px-3 py-2 rounded border border-border bg-background text-sm"
              >
                {statusFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="state-panel">
            <LoadingState message={t('plugins.loading')} fullPage={false} />
          </div>
        </div>
      )
    }
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
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('plugins.title')}</h1>
          <p className="page-subtitle">
            {t('plugins.intro')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="button-secondary shrink-0"
        >
          {t('plugins.refresh')}
        </button>
      </div>

      <div className="toolbar-card xl:items-start xl:justify-between">
        <input
          type="search"
          placeholder={t('plugins.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="control-input w-full xl:flex-[1_1_18rem]"
        />
        <label className="flex flex-wrap items-center gap-2 text-sm shrink-0">
          <span className="text-muted-foreground whitespace-nowrap">{t('plugins.statusLabel')}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilterMode)}
            className="control-select w-full sm:w-auto"
            aria-label={t('plugins.statusFilterAria')}
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:flex-[1_1_24rem] xl:justify-end">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={installId}
              onChange={(e) => setInstallId(e.target.value)}
              placeholder={t('plugins.installPlaceholder')}
              className="control-input w-full min-w-0"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runInstall()}
              className="button-secondary disabled:opacity-50"
            >
              {busy?.kind === 'install' && busy.id === installId.trim()
                ? t('plugins.installBusy')
                : t('plugins.install')}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={uninstallKeepFiles}
              onChange={(e) => setUninstallKeepFiles(e.target.checked)}
              className="rounded border-border"
            />
            {t('plugins.uninstallKeepFilesLabel')}
          </label>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-500" role="alert">
          {actionError}
        </p>
      )}

      {plugins.length > 0 && (
        <div className="table-frame overflow-x-auto">
          <table className="min-w-full table-auto text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{t('plugins.thNameId')}</th>
                <th className="px-4 py-2 font-medium">{t('plugins.thStatus')}</th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">{t('plugins.thVersion')}</th>
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
                          className="button-secondary px-2 py-0.5 text-xs disabled:pointer-events-none disabled:opacity-50"
                        >
                          {busy?.kind === 'enable' && busy.id === p.id ? '…' : t('plugins.enable')}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null || isPluginDisabledStatus(p.status)}
                          onClick={() => void runSetEnabled(p.id, false)}
                          className="button-secondary px-2 py-0.5 text-xs disabled:pointer-events-none disabled:opacity-50"
                        >
                          {busy?.kind === 'disable' && busy.id === p.id ? '…' : t('plugins.disable')}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void runUninstall(p)}
                          className="button-danger px-2 py-0.5 text-xs disabled:pointer-events-none disabled:opacity-50"
                        >
                          {busy?.kind === 'uninstall' && busy.id === p.id
                            ? t('plugins.uninstallBusy')
                            : t('plugins.uninstall')}
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
