import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  Boxes,
  CircleOff,
  Download,
  Globe,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Signal,
  TerminalSquare,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react'
import { platformResults } from '@/adapters'
import type { OpenClawPluginInfo } from '@/lib/types'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { LoadingState } from '@/shared/components/LoadingState'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'

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
type PluginCategory = 'providers' | 'channels' | 'tools' | 'system'

type PluginBusy =
  | { kind: 'enable'; id: string }
  | { kind: 'disable'; id: string }
  | { kind: 'install'; id: string }
  | { kind: 'uninstall'; id: string }

type PluginCategoryMeta = {
  key: PluginCategory
  icon: LucideIcon
  labelKey: string
  accentClass: string
}

type PluginGroup = PluginCategoryMeta & {
  plugins: OpenClawPluginInfo[]
  loadedCount: number
  disabledCount: number
}

const DESCRIPTION_COLLAPSE_CHARS = 96

const CHANNEL_HINTS = [
  'channel plugin',
  'bluebubbles',
  'discord',
  'feishu',
  'googlechat',
  'imessage',
  'qqbot',
  'signal',
  'slack',
  'synology',
  'telegram',
  'tlon',
  'twitch',
  'whatsapp',
  'zalo',
]

const PROVIDER_HINTS = [
  'provider',
  'amazon-bedrock',
  'anthropic',
  'byteplus',
  'chutes',
  'cloudflare-ai-gateway',
  'copilot-proxy',
  'deepseek',
  'fal',
  'github-copilot',
  'huggingface',
  'openrouter',
  'opencode',
  'qianfan',
  'sglang',
  'synthetic',
  'together',
  'venice',
  'vercel-ai-gateway',
  'vllm',
  'volcengine',
  'xai',
  'xiaomi',
  'zai',
]

const TOOL_HINTS = [
  'browser tool',
  'brave',
  'browser',
  'diff viewer',
  'diffs',
  'duckduckgo',
  'exa',
  'firecrawl',
  'google plugin',
  'searxng',
  'tavily',
]

const PLUGIN_CATEGORY_META: PluginCategoryMeta[] = [
  {
    key: 'providers',
    icon: PlugZap,
    labelKey: 'plugins.categoryProviders',
    accentClass: 'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  },
  {
    key: 'channels',
    icon: Globe,
    labelKey: 'plugins.categoryChannels',
    accentClass: 'border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300',
  },
  {
    key: 'tools',
    icon: TerminalSquare,
    labelKey: 'plugins.categoryTools',
    accentClass: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  },
  {
    key: 'system',
    icon: ShieldCheck,
    labelKey: 'plugins.categorySystem',
    accentClass: 'border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-300',
  },
]

function includesAny(haystack: string, hints: string[]): boolean {
  return hints.some((hint) => haystack.includes(hint))
}

function classifyPlugin(plugin: OpenClawPluginInfo): PluginCategory {
  const haystack = `${plugin.id} ${plugin.name} ${plugin.description ?? ''}`.toLowerCase()
  if (includesAny(haystack, CHANNEL_HINTS)) return 'channels'
  if (includesAny(haystack, PROVIDER_HINTS)) return 'providers'
  if (includesAny(haystack, TOOL_HINTS)) return 'tools'
  return 'system'
}

function pluginDisplayName(plugin: OpenClawPluginInfo): string {
  return plugin.name?.trim() || plugin.id
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) {
    return <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">—</span>
  }

  const tone = isPluginEnabled(status)
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : isPluginDisabledStatus(status)
      ? 'border-border/70 bg-background/70 text-muted-foreground'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      {status}
    </span>
  )
}

