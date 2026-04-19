import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Compass,
  Database,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  ToggleLeft,
  ToggleRight,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { SkillGuardScanResult, SkillInfo } from '@/lib/types'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { InstallTask } from '@/shared/components/InstallTask'
import { LoadingState } from '@/shared/components/LoadingState'
import {
  getClawhubCliStatusResult,
  getSkillsResult,
  installClawhubCliResult,
  installSkillResult,
  scanInstalledSkillResult,
  setSkillEnabledResult,
} from '@/shared/adapters/clawhub'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import {
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  FEATURED_SKILLS,
  SKILL_CATALOG,
  type CatalogSkill,
  type SkillCategory,
} from './catalog'

const FEATURED_ICON_MAP: Record<string, LucideIcon> = {
  'content-draft': FileText,
  'self-improving-agent': Brain,
  'find-skills-skill': Compass,
  'openclaw-memory-pro-system': Database,
  'clawvet': ShieldCheck,
}

const FEATURED_TONES: Record<string, string> = {
  'content-draft': 'border-rose-500/20 bg-rose-500/5',
  'self-improving-agent': 'border-amber-500/20 bg-amber-500/5',
  'find-skills-skill': 'border-sky-500/20 bg-sky-500/5',
  'openclaw-memory-pro-system': 'border-emerald-500/20 bg-emerald-500/5',
  'clawvet': 'border-violet-500/20 bg-violet-500/5',
}

function normalizeSkillToken(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase()
}

function trailingSlugToken(slug: string): string {
  const parts = slug.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? slug
}

function catalogAliases(skill: CatalogSkill): string[] {
  const tokens = new Set<string>()
  tokens.add(normalizeSkillToken(skill.slug))
  tokens.add(normalizeSkillToken(skill.skillKey))
  tokens.add(normalizeSkillToken(skill.name))
  tokens.add(normalizeSkillToken(trailingSlugToken(skill.slug)))
  return [...tokens].filter(Boolean)
}

function catalogInstallAliases(skill: CatalogSkill): string[] {
  const tokens = new Set<string>()
  tokens.add(normalizeSkillToken(skill.slug))
  tokens.add(normalizeSkillToken(trailingSlugToken(skill.slug)))
  return [...tokens].filter(Boolean)
}

function installedAliases(skill: SkillInfo): string[] {
  const tokens = new Set<string>()
  tokens.add(normalizeSkillToken(skill.slug))
  tokens.add(normalizeSkillToken(skill.skillKey))
  tokens.add(normalizeSkillToken(skill.name))
  tokens.add(normalizeSkillToken(trailingSlugToken(skill.slug)))
  return [...tokens].filter(Boolean)
}

function skillConfigKey(skill: SkillInfo): string {
  return skill.skillKey?.trim() || skill.name.trim() || skill.slug.trim()
}

function catalogDisplayId(skill: CatalogSkill): string {
  return skill.skillKey?.trim() || trailingSlugToken(skill.slug)
}

