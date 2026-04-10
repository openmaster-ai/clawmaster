import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Boxes,
  Brain,
  Database,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { platformResults } from '@/adapters'
import type { SkillInfo } from '@/lib/types'
import { FEATURED_MCP_SERVERS } from '@/modules/mcp/catalog'
import { FEATURED_SKILLS } from '@/modules/skills/catalog'
import { getMcpServers } from '@/shared/adapters/mcp'
import {
  getEnabledMcpCount,
  getEnabledPluginCount,
  getEnabledSkillCount,
  getInstalledMcpCount,
  getReadySkillCount,
  isPluginEnabledStatus,
} from '@/shared/capabilitySummary'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'

type CapabilityScenarioTone = 'ready' | 'attention' | 'loading'

export default function CapabilitiesPage() {
  const { t } = useTranslation()

  const fetchPlugins = useCallback(async () => platformResults.listPlugins(), [])
  const fetchSkills = useCallback(async () => platformResults.getSkills(), [])
  const fetchMcp = useCallback(async () => getMcpServers(), [])

  const {
    data: pluginsPayload,
    loading: pluginsLoading,
    error: pluginsError,
    refetch: refetchPlugins,
  } = useAdapterCall(fetchPlugins)
  const {
    data: skills,
    loading: skillsLoading,
    error: skillsError,
    refetch: refetchSkills,
  } = useAdapterCall(fetchSkills)
  const {
    data: mcpServers,
    loading: mcpLoading,
    error: mcpError,
    refetch: refetchMcp,
  } = useAdapterCall(fetchMcp)

  const loading = pluginsLoading || skillsLoading || mcpLoading
  const skillList = skills ?? []
  const pluginList = pluginsPayload?.plugins ?? []
  const mcpMap = mcpServers ?? {}

  const installedMcpCount = getInstalledMcpCount(mcpMap)
  const enabledMcpCount = getEnabledMcpCount(mcpMap)
  const installedPluginCount = pluginList.length
  const enabledPluginCount = getEnabledPluginCount(pluginsPayload)
  const installedSkillCount = skillList.length
  const enabledSkillCount = getEnabledSkillCount(skillList)
  const readySkillCount = getReadySkillCount(skillList)
  const activeCapabilityCount = enabledMcpCount + enabledPluginCount + enabledSkillCount
  const attentionCount = [enabledMcpCount === 0, enabledPluginCount === 0, enabledSkillCount === 0].filter(Boolean).length
  const runtimeSurfaceCount = [installedMcpCount > 0, installedPluginCount > 0, installedSkillCount > 0].filter(Boolean).length

  const loadErrors = [pluginsError, skillsError, mcpError].filter(Boolean)

  const activeMcpIds = useMemo(
    () =>
      Object.entries(mcpMap)
        .filter(([, server]) => server.enabled !== false)
        .map(([id]) => id)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 4),
    [mcpMap],
  )
  const activePluginNames = useMemo(
    () =>
      pluginList
        .filter((plugin) => isPluginEnabledStatus(plugin.status))
        .map((plugin) => plugin.name?.trim() || plugin.id)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 4),
    [pluginList],
  )
  const activeSkillNames = useMemo(
    () =>
      skillList
        .filter((skill) => skill.disabled !== true)
        .map((skill) => displaySkillName(skill))
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 4),
    [skillList],
  )

  async function refreshAll() {
    await Promise.all([refetchPlugins(), refetchSkills(), refetchMcp()])
  }

  const scenarios = [
    {
      id: 'capability-connect-data',
      icon: Network,
      tone: loading ? 'loading' : enabledMcpCount > 0 ? 'ready' : 'attention',
      panelClass: 'border-sky-500/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.10),rgba(255,255,255,0)_58%)]',
      title: t('capabilities.connect.title'),
      description: t('capabilities.connect.description'),
      stat: t('capabilities.connect.stat', { enabled: enabledMcpCount, total: installedMcpCount }),
      items: activeMcpIds.length > 0 ? activeMcpIds : FEATURED_MCP_SERVERS.slice(0, 4).map((server) => server.name),
      itemsLabel: activeMcpIds.length > 0 ? t('capabilities.activeNow') : t('capabilities.featuredStarts'),
      ctaTo: '/mcp#mcp-import',
      ctaLabel: t('capabilities.connect.cta'),
      detailTo: '/mcp',
      detailLabel: t('capabilities.detail.openMcp'),
    },
    {
      id: 'capability-automation',
      icon: Boxes,
      tone: loading ? 'loading' : enabledPluginCount > 0 ? 'ready' : 'attention',
      panelClass: 'border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(255,255,255,0)_58%)]',
      title: t('capabilities.automation.title'),
      description: t('capabilities.automation.description'),
      stat: t('capabilities.automation.stat', { enabled: enabledPluginCount, total: installedPluginCount }),
      items: activePluginNames.length > 0
        ? activePluginNames
        : [
            t('capabilities.automation.itemProviders'),
            t('capabilities.automation.itemChannels'),
            t('capabilities.automation.itemTools'),
          ],
      itemsLabel: activePluginNames.length > 0 ? t('capabilities.activeNow') : t('capabilities.runtimeCoverage'),
      ctaTo: '/plugins#plugins-groups',
      ctaLabel: t('capabilities.automation.cta'),
      detailTo: '/plugins',
      detailLabel: t('capabilities.detail.openPlugins'),
    },
    {
      id: 'capability-enhance',
      icon: Brain,
      tone: loading ? 'loading' : enabledSkillCount > 0 ? 'ready' : 'attention',
      panelClass: 'border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(255,255,255,0)_58%)]',
      title: t('capabilities.enhance.title'),
      description: t('capabilities.enhance.description'),
      stat: t('capabilities.enhance.stat', { enabled: enabledSkillCount, ready: readySkillCount }),
      items: activeSkillNames.length > 0 ? activeSkillNames : FEATURED_SKILLS.slice(0, 4).map((skill) => skill.skillKey ?? skill.name),
      itemsLabel: activeSkillNames.length > 0 ? t('capabilities.activeNow') : t('capabilities.featuredStarts'),
      ctaTo: '/skills#skills-featured',
      ctaLabel: t('capabilities.enhance.cta'),
      detailTo: '/skills',
      detailLabel: t('capabilities.detail.openSkills'),
    },
    {
      id: 'capability-status',
      icon: ShieldCheck,
      tone: loading ? 'loading' : activeCapabilityCount > 0 ? 'ready' : 'attention',
      panelClass: 'border-violet-500/20 bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(255,255,255,0)_58%)]',
      title: t('capabilities.verify.title'),
      description: t('capabilities.verify.description'),
      stat: t('capabilities.verify.stat', { total: activeCapabilityCount, systems: runtimeSurfaceCount }),
      items: [
        t('capabilities.verify.itemMcp', { count: enabledMcpCount }),
        t('capabilities.verify.itemPlugins', { count: enabledPluginCount }),
        t('capabilities.verify.itemSkills', { count: enabledSkillCount }),
      ],
      itemsLabel: t('capabilities.runtimeSnapshot'),
      ctaTo: '/capabilities#capability-runtime',
      ctaLabel: t('capabilities.verify.cta'),
      detailTo: '/settings#settings-logs',
      detailLabel: t('logs.moreDiagnostics'),
    },
  ] satisfies ScenarioCardProps[]

  return (
    <div id="capability-overview" className="page-shell page-shell-wide">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('capabilities.kicker')}</span>
            <span>{t('capabilities.headerActive', { count: activeCapabilityCount })}</span>
            <span>{t('capabilities.headerAttention', { count: attentionCount })}</span>
          </div>
          <h1 className="page-title">{t('capabilities.title')}</h1>
          <p className="page-subtitle">{t('capabilities.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/capabilities#capability-runtime" className="button-primary">
            <ShieldCheck className="h-4 w-4" />
            {t('capabilities.verify.cta')}
          </Link>
          <button type="button" onClick={() => void refreshAll()} className="button-secondary" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {loadErrors.length > 0 ? (
        <div role="alert" className="surface-card border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-200">
          {t('capabilities.partialData', { count: loadErrors.length })}
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricCard
          label={t('capabilities.metrics.active')}
          value={String(activeCapabilityCount)}
          meta={t('capabilities.metrics.activeMeta')}
          loading={loading}
        />
        <MetricCard
          label={t('capabilities.metrics.attention')}
          value={String(attentionCount)}
          meta={t('capabilities.metrics.attentionMeta')}
          loading={loading}
        />
        <MetricCard
          label={t('capabilities.metrics.runtime')}
          value={String(runtimeSurfaceCount)}
          meta={t('capabilities.metrics.runtimeMeta')}
          loading={loading}
        />
        <MetricCard
          label={t('capabilities.metrics.ready')}
          value={String(readySkillCount)}
          meta={t('capabilities.metrics.readyMeta')}
          loading={loading}
        />
      </div>

      <section id="capability-scenarios" className="surface-card space-y-5">
        <div className="dashboard-section-head">
          <div className="dashboard-section-copy">
            <p className="dashboard-section-meta">{t('capabilities.sectionScenariosKicker')}</p>
            <h2 className="section-title">{t('capabilities.sectionScenariosTitle')}</h2>
            <p className="section-subtitle">{t('capabilities.sectionScenariosDesc')}</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              {...scenario}
              readyLabel={t('dashboard.task.statusReady')}
              attentionLabel={t('dashboard.task.statusAttention')}
            />
          ))}
        </div>
      </section>

      <section id="capability-runtime" className="surface-card space-y-5">
        <div className="dashboard-section-head">
          <div className="dashboard-section-copy">
            <p className="dashboard-section-meta">{t('capabilities.sectionStatusKicker')}</p>
            <h2 className="section-title">{t('capabilities.sectionStatusTitle')}</h2>
            <p className="section-subtitle">{t('capabilities.sectionStatusDesc')}</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="rounded-[1.6rem] border border-border/70 bg-[linear-gradient(135deg,rgba(249,115,22,0.10),rgba(255,255,255,0)_58%)] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                <Sparkles className="h-5 w-5 text-foreground" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[1.1rem] font-semibold tracking-tight text-foreground">{t('capabilities.runtimeTitle')}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('capabilities.runtimeDesc')}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <RuntimePill label={t('nav.mcp')} value={String(enabledMcpCount)} loading={loading} />
              <RuntimePill label={t('nav.plugins')} value={String(enabledPluginCount)} loading={loading} />
              <RuntimePill label={t('nav.skills')} value={String(enabledSkillCount)} loading={loading} />
            </div>
            <div className="mt-5 space-y-3">
              <SignalStrip
                title={t('nav.mcp')}
                items={activeMcpIds}
                fallback={FEATURED_MCP_SERVERS.slice(0, 3).map((server) => server.name)}
                loading={loading}
                activeLabel={t('capabilities.activeNow')}
                fallbackLabel={t('capabilities.featuredStarts')}
              />
              <SignalStrip
                title={t('nav.plugins')}
                items={activePluginNames}
                fallback={[]}
                loading={loading}
                activeLabel={t('capabilities.activeNow')}
                fallbackLabel={t('capabilities.runtimeCoverage')}
              />
              <SignalStrip
                title={t('nav.skills')}
                items={activeSkillNames}
                fallback={FEATURED_SKILLS.slice(0, 3).map((skill) => skill.skillKey ?? skill.name)}
                loading={loading}
                activeLabel={t('capabilities.activeNow')}
                fallbackLabel={t('capabilities.featuredStarts')}
              />
            </div>
          </div>

          <div className="grid gap-4">
            <DetailCard
              icon={Database}
              title={t('nav.mcp')}
              description={t('capabilities.detailMcpDesc')}
              summary={t('capabilities.detailMcpSummary', { enabled: enabledMcpCount, total: installedMcpCount })}
              to="/mcp"
              cta={t('capabilities.detail.openMcp')}
              loading={loading}
            />
            <DetailCard
              icon={Wrench}
              title={t('nav.plugins')}
              description={t('capabilities.detailPluginsDesc')}
              summary={t('capabilities.detailPluginsSummary', { enabled: enabledPluginCount, total: installedPluginCount })}
              to="/plugins"
              cta={t('capabilities.detail.openPlugins')}
              loading={loading}
            />
            <DetailCard
              icon={Brain}
              title={t('nav.skills')}
              description={t('capabilities.detailSkillsDesc')}
              summary={t('capabilities.detailSkillsSummary', { enabled: enabledSkillCount, ready: readySkillCount })}
              to="/skills"
              cta={t('capabilities.detail.openSkills')}
              loading={loading}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function displaySkillName(skill: SkillInfo): string {
  return skill.skillKey?.trim() || skill.name.trim() || trailingSlugToken(skill.slug)
}