function PluginDescriptionCell({ text }: { text: string | undefined }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rawText = text?.trim() ?? ''
  if (!rawText) {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  const collapsible = rawText.length > DESCRIPTION_COLLAPSE_CHARS
  return (
    <div className="min-w-0">
      <p
        className={`text-sm text-muted-foreground break-words ${!open && collapsible ? 'line-clamp-2' : ''}`}
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

function MetricCard({
  label,
  value,
  meta,
}: {
  label: string
  value: number
  meta: string
}) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-meta">{meta}</p>
    </div>
  )
}

function CategorySpotlight({
  group,
  selected,
  onSelect,
}: {
  group: PluginGroup
  selected: boolean
  onSelect: (key: PluginCategory) => void
}) {
  const { t } = useTranslation()
  const Icon = group.icon
  const availableCount = Math.max(group.plugins.length - group.loadedCount, 0)
  const accentCard = selected ? 'border-primary/50 bg-primary/5 shadow-[0_18px_40px_rgba(233,98,36,0.12)]' : 'hover:border-primary/30'

  return (
    <button
      type="button"
      onClick={() => onSelect(group.key)}
      className={`list-card flex h-full min-h-[14rem] flex-col text-left transition-colors ${accentCard}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${group.accentClass}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-base font-semibold text-foreground">{t(group.labelKey)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('plugins.loadedSummary', { loaded: group.loadedCount, total: group.plugins.length })}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{group.loadedCount}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-left">
        <div
          className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"
          aria-label={t('plugins.metricLoaded')}
        >
          <div className="flex items-center justify-between gap-2">
            <Signal className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            <p className="text-lg font-semibold text-foreground">{group.loadedCount}</p>
          </div>
        </div>
        <div
          className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"
          aria-label={t('plugins.metricAvailable')}
        >
          <div className="flex items-center justify-between gap-2">
            <CircleOff className="h-4 w-4 text-muted-foreground" />
            <p className="text-lg font-semibold text-foreground">{availableCount}</p>
          </div>
        </div>
        <div
          className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"
          aria-label={t('plugins.metricTotal')}
        >
          <div className="flex items-center justify-between gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            <p className="text-lg font-semibold text-foreground">{group.plugins.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-end pt-5">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
            selected
              ? 'bg-foreground text-background'
              : 'border border-border/70 bg-background/70 text-muted-foreground'
          }`}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          {selected ? t('plugins.runtimeShowing') : t('plugins.runtimeOpen')}
        </span>
      </div>
    </button>
  )
}

function PluginCard({
  plugin,
  busy,
  onEnable,
  onDisable,
  onUninstall,
}: {
  plugin: OpenClawPluginInfo
  busy: PluginBusy | null
  onEnable: (id: string) => void
  onDisable: (id: string) => void
  onUninstall: (plugin: OpenClawPluginInfo) => void
}) {
  const { t } = useTranslation()
  const enabled = isPluginEnabled(plugin.status)
  const disabled = isPluginDisabledStatus(plugin.status)
  const displayName = pluginDisplayName(plugin)

  return (
    <article className="list-card flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground break-words">{displayName}</h3>
            {plugin.version && (
              <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                {plugin.version}
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{plugin.id}</p>
        </div>
        <StatusBadge status={plugin.status} />
      </div>

      <PluginDescriptionCell text={plugin.description} />

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || enabled}
          onClick={() => onEnable(plugin.id)}
          className="button-secondary px-3 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-50"
          aria-label={t('plugins.enablePlugin', { name: displayName })}
        >
          <ToggleRight className="h-3.5 w-3.5" />
          {busy?.kind === 'enable' && busy.id === plugin.id ? '…' : t('plugins.enable')}
        </button>
        <button
          type="button"
          disabled={busy !== null || disabled}
          onClick={() => onDisable(plugin.id)}
          className="button-secondary px-3 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-50"
          aria-label={t('plugins.disablePlugin', { name: displayName })}
        >
          <ToggleLeft className="h-3.5 w-3.5" />
          {busy?.kind === 'disable' && busy.id === plugin.id ? '…' : t('plugins.disable')}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onUninstall(plugin)}
          className="button-danger px-3 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-50"
          aria-label={t('plugins.uninstallPlugin', { name: displayName })}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {busy?.kind === 'uninstall' && busy.id === plugin.id
            ? t('plugins.uninstallBusy')
            : t('plugins.uninstall')}
        </button>
      </div>
    </article>
  )
}

export default function PluginsPage() {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterMode>('loaded')
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory | 'all'>('all')
  const [busy, setBusy] = useState<PluginBusy | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingUninstall, setPendingUninstall] = useState<OpenClawPluginInfo | null>(null)
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
    async (plugin: OpenClawPluginInfo) => {
      setActionError(null)
      setBusy({ kind: 'uninstall', id: plugin.id })
      const r = await platformResults.uninstallPlugin(plugin.id, {
        keepFiles: uninstallKeepFiles,
        disableLoadedFirst: isPluginEnabled(plugin.status),
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

  const baseFiltered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let list =
      statusFilter === 'all'
        ? plugins
        : statusFilter === 'disabled'
          ? plugins.filter((plugin) => isPluginDisabledStatus(plugin.status))
          : plugins.filter((plugin) => isPluginEnabled(plugin.status))

    if (q) {
      list = list.filter(
        (plugin) =>
          plugin.id.toLowerCase().includes(q) ||
          plugin.name.toLowerCase().includes(q) ||
          (plugin.status && plugin.status.toLowerCase().includes(q)) ||
          (plugin.description && plugin.description.toLowerCase().includes(q))
      )
    }

    return [...list].sort((left, right) => {
      const leftEnabled = isPluginEnabled(left.status)
      const rightEnabled = isPluginEnabled(right.status)
      if (leftEnabled !== rightEnabled) return leftEnabled ? -1 : 1
      return pluginDisplayName(left).localeCompare(pluginDisplayName(right), sortLocale)
    })
  }, [plugins, filter, sortLocale, statusFilter])

  const groupedPlugins = useMemo<PluginGroup[]>(() => {
    return PLUGIN_CATEGORY_META.map((meta) => {
      const pluginsInGroup = baseFiltered.filter((plugin) => classifyPlugin(plugin) === meta.key)
      return {
        ...meta,
        plugins: pluginsInGroup,
        loadedCount: pluginsInGroup.filter((plugin) => isPluginEnabled(plugin.status)).length,
        disabledCount: pluginsInGroup.filter((plugin) => isPluginDisabledStatus(plugin.status)).length,
      }
    }).filter((group) => group.plugins.length > 0)
  }, [baseFiltered])

  const runtimeGroups = useMemo<PluginGroup[]>(() => {
    return PLUGIN_CATEGORY_META.map((meta) => {
      const pluginsInGroup = plugins.filter((plugin) => classifyPlugin(plugin) === meta.key)
      return {
        ...meta,
        plugins: pluginsInGroup,
        loadedCount: pluginsInGroup.filter((plugin) => isPluginEnabled(plugin.status)).length,
        disabledCount: pluginsInGroup.filter((plugin) => isPluginDisabledStatus(plugin.status)).length,
      }
    }).filter((group) => group.loadedCount > 0)
  }, [plugins])

  const visibleGroups = useMemo(
    () =>
      categoryFilter === 'all'
        ? groupedPlugins
        : groupedPlugins.filter((group) => group.key === categoryFilter),
    [categoryFilter, groupedPlugins]
  )

  const spotlightGroups = useMemo(
    () =>
      runtimeGroups
        .sort((left, right) => {
          if (left.loadedCount !== right.loadedCount) return right.loadedCount - left.loadedCount
          return right.plugins.length - left.plugins.length
        }),
    [runtimeGroups]
  )

  const loadedCount = plugins.filter((plugin) => isPluginEnabled(plugin.status)).length
  const notLoadedCount = Math.max(plugins.length - loadedCount, 0)
  const channelCount = plugins.filter((plugin) => classifyPlugin(plugin) === 'channels').length

  if (error || !data) {
    if (loading && !data && !error) {
      return (
        <div className="page-shell page-shell-wide">
          <div className="page-header">
            <div className="page-header-copy">
              <h1 className="page-title">{t('plugins.title')}</h1>
              <p className="page-subtitle">{t('plugins.intro')}</p>
            </div>
            <button type="button" disabled className="button-secondary shrink-0 opacity-60">
              <RefreshCw className="h-4 w-4" />
              {t('plugins.refresh')}
            </button>
          </div>
          <div className="metric-grid">
            <MetricCard label={t('plugins.metricLoaded')} value={0} meta={t('plugins.loading')} />
            <MetricCard label={t('plugins.metricAvailable')} value={0} meta={t('plugins.loading')} />
            <MetricCard label={t('plugins.metricTotal')} value={0} meta={t('plugins.loading')} />
            <MetricCard label={t('plugins.metricChannelPlugins')} value={0} meta={t('plugins.loading')} />
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
          className="button-secondary"
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
          <p className="page-subtitle">{t('plugins.intro')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="button-secondary shrink-0"
        >
          <RefreshCw className="h-4 w-4" />
          {t('plugins.refresh')}
        </button>
      </div>

      <div className="metric-grid">
        <MetricCard
          label={t('plugins.metricLoaded')}
          value={loadedCount}
          meta={t('plugins.loadedSummary', { loaded: loadedCount, total: plugins.length })}
        />
        <MetricCard
          label={t('plugins.metricAvailable')}
          value={notLoadedCount}
          meta={t('plugins.availableSummary', { count: notLoadedCount })}
        />
        <MetricCard
          label={t('plugins.metricTotal')}
          value={plugins.length}
          meta={t('plugins.totalSummary')}
        />
        <MetricCard
          label={t('plugins.metricChannelPlugins')}
          value={channelCount}
          meta={t('plugins.channelSummary', { count: channelCount })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <section id="plugins-inventory" className="surface-card">
          <div className="dashboard-section-head">
            <div className="dashboard-section-copy">
              <p className="dashboard-section-meta">{t('plugins.liveInventoryTitle')}</p>
              <h2 className="text-xl font-semibold text-foreground">{t('plugins.loadedNow')}</h2>
              <p className="text-sm text-muted-foreground">{t('plugins.liveInventoryBody')}</p>
            </div>
          </div>

          {spotlightGroups.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-3">
              {spotlightGroups.map((group) => (
                <CategorySpotlight
                  key={group.key}
                  group={group}
                  selected={categoryFilter === group.key}
                  onSelect={(key) => setCategoryFilter((current) => (current === key ? 'all' : key))}
                />
              ))}
            </div>
          ) : (
            <div className="inline-note">{t('plugins.noMatch')}</div>
          )}
        </section>

        <section id="plugins-install" className="surface-card space-y-4">
          <div className="dashboard-section-copy">
            <p className="dashboard-section-meta">{t('plugins.managePanelTitle')}</p>
            <h2 className="text-xl font-semibold text-foreground">{t('plugins.install')}</h2>
            <p className="text-sm text-muted-foreground">{t('plugins.managePanelBody')}</p>
          </div>

          <div className="space-y-2">
            <label className="control-label" htmlFor="plugin-install-id">
              {t('plugins.installPlaceholder')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="plugin-install-id"
                type="text"
                value={installId}
                onChange={(e) => setInstallId(e.target.value)}
                placeholder={t('plugins.installPlaceholder')}
                className="control-input min-w-0 flex-1"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void runInstall()}
                className="button-primary sm:shrink-0"
              >
                <Download className="h-4 w-4" />
                {busy?.kind === 'install' && busy.id === installId.trim()
                  ? t('plugins.installBusy')
                  : t('plugins.install')}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={uninstallKeepFiles}
              onChange={(e) => setUninstallKeepFiles(e.target.checked)}
              className="rounded border-border"
            />
            {t('plugins.uninstallKeepFilesLabel')}
          </label>

          <div className="inline-note text-sm">
            {t('plugins.footerNote')}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="button-secondary px-3 py-1.5 text-xs"
            >
              {t('plugins.docs')}
            </a>
            <Link to="/config" className="button-secondary px-3 py-1.5 text-xs">
              {t('plugins.editConfig')}
            </Link>
            <Link to="/skills" className="button-secondary px-3 py-1.5 text-xs">
              {t('plugins.gotoSkills')}
            </Link>
          </div>
        </section>
      </div>

      <section id="plugins-groups" className="surface-card space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="toolbar-group">
            <label className="flex-1 min-w-[14rem]">
              <span className="control-label">{t('common.search')}</span>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder={t('plugins.filterPlaceholder')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="control-input pl-9"
                />
              </div>
            </label>

            <label className="w-full min-w-[12rem] sm:w-auto">
              <span className="control-label">{t('plugins.statusLabel')}</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilterMode)}
                className="control-select mt-2"
                aria-label={t('plugins.statusFilterAria')}
              >
                {statusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <p className="control-label">{t('plugins.categoryLabel')}</p>
          <div className="pill-group">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`pill-button ${categoryFilter === 'all' ? 'pill-button-active' : 'pill-button-inactive'}`}
            >
              {t('plugins.categoryAll')}
            </button>
            {groupedPlugins.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setCategoryFilter(group.key)}
                className={`pill-button ${categoryFilter === group.key ? 'pill-button-active' : 'pill-button-inactive'}`}
              >
                {t(group.labelKey)} ({group.plugins.length})
              </button>
            ))}
          </div>
        </div>
      </section>

      {actionError && (
        <p className="text-sm text-red-500" role="alert">
          {actionError}
        </p>
      )}

      {plugins.length > 0 && visibleGroups.length === 0 && (
        <div className="state-panel">
          <p className="text-sm text-muted-foreground">{t('plugins.noMatch')}</p>
        </div>
      )}

      {plugins.length > 0 && visibleGroups.length > 0 && (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const Icon = group.icon
            return (
              <section key={group.key} className="surface-card space-y-4">
                <div className="dashboard-section-head">
                  <div className="dashboard-section-copy">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${group.accentClass}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="dashboard-section-meta">{t('plugins.inventoryTitle')}</p>
                        <h2 className="text-xl font-semibold text-foreground">{t(group.labelKey)}</h2>
                      </div>
                    </div>
                  </div>

                  <div className="channel-page-card-meta">
                    <span>{t('plugins.metricLoaded')}: {group.loadedCount}</span>
                    <span>{t('plugins.metricAvailable')}: {Math.max(group.plugins.length - group.loadedCount, 0)}</span>
                    <span>{t('plugins.metricTotal')}: {group.plugins.length}</span>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  {group.plugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin}
                      busy={busy}
                      onEnable={(id) => void runSetEnabled(id, true)}
                      onDisable={(id) => void runSetEnabled(id, false)}
                      onUninstall={(item) => setPendingUninstall(item)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
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
      <ConfirmDialog
        open={Boolean(pendingUninstall)}
        title={
          pendingUninstall
            ? t('plugins.uninstallConfirm', {
                id: pendingUninstall.id,
                name: pluginDisplayName(pendingUninstall),
              })
            : ''
        }
        tone="danger"
        onCancel={() => setPendingUninstall(null)}
        onConfirm={() => {
          if (!pendingUninstall) return
          const plugin = pendingUninstall
          setPendingUninstall(null)
          void runUninstall(plugin)
        }}
      />
    </div>
  )
}
