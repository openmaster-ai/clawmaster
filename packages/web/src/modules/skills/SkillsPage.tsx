import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import { InstallTask } from '@/shared/components/InstallTask'
import {
  Camera,
  Receipt,
  BookOpen,
  Code,
  RefreshCw,
  ExternalLink,
  Search,
  Package,
  Download,
  Trash2,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import {
  getSkillsResult,
  searchSkillsResult,
  installSkillResult,
  uninstallSkillResult,
} from '@/shared/adapters/clawhub'
import type { SkillInfo } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import {
  SKILL_CATALOG,
  SCENE_BUNDLES,
  CATEGORY_ORDER,
  CATEGORY_COLORS,
  type SkillCategory,
  type CatalogSkill,
  type SceneBundle,
} from './catalog'

const SCENE_ICON_MAP: Record<string, LucideIcon> = {
  camera: Camera,
  receipt: Receipt,
  'book-open': BookOpen,
  code: Code,
}

export default function Skills() {
  return (
    <ErrorBoundary>
      <SkillsContent />
    </ErrorBoundary>
  )
}

function SkillsContent() {
  const { t } = useTranslation()
  const { data: installedSkills, refetch } = useAdapterCall(getSkillsResult)

  const [searchResults, setSearchResults] = useState<SkillInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [operating, setOperating] = useState<string | null>(null)
  const [view, setView] = useState<'installed' | 'market'>('installed')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all')

  const skills = installedSkills ?? []
  const installedSlugs = useMemo(() => new Set(skills.map((s) => s.slug)), [skills])

  const filteredSkills = useMemo(() => {
    if (!query.trim()) return skills
    const q = query.toLowerCase()
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    )
  }, [skills, query])

  const filteredCatalog = useMemo(
    () => selectedCategory === 'all' ? SKILL_CATALOG : SKILL_CATALOG.filter((s) => s.category === selectedCategory),
    [selectedCategory],
  )

  const filteredScenes = useMemo(
    () => selectedCategory === 'all' ? SCENE_BUNDLES : SCENE_BUNDLES.filter((b) =>
      b.skills.some((slug) => SKILL_CATALOG.find((s) => s.slug === slug)?.category === selectedCategory),
    ),
    [selectedCategory],
  )

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    const result = await searchSkillsResult(query)
    if (result.success && result.data) {
      setSearchResults(result.data)
    }
    setSearching(false)
  }, [query])

  async function handleInstall(slug: string) {
    setOperating(slug)
    const result = await installSkillResult(slug)
    if (!result.success) {
      alert(t('skills.installFailed', { message: result.error }))
    }
    await refetch()
    setOperating(null)
  }

  async function handleUninstall(slug: string) {
    if (!confirm(t('skills.confirmUninstall', { slug }))) return
    setOperating(slug)
    const result = await uninstallSkillResult(slug)
    if (!result.success) {
      alert(t('skills.uninstallFailed', { message: result.error }))
    }
    await refetch()
    setOperating(null)
  }

  async function handleSceneInstall(sceneSkills: string[]) {
    setOperating('scene')
    for (const slug of sceneSkills) {
      const result = await installSkillResult(slug)
      if (!result.success) {
        alert(t('skills.installFailed', { message: result.error }))
        break
      }
    }
    await refetch()
    setOperating(null)
  }

  function isSceneInstalled(sceneSkills: string[]): boolean {
    return sceneSkills.every((slug) => installedSlugs.has(slug))
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('skills.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('skills.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 border border-border rounded hover:bg-accent"
            title={t('common.refresh') ?? 'Refresh'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <a
            href="https://clawhub.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded hover:bg-accent"
          >
            <ExternalLink className="w-4 h-4" />
            {t('skills.visitClawHub')}
          </a>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        <CategoryPill
          active={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          label={t('skills.allCategories')}
        />
        {CATEGORY_ORDER.map((cat) => (
          <CategoryPill
            key={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            label={t(`skills.category.${cat}`)}
          />
        ))}
      </div>

      {/* Scene Bundles */}
      {filteredScenes.length > 0 && (
        <div>
          <h3 className="font-medium mb-3">{t('skills.recommendedScenes')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredScenes.map((scene) => {
              const allInstalled = isSceneInstalled(scene.skills)
              return (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  allInstalled={allInstalled}
                  installing={operating === 'scene'}
                  onInstall={() => handleSceneInstall(scene.skills)}
                  t={t}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Curated Catalog */}
      <div>
        <h3 className="font-medium mb-3">{t('skills.curatedCatalog')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCatalog.map((catalog) => (
            <CatalogCard
              key={catalog.slug}
              catalog={catalog}
              installed={installedSlugs.has(catalog.slug)}
              operating={operating === catalog.slug}
              onInstall={() => handleInstall(catalog.slug)}
              onUninstall={() => handleUninstall(catalog.slug)}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={view === 'market' ? t('skills.searchPlaceholder') : t('skills.filterPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && view === 'market' && handleSearch()}
          className="w-full pl-10 pr-4 py-2.5 bg-card rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {view === 'market' && (
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {searching ? t('common.searching') : t('common.search')}
          </button>
        )}
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => { setView('installed'); setSearchResults([]) }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'installed' ? 'bg-card shadow-sm' : 'hover:bg-card/50'
          }`}
        >
          {t('skills.installed', { count: skills.length })}
        </button>
        <button
          onClick={() => setView('market')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'market' ? 'bg-card shadow-sm' : 'hover:bg-card/50'
          }`}
        >
          {t('skills.searchMarket')}
        </button>
      </div>

      {/* Content */}
      {view === 'installed' ? (
        <InstalledView
          skills={filteredSkills}
          totalCount={skills.length}
          operating={operating}
          onUninstall={handleUninstall}
          t={t}
        />
      ) : (
        <MarketView
          results={searchResults}
          searching={searching}
          operating={operating}
          installedSlugs={installedSlugs}
          onInstall={handleInstall}
          t={t}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───

function CategoryPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-card shadow-sm' : 'hover:bg-card/50'
      }`}
    >
      {label}
    </button>
  )
}

function SceneCard({
  scene,
  allInstalled,
  installing,
  onInstall,
  t,
}: {
  scene: SceneBundle
  allInstalled: boolean
  installing: boolean
  onInstall: () => void
  t: (key: string, opts?: any) => string
}) {
  const sceneTask = useInstallTask()
  const Icon = SCENE_ICON_MAP[scene.icon] ?? Package
  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${scene.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h4 className="font-medium">{t(scene.titleKey)}</h4>
          <span className="text-xs text-muted-foreground">
            {t('skills.sceneSkills', { count: scene.skills.length })}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 flex-1">{t(scene.descKey)}</p>
      {allInstalled ? (
        <div className="flex items-center justify-center gap-1.5 py-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          {t('skills.allInstalled')}
        </div>
      ) : sceneTask.status !== 'idle' ? (
        <InstallTask
          label={t(scene.titleKey)}
          status={sceneTask.status}
          error={sceneTask.error}
          onRetry={sceneTask.reset}
        />
      ) : (
        <button
          onClick={() => sceneTask.run(async () => { onInstall() })}
          disabled={installing}
          className="w-full py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          {t('skills.oneClickInstall')}
        </button>
      )}
    </div>
  )
}

function CatalogCard({
  catalog,
  installed,
  operating,
  onInstall,
  onUninstall,
  t,
}: {
  catalog: CatalogSkill
  installed: boolean
  operating: boolean
  onInstall: () => void
  onUninstall: () => void
  t: (key: string, opts?: any) => string
}) {
  const installTask = useInstallTask()

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{catalog.name}</span>
            {installed && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                <CheckCircle2 className="w-3 h-3" />
                {t('common.installed')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{catalog.slug}</p>
        </div>
        <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${CATEGORY_COLORS[catalog.category]}`}>
          {t(`skills.category.${catalog.category}`)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{t(catalog.descriptionKey)}</p>

      <div className="flex items-center gap-2">
        {catalog.sourceUrl && (
          <a
            href={catalog.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            {t('skills.source')}
          </a>
        )}
        <div className="flex-1" />

        {installTask.status !== 'idle' ? (
          <InstallTask
            label={catalog.name}
            status={installTask.status}
            error={installTask.error}
            onRetry={installTask.reset}
          />
        ) : installed ? (
          <button
            onClick={onUninstall}
            disabled={operating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
            {t('skills.uninstall')}
          </button>
        ) : (
          <button
            onClick={() => installTask.run(async () => { onInstall() })}
            disabled={operating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            {t('skills.install')}
          </button>
        )}
      </div>
    </div>
  )
}

function InstalledView({
  skills,
  totalCount,
  operating,
  onUninstall,
  t,
}: {
  skills: SkillInfo[]
  totalCount: number
  operating: string | null
  onUninstall: (slug: string) => void
  t: (key: string) => string
}) {
  if (totalCount === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground">{t('skills.noInstalled')}</p>
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground">{t('skills.noMatch')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {skills.map((skill) => (
        <SkillCard
          key={skill.slug}
          skill={skill}
          operating={operating === skill.slug}
          action={
            <button
              onClick={() => onUninstall(skill.slug)}
              disabled={operating === skill.slug}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {operating === skill.slug ? t('skills.processing') : t('skills.uninstall')}
            </button>
          }
        />
      ))}
    </div>
  )
}

function MarketView({
  results,
  searching,
  operating,
  installedSlugs,
  onInstall,
  t,
}: {
  results: SkillInfo[]
  searching: boolean
  operating: string | null
  installedSlugs: Set<string>
  onInstall: (slug: string) => void
  t: (key: string) => string
}) {
  if (searching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-sm text-muted-foreground">{t('common.searching')}</span>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground">{t('skills.searchHint')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {results.map((skill) => {
        const alreadyInstalled = installedSlugs.has(skill.slug)
        return (
          <SkillCard
            key={skill.slug}
            skill={skill}
            operating={operating === skill.slug}
            action={
              alreadyInstalled ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('common.installed')}
                </span>
              ) : (
                <button
                  onClick={() => onInstall(skill.slug)}
                  disabled={operating === skill.slug}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {operating === skill.slug ? t('skills.installing') : t('skills.install')}
                </button>
              )
            }
          />
        )
      })}
    </div>
  )
}

function SkillCard({
  skill,
  operating,
  action,
}: {
  skill: SkillInfo
  operating: boolean
  action: React.ReactNode
}) {
  return (
    <div className={`bg-card border rounded-lg p-4 flex items-start justify-between gap-3 transition-colors ${
      operating ? 'border-primary/30 opacity-70' : 'border-border hover:border-primary/50'
    }`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{skill.name}</span>
          <span className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground font-mono">
            {skill.version}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{skill.description}</p>
        <p className="text-xs text-muted-foreground font-mono">{skill.slug}</p>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  )
}