function trailingSlugToken(slug: string): string {
  const parts = slug.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? slug
}

function MetricCard({
  label,
  value,
  meta,
  loading,
}: {
  label: string
  value: string
  meta: string
  loading: boolean
}) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">
        {loading ? <span className="block h-8 w-16 animate-pulse rounded-xl bg-primary/10" /> : value}
      </p>
      <p className="metric-meta">{loading ? <span className="block h-4 w-32 animate-pulse rounded-md bg-primary/10" /> : meta}</p>
    </div>
  )
}

interface ScenarioCardProps {
  id: string
  icon: LucideIcon
  tone: CapabilityScenarioTone
  panelClass: string
  title: string
  description: string
  stat: string
  items: string[]
  itemsLabel: string
  ctaTo: string
  ctaLabel: string
  detailTo: string
  detailLabel: string
  readyLabel?: string
  attentionLabel?: string
}

function ScenarioCard({
  id,
  icon: Icon,
  tone,
  panelClass,
  title,
  description,
  stat,
  items,
  itemsLabel,
  ctaTo,
  ctaLabel,
  detailTo,
  detailLabel,
  readyLabel = 'Ready',
  attentionLabel = 'Needs attention',
}: ScenarioCardProps) {
  return (
    <section id={id} className={`rounded-[1.6rem] border p-5 shadow-sm ${panelClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/90">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[1.08rem] font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <ScenarioToneBadge tone={tone} readyLabel={readyLabel} attentionLabel={attentionLabel} />
      </div>
      <div className="mt-4 rounded-[1.2rem] border border-border/70 bg-background/80 px-4 py-3 text-sm font-medium text-foreground">
        {tone === 'loading' ? <span className="block h-5 w-40 animate-pulse rounded-md bg-primary/10" /> : stat}
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{itemsLabel}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tone === 'loading'
            ? Array.from({ length: 3 }).map((_, index) => (
                <span key={index} className="block h-7 w-24 animate-pulse rounded-full bg-primary/10" />
              ))
            : items.map((item) => (
                <span key={item} className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {item}
                </span>
              ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={ctaTo} className="button-primary">
          {ctaLabel}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
        <Link to={detailTo} className="button-secondary">
          {detailLabel}
        </Link>
      </div>
    </section>
  )
}

function ScenarioToneBadge({
  tone,
  readyLabel,
  attentionLabel,
}: {
  tone: CapabilityScenarioTone
  readyLabel: string
  attentionLabel: string
}) {
  if (tone === 'loading') {
    return (
      <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    )
  }

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        tone === 'ready'
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      }`}
    >
      {tone === 'ready' ? readyLabel : attentionLabel}
    </span>
  )
}