function compareById(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

function isSkillEnabled(skill: SkillInfo): boolean {
  return skill.disabled !== true
}

function isSkillReady(skill: SkillInfo): boolean {
  return skill.eligible !== false
}

function sourceLabelKey(skill: SkillInfo): string {
  if (skill.bundled) return 'skills.sourceBundled'
  const source = (skill.source ?? '').toLowerCase()
  if (source.includes('clawhub') || source.includes('managed')) return 'skills.sourceClawHub'
  return 'skills.sourceCustom'
}

function catalogInstallSource(catalog: CatalogSkill): 'registry' | 'bundled' {
  return catalog.installSource ?? 'registry'
}

export default function SkillsPage() {
  return (
    <ErrorBoundary>
      <SkillsContent />
    </ErrorBoundary>
  )
}

function SkillsContent() {
  const { t } = useTranslation()
  const {
    data: clawhubCli,
    loading: clawhubCliLoading,
    refetch: refetchClawhubCli,
  } = useAdapterCall(getClawhubCliStatusResult)
  const {
    data: installedSkills,
    loading: installedSkillsLoading,
    error: installedSkillsError,
    refetch,
  } = useAdapterCall(getSkillsResult)

  const [installedQuery, setInstalledQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all')
  const [operatingKey, setOperatingKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [scanBusyKey, setScanBusyKey] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, SkillGuardScanResult>>({})
  const [scanErrors, setScanErrors] = useState<Record<string, string>>({})
  const [activeScanDetailsKey, setActiveScanDetailsKey] = useState<string | null>(null)
  const clawhubInstallTask = useInstallTask()

  const skills = installedSkills ?? []
  const clawhubReady = clawhubCli?.installed === true

  const catalogAliasMap = useMemo(() => {
    const map = new Map<string, CatalogSkill>()
    for (const catalog of SKILL_CATALOG) {
      for (const alias of catalogAliases(catalog)) {
        if (!map.has(alias)) map.set(alias, catalog)
      }
    }
    return map
  }, [])

  const installedAliasMap = useMemo(() => {
    const map = new Map<string, SkillInfo>()
    for (const skill of skills) {
      for (const alias of installedAliases(skill)) {
        if (!map.has(alias)) map.set(alias, skill)
      }
    }
    return map
  }, [skills])

  const catalogCollisionMap = useMemo(() => {
    const map = new Map<string, SkillInfo[]>()
    for (const catalog of SKILL_CATALOG) {
      const exactAliases = new Set(catalogInstallAliases(catalog))
      const genericAliases = new Set(catalogAliases(catalog))
      const collisions = skills.filter((skill) => {
        const aliases = installedAliases(skill)
        const exactMatch = aliases.some((alias) => exactAliases.has(alias))
        if (exactMatch) return false
        return aliases.some((alias) => genericAliases.has(alias))
      })
      if (collisions.length > 0) map.set(catalog.slug, collisions)
    }
    return map
  }, [skills])

  const resolveInstalledSkill = useCallback(
    (catalog: CatalogSkill): SkillInfo | undefined => {
      const exactInstallAliases = catalogInstallAliases(catalog)
      for (const alias of exactInstallAliases) {
        const match = installedAliasMap.get(alias)
        if (match) return match
      }
      if (catalog.skillKey && normalizeSkillToken(catalog.skillKey) !== normalizeSkillToken(catalog.slug)) {
        return undefined
      }
      for (const alias of catalogAliases(catalog)) {
        const match = installedAliasMap.get(alias)
        if (match) return match
      }
      return undefined
    },
    [installedAliasMap],
  )

  const filteredInstalledSkills = useMemo(() => {
    const query = installedQuery.trim().toLowerCase()
    return [...skills]
      .filter((skill) => {
        if (selectedCategory !== 'all') {
          const categoryMatch = installedAliases(skill)
            .map((alias) => catalogAliasMap.get(alias))
            .find(Boolean)
          if (categoryMatch?.category !== selectedCategory) return false
        }

        if (!query) return true

        return [
          skill.name,
          skill.description,
          skill.slug,
          skill.skillKey,
          skill.source,
        ].some((value) => value?.toLowerCase().includes(query))
      })
      .sort((left, right) => compareById(skillConfigKey(left), skillConfigKey(right)))
  }, [catalogAliasMap, installedQuery, selectedCategory, skills])

  const sortedFeaturedSkills = useMemo(
    () => [...FEATURED_SKILLS].sort((left, right) => compareById(catalogDisplayId(left), catalogDisplayId(right))),
    [],
  )

  const installedCount = skills.length
  const enabledCount = skills.filter(isSkillEnabled).length
  const readyCount = skills.filter((skill) => isSkillEnabled(skill) && isSkillReady(skill)).length

  async function handleInstall(slug: string) {
    setOperatingKey(slug)
    try {
      const result = await installSkillResult(slug)
      if (!result.success) {
        throw new Error(result.error ?? t('common.requestFailed'))
      }
      await refetch()
    } finally {
      setOperatingKey(null)
    }
  }

  async function handleSetEnabled(skill: SkillInfo, enabled: boolean) {
    const key = skillConfigKey(skill)
    setOperatingKey(key)
    const result = await setSkillEnabledResult(key, enabled)
    if (!result.success) {
      setFeedback(t('skills.enableFailed', { message: result.error }))
    }
    await refetch()
    setOperatingKey(null)
  }

  async function handleScan(skill: SkillInfo) {
    const key = skillConfigKey(skill)
    setScanBusyKey(key)
    setScanErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })

    const result = await scanInstalledSkillResult(skill)
    if (result.success && result.data) {
      setScanResults((current) => ({ ...current, [key]: result.data! }))
    } else {
      setScanErrors((current) => ({ ...current, [key]: result.error ?? t('common.requestFailed') }))
    }

    setScanBusyKey(null)
  }

  async function handleInstallClawhubCli() {
    await clawhubInstallTask.run(async () => {
      const result = await installClawhubCliResult()
      if (!result.success) {
        throw new Error(result.error ?? t('common.requestFailed'))
      }
      await refetchClawhubCli()
    })
  }

  return (
    <div className="page-shell page-shell-bleed">
      {feedback ? <ActionBanner tone="error" message={feedback} onDismiss={() => setFeedback(null)} /> : null}
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('skills.header.kicker')}</span>
            <span>{t('skills.featuredCount', { count: sortedFeaturedSkills.length })}</span>
            <span>{t('skills.installed', { count: installedCount })}</span>
          </div>
          <h1 className="page-title">{t('skills.title')}</h1>
          <p className="page-subtitle">{t('skills.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="button-secondary"
            title={t('common.refresh')}
          >
            <RefreshCw className="h-4 w-4" />
            {t('common.refresh')}
          </button>
          <a
            href="https://clawhub.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="button-secondary"
          >
            <ExternalLink className="h-4 w-4" />
            {t('skills.visitClawHub')}
          </a>
        </div>
      </div>

      {installedSkillsError && (
        <div role="alert" className="surface-card border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300">
          {installedSkillsError}
        </div>
      )}

      {(!clawhubReady || clawhubCliLoading || clawhubInstallTask.status !== 'idle') && (
        <ClawhubSetupCard
          id="skills-clawhub"
          status={clawhubCli}
          loading={clawhubCliLoading}
          installStatus={clawhubInstallTask.status}
          installError={clawhubInstallTask.error}
          onInstall={handleInstallClawhubCli}
          onRetry={clawhubInstallTask.reset}
          onRefresh={() => void refetchClawhubCli()}
          t={t}
        />
      )}

      <div className="metric-grid">
        <MetricCard
          label={t('skills.metrics.installed')}
          value={String(installedCount)}
          meta={t('skills.metrics.installedMeta')}
        />
        <MetricCard
          label={t('skills.metrics.enabled')}
          value={String(enabledCount)}
          meta={t('skills.metrics.enabledMeta')}
        />
        <MetricCard
          label={t('skills.metrics.ready')}
          value={String(readyCount)}
          meta={t('skills.metrics.readyMeta')}
        />
        <MetricCard
          label={t('skills.metrics.featured')}
          value={String(sortedFeaturedSkills.length)}
          meta={t('skills.metrics.featuredMeta')}
        />
      </div>

      <section id="skills-featured" className="surface-card space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="section-heading">{t('skills.featuredTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('skills.featuredLead')}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {sortedFeaturedSkills.map((catalog) => (
            <FeaturedSkillCard
              key={catalog.slug}
              catalog={catalog}
              installedSkill={resolveInstalledSkill(catalog)}
              shadowingSkills={catalogCollisionMap.get(catalog.slug) ?? []}
              busyKey={operatingKey}
              onInstall={handleInstall}
              onSetEnabled={handleSetEnabled}
              installLockedReason={catalogInstallSource(catalog) === 'bundled' || clawhubReady
                ? null
                : t('skills.clawhub.installFirstAction')}
            />
          ))}
        </div>
      </section>

      <div className="pill-group">
        <CategoryPill
          active={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          label={t('skills.allCategories')}
        />
        {CATEGORY_ORDER.map((category) => (
          <CategoryPill
            key={category}
            active={selectedCategory === category}
            onClick={() => setSelectedCategory(category)}
            label={t(`skills.category.${category}`)}
          />
        ))}
      </div>

      <section id="skills-installed" className="surface-card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="section-heading">{t('skills.installedTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('skills.installedLead')}</p>
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={installedQuery}
              onChange={(event) => setInstalledQuery(event.target.value)}
              placeholder={t('skills.filterPlaceholder')}
              className="control-input pl-10"
            />
          </div>
        </div>

        <InstalledGrid
          skills={filteredInstalledSkills}
          totalCount={installedCount}
          loading={installedSkillsLoading}
          busyKey={operatingKey}
          scanBusyKey={scanBusyKey}
          scanResults={scanResults}
          scanErrors={scanErrors}
          onSetEnabled={handleSetEnabled}
          onScan={handleScan}
          onViewScanDetails={(key) => setActiveScanDetailsKey(key)}
          t={t}
        />
      </section>

      {activeScanDetailsKey && scanResults[activeScanDetailsKey]?.report && (
        <ScanDetailsDialog
          result={scanResults[activeScanDetailsKey]!}
          findings={scanResults[activeScanDetailsKey]!.report!.findings.slice(0, 3)}
          onClose={() => setActiveScanDetailsKey(null)}
          t={t}
        />
      )}
    </div>
  )
}

function MetricCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-meta">{meta}</p>
    </div>
  )
}

function ClawhubSetupCard({
  id,
  status,
  loading,
  installStatus,
  installError,
  onInstall,
  onRetry,
  onRefresh,
  t,
}: {
  id?: string
  status: { installed: boolean; version: string; packageName: string } | null
  loading: boolean
  installStatus: 'idle' | 'running' | 'done' | 'error'
  installError?: string
  onInstall: () => void
  onRetry: () => void
  onRefresh: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const ready = status?.installed === true

  return (
    <section id={id} className={`surface-card space-y-4 ${ready ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
              {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> : <Package className="h-4 w-4 text-amber-700 dark:text-amber-300" />}
            </span>
            <div>
              <h2 className="section-heading">{t('skills.clawhub.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {ready
                  ? t('skills.clawhub.ready', { version: status?.version || 'unknown' })
                  : t('skills.clawhub.missing')}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t('skills.clawhub.description')}</p>
          <p className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-mono text-muted-foreground">
            {t('skills.clawhub.installCommand')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!ready && installStatus === 'idle' && (
            <button type="button" onClick={onInstall} className="button-primary whitespace-nowrap">
              <Download className="h-4 w-4" />
              {t('skills.clawhub.installButton')}
            </button>
          )}
          <button type="button" onClick={onRefresh} className="button-secondary whitespace-nowrap">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          <a href="https://www.npmjs.com/package/clawhub" target="_blank" rel="noopener noreferrer" className="button-secondary whitespace-nowrap">
            <ArrowUpRight className="h-4 w-4" />
            {t('skills.clawhub.learnMore')}
          </a>
        </div>
      </div>

      {loading && installStatus === 'idle' && (
        <LoadingState message={t('skills.clawhub.checking')} fullPage={false} />
      )}

      {installStatus !== 'idle' && (
        <InstallTask
          label="ClawHub"
          description={t('skills.clawhub.installCommand')}
          status={installStatus}
          error={installError}
          onRetry={onRetry}
        />
      )}
    </section>
  )
}

function CategoryPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pill-button ${active ? 'pill-button-active' : 'pill-button-inactive'}`}
    >
      {label}
    </button>
  )
}

function SkillStatusBadges({ skill, t }: { skill: SkillInfo; t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          isSkillEnabled(skill)
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border border-border/70 bg-background/70 text-muted-foreground'
        }`}
      >
        {isSkillEnabled(skill) ? t('skills.enabled') : t('skills.disabled')}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          isSkillReady(skill)
            ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }`}
      >
        {isSkillReady(skill) ? t('skills.ready') : t('skills.needsSetup')}
      </span>
      <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
        {t(sourceLabelKey(skill))}
      </span>
    </div>
  )
}

function SkillAction({
  installedSkill,
  installSlug,
  busyKey,
  onInstall,
  onSetEnabled,
  installLockedReason,
  label,
  t,
}: {
  installedSkill?: SkillInfo
  installSlug: string
  busyKey: string | null
  onInstall: (slug: string) => Promise<void> | void
  onSetEnabled: (skill: SkillInfo, enabled: boolean) => Promise<void> | void
  installLockedReason: string | null
  label: string
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const installTask = useInstallTask()

  if (!installedSkill) {
    if (installLockedReason) {
      return (
        <button
          type="button"
          disabled
          title={installLockedReason}
          className="button-secondary whitespace-nowrap opacity-60"
        >
          <Download className="h-4 w-4" />
          {t('skills.clawhub.installFirstAction')}
        </button>
      )
    }

    if (installTask.status !== 'idle') {
      return (
        <InstallTask
          label={label}
          status={installTask.status}
          error={installTask.error}
          onRetry={installTask.reset}
        />
      )
    }

    return (
      <button
        type="button"
        onClick={() => void installTask.run(async () => { await onInstall(installSlug) })}
        disabled={busyKey === installSlug}
        className="button-primary whitespace-nowrap"
      >
        <Download className="h-4 w-4" />
        {t('skills.install')}
      </button>
    )
  }

  const enabled = isSkillEnabled(installedSkill)
  const key = skillConfigKey(installedSkill)

  return (
    <button
      type="button"
      onClick={() => void onSetEnabled(installedSkill, !enabled)}
      disabled={busyKey === key}
      className={enabled ? 'button-secondary whitespace-nowrap' : 'button-primary whitespace-nowrap'}
    >
      {enabled ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
      {busyKey === key
        ? enabled
          ? t('skills.disabling')
          : t('skills.enabling')
        : enabled
          ? t('skills.disable')
          : t('skills.enable')}
    </button>
  )
}

function FeaturedSkillCard({
  catalog,
  installedSkill,
  shadowingSkills,
  busyKey,
  onInstall,
  onSetEnabled,
  installLockedReason,
}: {
  catalog: CatalogSkill
  installedSkill?: SkillInfo
  shadowingSkills: SkillInfo[]
  busyKey: string | null
  onInstall: (slug: string) => Promise<void> | void
  onSetEnabled: (skill: SkillInfo, enabled: boolean) => Promise<void> | void
  installLockedReason: string | null
}) {
  const { t } = useTranslation()
  const Icon = FEATURED_ICON_MAP[catalog.slug] ?? Package
  const tone = FEATURED_TONES[catalog.slug] ?? 'border-primary/20 bg-primary/5'

  return (
    <div className={`rounded-[28px] border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
          <Icon className="h-5 w-5 text-foreground" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs ${CATEGORY_COLORS[catalog.category]}`}>
          {t(`skills.category.${catalog.category}`)}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{catalog.skillKey ?? trailingSlugToken(catalog.slug)}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t(catalog.descriptionKey)}</p>
        </div>

        {installedSkill ? (
          <SkillStatusBadges skill={installedSkill} t={t} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
              {t(catalogInstallSource(catalog) === 'bundled' ? 'skills.featuredBundled' : 'skills.featuredClawHub')}
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
              {t(catalogInstallSource(catalog) === 'bundled' ? 'skills.sourceBundled' : 'skills.sourceClawHub')}
            </span>
          </div>
        )}

        {shadowingSkills.length > 0 && (
          <IdentityNotice
            tone="warn"
            title={t('skills.collisionTitle')}
            body={t('skills.collisionHint', {
              key: catalog.skillKey ?? trailingSlugToken(catalog.slug),
              source: t(sourceLabelKey(shadowingSkills[0]!)),
            })}
          />
        )}
      </div>

      <div className="mt-5 flex w-full flex-wrap items-center justify-end gap-2">
        <SkillAction
          installedSkill={installedSkill}
          installSlug={catalog.slug}
          busyKey={busyKey}
          onInstall={onInstall}
          onSetEnabled={onSetEnabled}
          installLockedReason={installLockedReason}
          label={catalog.name}
          t={t}
        />
        {catalog.sourceUrl && (
          <a
            href={catalog.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button-secondary whitespace-nowrap"
          >
            <ArrowUpRight className="h-4 w-4" />
            {t('skills.source')}
          </a>
        )}
      </div>
    </div>
  )
}

function InstalledGrid({
  skills,
  totalCount,
  loading,
  busyKey,
  scanBusyKey,
  scanResults,
  scanErrors,
  onSetEnabled,
  onScan,
  onViewScanDetails,
  t,
}: {
  skills: SkillInfo[]
  totalCount: number
  loading: boolean
  busyKey: string | null
  scanBusyKey: string | null
  scanResults: Record<string, SkillGuardScanResult>
  scanErrors: Record<string, string>
  onSetEnabled: (skill: SkillInfo, enabled: boolean) => Promise<void> | void
  onScan: (skill: SkillInfo) => Promise<void> | void
  onViewScanDetails: (key: string) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  if (loading && totalCount === 0) {
    return <LoadingState message={t('common.loading')} fullPage={false} />
  }

  if (totalCount === 0) {
    return (
      <div className="state-panel min-h-0 py-10 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">{t('skills.noInstalled')}</p>
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div className="state-panel min-h-0 py-8">
        <p className="text-muted-foreground">{t('skills.noMatch')}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {skills.map((skill) => (
        <InstalledSkillCard
          key={skillConfigKey(skill)}
          skill={skill}
          busyKey={busyKey}
          scanBusy={scanBusyKey === skillConfigKey(skill)}
          scanResult={scanResults[skillConfigKey(skill)]}
          scanError={scanErrors[skillConfigKey(skill)]}
          onSetEnabled={onSetEnabled}
          onScan={onScan}
          onViewScanDetails={onViewScanDetails}
          t={t}
        />
      ))}
    </div>
  )
}

function InstalledSkillCard({
  skill,
  busyKey,
  scanBusy,
  scanResult,
  scanError,
  onSetEnabled,
  onScan,
  onViewScanDetails,
  t,
}: {
  skill: SkillInfo
  busyKey: string | null
  scanBusy: boolean
  scanResult?: SkillGuardScanResult
  scanError?: string
  onSetEnabled: (skill: SkillInfo, enabled: boolean) => Promise<void> | void
  onScan: (skill: SkillInfo) => Promise<void> | void
  onViewScanDetails: (key: string) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const enabled = isSkillEnabled(skill)
  const key = skillConfigKey(skill)
  const actionBusy = busyKey === key

  return (
    <div className="rounded-[28px] border border-border/70 bg-background/80 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">{key}</h3>
              {skill.version && skill.version !== 'unknown' && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{skill.version}</span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{skill.description || t('skills.noDescription')}</p>
          </div>
          <SkillStatusBadges skill={skill} t={t} />
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:ml-auto lg:max-w-max">
          <button
            type="button"
            onClick={() => void onScan(skill)}
            disabled={scanBusy}
            className="button-secondary whitespace-nowrap"
          >
            <ShieldCheck className={`h-4 w-4 ${scanBusy ? 'animate-pulse' : ''}`} />
            {scanBusy ? t('skills.scanning') : t('skills.scan')}
          </button>
          <button
            type="button"
            onClick={() => void onSetEnabled(skill, !enabled)}
            disabled={actionBusy}
            className={enabled ? 'button-secondary whitespace-nowrap' : 'button-primary whitespace-nowrap'}
          >
            {enabled ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
            {actionBusy
              ? enabled
                ? t('skills.disabling')
                : t('skills.enabling')
              : enabled
                ? t('skills.disable')
                : t('skills.enable')}
          </button>
        </div>
      </div>

      {(scanBusy || scanError || scanResult) && (
        <SkillScanPanel
          result={scanResult}
          error={scanError}
          loading={scanBusy}
          onViewDetails={() => onViewScanDetails(key)}
          t={t}
        />
      )}
    </div>
  )
}

function riskTone(level: string | undefined): string {
  switch ((level ?? '').toUpperCase()) {
    case 'F':
      return 'border-red-500/30 bg-red-500/5'
    case 'D':
      return 'border-orange-500/30 bg-orange-500/5'
    case 'C':
      return 'border-amber-500/30 bg-amber-500/5'
    case 'B':
      return 'border-sky-500/30 bg-sky-500/5'
    default:
      return 'border-emerald-500/30 bg-emerald-500/5'
  }
}

function riskValueTone(level: string | undefined): string {
  switch ((level ?? '').toUpperCase()) {
    case 'F':
      return 'text-red-600 dark:text-red-300'
    case 'D':
      return 'text-orange-600 dark:text-orange-300'
    case 'C':
      return 'text-amber-600 dark:text-amber-300'
    case 'B':
      return 'text-emerald-600 dark:text-emerald-300'
    default:
      return 'text-emerald-600 dark:text-emerald-300'
  }
}

function riskDescriptorKey(level: string | undefined): string {
  switch ((level ?? '').toUpperCase()) {
    case 'F':
      return 'skills.scanLevelDanger'
    case 'D':
      return 'skills.scanLevelHighRisk'
    case 'C':
      return 'skills.scanLevelWarning'
    case 'B':
      return 'skills.scanLevelLowRisk'
    default:
      return 'skills.scanLevelSafe'
  }
}

function findingPanelTone(level: string): string {
  switch (level.toUpperCase()) {
    case 'CRITICAL':
      return 'border-red-500/30 bg-red-500/5'
    case 'HIGH':
      return 'border-orange-500/30 bg-orange-500/5'
    case 'MEDIUM':
      return 'border-amber-500/30 bg-amber-500/5'
    default:
      return 'border-slate-300/70 bg-background/90 dark:border-slate-700/70'
  }
}

function severityBadgeTone(level: string): string {
  switch (level.toUpperCase()) {
    case 'CRITICAL':
      return 'bg-red-500/15 text-red-700 dark:text-red-300'
    case 'HIGH':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
    case 'MEDIUM':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    default:
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
  }
}

function formatScanTimestamp(value: string): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function severityLabel(level: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (level.toUpperCase()) {
    case 'CRITICAL':
      return t('skills.severityCritical')
    case 'HIGH':
      return t('skills.severityHigh')
    case 'MEDIUM':
      return t('skills.severityMedium')
    default:
      return t('skills.severityLow')
  }
}

function topSeverityValue(result: SkillGuardScanResult, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const criticalCount = result.severityCounts.CRITICAL ?? 0
  const highCount = result.severityCounts.HIGH ?? 0
  const mediumCount = result.severityCounts.MEDIUM ?? 0

  if (criticalCount > 0) return `${severityLabel('CRITICAL', t)} ${criticalCount}`
  if (highCount > 0) return `${severityLabel('HIGH', t)} ${highCount}`
  if (mediumCount > 0) return `${severityLabel('MEDIUM', t)} ${mediumCount}`
  return severityLabel('LOW', t)
}

function SkillScanPanel({
  result,
  error,
  loading,
  onViewDetails,
  t,
}: {
  result?: SkillGuardScanResult
  error?: string
  loading: boolean
  onViewDetails: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  if (loading) {
    return (
      <div className="mt-4 rounded-[24px] border border-border/70 bg-background/70 p-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>{t('skills.scanning')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 rounded-[24px] border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{t('skills.scanFailed')}</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!result?.report) {
    return null
  }

  const report = result.report
  const criticalCount = result.severityCounts.CRITICAL ?? 0
  const highCount = result.severityCounts.HIGH ?? 0
  const mediumCount = result.severityCounts.MEDIUM ?? 0
  const issueTone =
    criticalCount > 0
      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
      : highCount > 0
        ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
        : mediumCount > 0
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'

  return (
    <>
      <div className={`mt-4 overflow-hidden rounded-[28px] border shadow-[0_20px_60px_-48px_rgba(15,23,42,0.45)] ${riskTone(report.riskLevel)}`}>
        <div className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <p className="text-base font-semibold tracking-tight text-foreground">SkillGuard</p>
              <span className={`inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border border-current/15 bg-background/90 px-3 text-lg font-semibold ${riskValueTone(report.riskLevel)}`}>
                {report.riskLevel}
              </span>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${issueTone}`}>
                {result.totalFindings === 0 ? t('skills.scanNoFindings') : `${t('skills.scanFindingCount')} ${result.totalFindings}`}
              </span>
            </div>

            <button type="button" onClick={onViewDetails} className="button-secondary whitespace-nowrap">
              {t('skills.scanViewDetails')}
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ScanInlineStat
              label={t('skills.scanSafetyScore')}
              value={`${report.riskScore} · ${t(riskDescriptorKey(report.riskLevel))}`}
              valueClassName={riskValueTone(report.riskLevel)}
            />
            <ScanInlineStat
              label={t('skills.scanRiskLevel')}
              value={`${report.riskLevel} · ${t(riskDescriptorKey(report.riskLevel))}`}
              valueClassName={riskValueTone(report.riskLevel)}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5">
              {formatScanTimestamp(result.auditMetadata.timestamp)}
            </span>
            <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 font-mono">
              {report.skillName}
            </span>
            {criticalCount > 0 && (
              <span className="rounded-full bg-red-500/10 px-3 py-1.5 font-medium text-red-700 dark:text-red-300">
                {t('skills.scanCriticalCount', { count: criticalCount })}
              </span>
            )}
            {highCount > 0 && (
              <span className="rounded-full bg-orange-500/10 px-3 py-1.5 font-medium text-orange-700 dark:text-orange-300">
                {t('skills.scanHighCount', { count: highCount })}
              </span>
            )}
            {criticalCount === 0 && highCount === 0 && mediumCount === 0 && (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                {t('skills.scanNoFindings')}
              </span>
            )}
          </div>
        </div>
      </div>

    </>
  )
}

function ScanDetailsDialog({
  result,
  findings,
  onClose,
  t,
}: {
  result: SkillGuardScanResult
  findings: SkillGuardScanResult['report'] extends infer Report
    ? Report extends { findings: infer Findings }
      ? Findings
      : never
    : never
  onClose: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const report = result.report

  if (!report) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/55 p-0 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-scan-dialog-title"
        className="relative flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border/80 bg-background shadow-2xl sm:w-[calc(100vw-24px)] lg:w-[calc(100vw-32px)] xl:w-[calc(100vw-64px)] 2xl:w-[min(1520px,calc(100vw-84px))] sm:rounded-l-[34px]"
      >
        <div className={`shrink-0 border-b border-border/70 px-5 py-5 sm:px-7 ${riskTone(report.riskLevel)}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h3 id="skill-scan-dialog-title" className="text-[1.35rem] font-semibold tracking-tight text-foreground">
                  SkillGuard
                </h3>
                <span className={`inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border border-current/15 bg-background/85 px-3 text-lg font-semibold ${riskValueTone(report.riskLevel)}`}>
                  {report.riskLevel}
                </span>
                <span className="rounded-full border border-border/70 bg-background/85 px-3 py-1.5 text-xs font-mono text-muted-foreground">
                  {report.skillName}
                </span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="button-secondary px-3">
              <X className="h-4 w-4" />
              {t('skills.scanClose')}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ScanMetric
                label={t('skills.scanRiskLevel')}
                value={`${report.riskLevel} · ${t(riskDescriptorKey(report.riskLevel))}`}
                icon={ShieldCheck}
                valueClassName={riskValueTone(report.riskLevel)}
              />
              <ScanMetric
                label={t('skills.scanSafetyScore')}
                value={`${report.riskScore} · ${t(riskDescriptorKey(report.riskLevel))}`}
                icon={ShieldQuestion}
                valueClassName={riskValueTone(report.riskLevel)}
              />
              <ScanMetric label={t('skills.scanFindingCount')} value={String(result.totalFindings)} icon={FileText} />
              <ScanMetric label={t('skills.scanTopSeverity')} value={topSeverityValue(result, t)} icon={AlertTriangle} />
            </div>

            <div className="mt-5 rounded-[28px] border border-border/70 bg-background/70 p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{t('skills.scanTopFindings')}</p>
              </div>
              {findings.length === 0 ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  {t('skills.scanNoFindings')}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {findings.map((finding, index) => (
                    <div key={`${finding.filePath}-${finding.lineNumber ?? index}`} className={`rounded-[26px] border p-4 shadow-sm ${findingPanelTone(finding.severity)}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severityBadgeTone(finding.severity)}`}>
                          {severityLabel(finding.severity, t)}
                        </span>
                        <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                          {finding.dimension}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-foreground">{finding.description}</p>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            {t('skills.scanTarget')}
                          </div>
                          <p className="mt-2 break-all text-xs font-mono text-muted-foreground">
                            {finding.filePath}
                            {finding.lineNumber ? `:${finding.lineNumber}` : ''}
                          </p>
                        </div>
                        {(finding.remediationEn || finding.remediationZh || finding.reference) && (
                          <div className="rounded-2xl border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground">{t('skills.scanReference')}</p>
                            <p className="mt-2 break-words">
                              {finding.remediationZh || finding.remediationEn || finding.reference}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {result.totalFindings > findings.length && (
                    <p className="text-xs text-muted-foreground">
                      {t('skills.scanMoreFindings', { count: result.totalFindings - findings.length })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="hidden min-h-0 border-l border-border/70 bg-muted/20 xl:flex xl:flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                <div className="rounded-[26px] border border-border/70 bg-background/80 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">{t('skills.scanTarget')}</p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                    <FolderOpen className="h-3.5 w-3.5" />
                    {report.skillName}
                  </div>
                  <p className="mt-3 break-all rounded-2xl border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                    {report.skillPath}
                  </p>
                </div>

                <div className="rounded-[26px] border border-border/70 bg-background/80 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">{t('skills.scanSeverityBreakdown')}</p>
                  <div className="mt-3 grid gap-2">
                    <SeverityCountCard label={t('skills.scanCriticalCount', { count: result.severityCounts.CRITICAL ?? 0 })} tone="critical" />
                    <SeverityCountCard label={t('skills.scanHighCount', { count: result.severityCounts.HIGH ?? 0 })} tone="high" />
                    {result.severityCounts.MEDIUM ? (
                      <div className="rounded-2xl bg-amber-500/10 px-3 py-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                        MEDIUM {result.severityCounts.MEDIUM}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[26px] border border-border/70 bg-background/80 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">{t('skills.scanScannedAt')}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{formatScanTimestamp(result.auditMetadata.timestamp)}</p>
                </div>

                <div className="rounded-[26px] border border-border/70 bg-background/80 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">{t('skills.scanSubtitle')}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t('skills.scanDialogLead')}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function ScanInlineStat({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/90 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-2 truncate text-xl font-semibold tracking-tight ${valueClassName ?? 'text-foreground'}`}>
        {value}
      </p>
    </div>
  )
}

function SeverityCountCard({ label, tone }: { label: string; tone: 'critical' | 'high' }) {
  return (
    <div
      className={`rounded-2xl px-3 py-3 text-sm font-medium ${
        tone === 'critical'
          ? 'bg-red-500/10 text-red-700 dark:text-red-300'
          : 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
      }`}
    >
      {label}
    </div>
  )
}

function ScanMetric({
  label,
  value,
  icon: Icon,
  valueClassName,
}: {
  label: string
  value: string
  icon: LucideIcon
  valueClassName?: string
}) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className={`mt-3 text-xl font-semibold tracking-tight ${valueClassName ?? 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function IdentityNotice({
  tone,
  title,
  body,
}: {
  tone: 'info' | 'warn'
  title: string
  body: string
}) {
  const toneClassName =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300'
      : 'border-sky-500/30 bg-sky-500/8 text-sky-700 dark:text-sky-300'

  return (
    <div className={`rounded-[22px] border px-3 py-3 text-sm ${toneClassName}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5">{body}</p>
    </div>
  )
}