function RuntimePill({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">
        {loading ? <span className="block h-8 w-12 animate-pulse rounded-md bg-primary/10" /> : value}
      </p>
    </div>
  )
}

function SignalStrip({
  title,
  items,
  fallback,
  loading,
  activeLabel,
  fallbackLabel,
}: {
  title: string
  items: string[]
  fallback: string[]
  loading: boolean
  activeLabel: string
  fallbackLabel: string
}) {
  const values = items.length > 0 ? items : fallback

  return (
    <div className="rounded-[1.2rem] border border-border/70 bg-background/80 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className="text-xs text-muted-foreground">{items.length > 0 ? activeLabel : fallbackLabel}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {loading
          ? Array.from({ length: 2 }).map((_, index) => (
              <span key={index} className="block h-7 w-24 animate-pulse rounded-full bg-primary/10" />
            ))
          : values.map((item) => (
              <span key={item} className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                {item}
              </span>
            ))}
      </div>
    </div>
  )
}

function DetailCard({
  icon: Icon,
  title,
  description,
  summary,
  to,
  cta,
  loading,
}: {
  icon: LucideIcon
  title: string
  description: string
  summary: string
  to: string
  cta: string
  loading: boolean
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-muted/25 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">
        {loading ? <span className="block h-5 w-40 animate-pulse rounded-md bg-primary/10" /> : summary}
      </p>
      <Link to={to} className="button-secondary mt-4">
        {cta}
      </Link>
    </div>
  )
}
