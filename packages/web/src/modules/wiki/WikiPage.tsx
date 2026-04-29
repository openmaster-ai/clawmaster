import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  FileText,
  GitBranch,
  History,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import type {
  WikiEvolvePayload,
  WikiIngestPayload,
  WikiLintPayload,
  WikiPageDetail,
  WikiPageSummary,
  WikiQueryPayload,
  WikiSearchResult,
  WikiStatusPayload,
  WikiSynthesizePayload,
} from '@/lib/types'
import {
  wikiEvolveResult,
  wikiIngestResult,
  wikiLintResult,
  wikiPageResult,
  wikiPagesResult,
  wikiQueryResult,
  wikiSearchResult,
  wikiStatusResult,
  wikiSynthesizeResult,
} from '@/shared/adapters/wiki'

function statusClass(status: string): string {
  if (status === 'fresh') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'aging') return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
}

function lifecycleClass(state: string): string {
  if (state === 'just_ingested') return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (state === 'evolved') return 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
  if (state === 'outdated') return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
  return 'border-border bg-muted/30 text-muted-foreground'
}

function hasEvolveChange(page: WikiPageSummary): boolean {
  return page.lifecycleState === 'evolved' && Boolean(page.evolveChangedAt || page.evolveChangeSummary)
}

function shortDate(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function evolveWarningText(warning: string, evolve: WikiEvolvePayload, t: (key: string, values?: Record<string, unknown>) => string): string {
  if (warning === 'wiki_conflicts_detected') {
    return t('wiki.warning.conflictsDetected', { count: evolve.conflictCount })
  }
  if (warning === 'auto_evolve_failed') {
    return t('wiki.warning.autoEvolveFailed')
  }
  return warning
}

function PageSignalChips({ page, compact = false }: { page: WikiPageSummary; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(page.freshnessStatus)}`}
        title={t('wiki.signal.freshnessTitle', { score: Math.round(page.freshnessScore * 100) })}
      >
        {t(`wiki.freshness.${page.freshnessStatus}`)}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[11px] ${lifecycleClass(page.lifecycleState)}`}
        title={t('wiki.signal.lifecycleTitle')}
      >
        {t(`wiki.lifecycle.${page.lifecycleState}`)}
      </span>
      {!compact && hasEvolveChange(page) && page.evolvedAt ? (
        <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
          {t('wiki.signal.changedAt', { time: shortDate(page.evolvedAt) })}
        </span>
      ) : null}
    </div>
  )
}

function pageOriginKey(page: WikiPageSummary): string {
  if (page.type === 'synthesis') return 'wiki.origin.llm'
  if (page.type === 'source') return 'wiki.origin.source'
  return 'wiki.origin.maintained'
}

function PageOriginBanner({ page }: { page: WikiPageDetail }) {
  const { t } = useTranslation()
  const isSynthesis = page.type === 'synthesis'
  const isSource = page.type === 'source'
  return (
    <div className={`rounded-lg border p-3 text-sm ${
      isSynthesis
        ? 'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200'
        : isSource
          ? 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200'
          : 'border-border bg-muted/30 text-muted-foreground'
    }`}
    >
      <p className="font-medium">{t(pageOriginKey(page))}</p>
      <p className="mt-1 text-xs leading-5 opacity-90">
        {isSynthesis
          ? t('wiki.origin.llmDetail', { count: page.sourceCount })
          : isSource
            ? t('wiki.origin.sourceDetail')
            : t('wiki.origin.maintainedDetail')}
      </p>
    </div>
  )
}

function PageEvolutionBanner({ page }: { page: WikiPageDetail }) {
  const { t } = useTranslation()
  const changedByEvolve = hasEvolveChange(page)
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        changedByEvolve
          ? 'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      }`}
    >
      <p className="font-medium">
        {changedByEvolve ? t('wiki.evolution.changedTitle') : t('wiki.evolution.checkedTitle')}
      </p>
      <p className="mt-1 text-xs leading-5 opacity-90">
        {changedByEvolve
          ? t('wiki.evolution.changedDetail', { time: shortDate(page.evolveChangedAt || page.evolvedAt || page.updatedAt) })
          : t('wiki.evolution.checkedDetail', { time: shortDate(page.evolveCheckedAt || page.updatedAt) })}
      </p>
      <p className="mt-2 text-xs leading-5">
        {changedByEvolve && page.evolveChangeSummary ? page.evolveChangeSummary : t('wiki.signal.checkedOnly')}
      </p>
      {page.evolveSource ? (
        <p className="mt-1 text-[11px] opacity-75">{t('wiki.signal.evidenceSource', { source: page.evolveSource })}</p>
      ) : null}
    </div>
  )
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function MarkdownPreview({
  content,
  onOpenLink,
}: {
  content: string
  onOpenLink: (target: string) => void
}) {
  const lines = content.split(/\r?\n/)
  return (
    <div className="space-y-2 text-sm leading-6">
      {lines.map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/)
        if (heading) {
          const size = heading[1].length === 1 ? 'text-xl' : heading[1].length === 2 ? 'text-lg' : 'text-base'
          return <h3 key={index} className={`${size} pt-2 font-semibold text-foreground`}>{heading[2]}</h3>
        }
        if (!line.trim()) return <div key={index} className="h-2" />
        const parts: Array<{ text: string; link?: string }> = []
        const pattern = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g
        let cursor = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(line))) {
          if (match.index > cursor) parts.push({ text: line.slice(cursor, match.index) })
          const link = match[1]?.trim() || ''
          parts.push({ text: link, link })
          cursor = match.index + match[0].length
        }
        if (cursor < line.length) parts.push({ text: line.slice(cursor) })
        return (
          <p key={index} className="whitespace-pre-wrap text-muted-foreground">
            {parts.map((part, partIndex) => part.link ? (
              <button
                key={`${index}-${partIndex}`}
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => onOpenLink(part.link!)}
              >
                {part.text}
              </button>
            ) : (
              <span key={`${index}-${partIndex}`}>{part.text}</span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function PageList({
  pages,
  selectedId,
  onSelect,
}: {
  pages: Array<WikiPageSummary | WikiSearchResult>
  selectedId: string | null
  onSelect: (pageId: string) => void
}) {
  const { t } = useTranslation()
  if (pages.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t('wiki.emptyPages')}</p>
  }
  return (
    <ul className="space-y-2">
      {pages.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/50 ${
              selectedId === page.id ? 'border-primary bg-primary/5' : 'border-border bg-background/70'
            }`}
            onClick={() => onSelect(page.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{page.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{page.snippet}</p>
              </div>
              <div className="shrink-0">
                <PageSignalChips page={page} compact />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>{t(`wiki.type.${page.type}`)}</span>
              <span className={page.type === 'synthesis' ? 'font-medium text-violet-600 dark:text-violet-300' : ''}>
                {t(pageOriginKey(page))}
              </span>
              <span>{t('wiki.sourceCount', { count: page.sourceCount })}</span>
              {'matchType' in page ? <span>{t(`wiki.match.${page.matchType}`)}</span> : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function PageDetailModal({
  page,
  onClose,
  onOpenLink,
}: {
  page: WikiPageDetail | null
  onClose: () => void
  onOpenLink: (target: string) => void
}) {
  const { t } = useTranslation()
  if (!page) return null
  const changedByEvolve = hasEvolveChange(page)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={page.title}
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-4rem)]"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="truncate text-xl font-semibold text-foreground">{page.title}</h2>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{t(`wiki.type.${page.type}`)}</span>
              <span>{shortDate(page.updatedAt)}</span>
              <span>{page.relativePath}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PageSignalChips page={page} />
            <button type="button" onClick={onClose} className="button-secondary px-3" aria-label={t('common.close')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <PageOriginBanner page={page} />
            <PageEvolutionBanner page={page} />
          </div>
          <MarkdownPreview content={page.content} onOpenLink={onOpenLink} />
          <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.signal.ingestedAt')}</p>
              <p className="mt-1 text-sm text-foreground">{shortDate(page.createdAt) || t('wiki.none')}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.signal.updatedAt')}</p>
              <p className="mt-1 text-sm text-foreground">{shortDate(page.updatedAt) || t('wiki.none')}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.signal.evolvedAtLabel')}</p>
              <p className="mt-1 text-sm text-foreground">{shortDate(page.evolveCheckedAt) || t('wiki.none')}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.signal.changedAtLabel')}</p>
              <p className="mt-1 text-sm text-foreground">
                {changedByEvolve ? shortDate(page.evolveChangedAt || page.evolvedAt) : t('wiki.signal.noEvolveChange')}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.signal.evidence')}</p>
              <p className="mt-1 text-sm text-foreground">
                {changedByEvolve && page.evolveChangeSummary ? page.evolveChangeSummary : t('wiki.signal.checkedOnly')}
              </p>
              {page.evolveSource ? (
                <p className="mt-1 text-xs text-muted-foreground">{t('wiki.signal.evidenceSource', { source: page.evolveSource })}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.backlinks')}</p>
              <p className="mt-1 text-sm text-foreground">{page.backlinks.length ? page.backlinks.join(', ') : t('wiki.none')}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.links')}</p>
              <p className="mt-1 text-sm text-foreground">{page.links.length ? page.links.join(', ') : t('wiki.none')}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t('wiki.citations')}</p>
              <p className="mt-1 text-sm text-foreground">
                {page.citations.length ? page.citations.map((item) => item.sourceUrl || item.sourcePath || item.title).join(', ') : t('wiki.none')}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function WikiPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<WikiStatusPayload | null>(null)
  const [pages, setPages] = useState<WikiPageSummary[]>([])
  const [selectedPage, setSelectedPage] = useState<WikiPageDetail | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<WikiSearchResult[]>([])
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState<WikiQueryPayload | null>(null)
  const [synthesisResult, setSynthesisResult] = useState<WikiSynthesizePayload | null>(null)
  const [ingestTitle, setIngestTitle] = useState('')
  const [ingestSource, setIngestSource] = useState('')
  const [ingestContent, setIngestContent] = useState('')
  const [pendingUrlInput, setPendingUrlInput] = useState<WikiIngestPayload | null>(null)
  const [linkChoiceNotice, setLinkChoiceNotice] = useState<string | null>(null)
  const [searchSubmitted, setSearchSubmitted] = useState(false)
  const [lintResult, setLintResult] = useState<WikiLintPayload | null>(null)
  const [evolveResult, setEvolveResult] = useState<WikiEvolvePayload | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visiblePages = searchSubmitted ? searchResults : pages
  const bonusStats = useMemo(() => {
    const generated = pages.filter((page) => page.type === 'synthesis').length
    const sources = pages.filter((page) => page.type === 'source').length
    const checked = pages.filter((page) => Boolean(page.evolveCheckedAt)).length
    const maintenanceChanged = pages.filter((page) => Boolean(page.evolveChangedAt || page.evolveChangeSummary)).length
    const evolved = pages.filter(hasEvolveChange).length
    return { generated, sources, checked, maintenanceChanged, evolved }
  }, [pages])

  const loadWiki = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [statusRes, pagesRes] = await Promise.all([wikiStatusResult(), wikiPagesResult()])
    if (!statusRes.success || !statusRes.data) setError(statusRes.error || t('wiki.loadFailed'))
    else setStatus(statusRes.data)
    if (!pagesRes.success) setError(pagesRes.error || t('wiki.loadFailed'))
    else setPages(pagesRes.data ?? [])
    setLoading(false)
  }, [t])

  const openPage = useCallback(async (pageId: string) => {
    setActionLoading(`page:${pageId}`)
    setError(null)
    const result = await wikiPageResult(pageId)
    if (result.success && result.data) {
      setSelectedPage(result.data)
      setDetailOpen(true)
    } else {
      const matched = pages.find((page) => page.title === pageId || page.id === pageId)
      if (matched) {
        const retry = await wikiPageResult(matched.id)
        if (retry.success && retry.data) {
          setSelectedPage(retry.data)
          setDetailOpen(true)
        }
        else setError(retry.error || t('wiki.loadFailed'))
      } else {
        setError(result.error || t('wiki.loadFailed'))
      }
    }
    setActionLoading(null)
  }, [pages, t])

  useEffect(() => {
    void loadWiki()
  }, [loadWiki])

  async function handleSearch() {
    const query = searchText.trim()
    setActionLoading('search')
    setError(null)
    if (!query) {
      setSearchResults([])
      setSearchSubmitted(false)
      setActionLoading(null)
      return
    }
    const result = await wikiSearchResult(query, { limit: 20 })
    if (result.success) {
      setSearchSubmitted(true)
      setSearchResults(result.data ?? [])
    }
    else setError(result.error || t('wiki.searchFailed'))
    setActionLoading(null)
  }

  async function submitIngest(confirmUrlIngest = false) {
    setActionLoading('ingest')
    setError(null)
    setPendingUrlInput(null)
    setLinkChoiceNotice(null)
    const source = ingestSource.trim()
    const result = await wikiIngestResult({
      title: ingestTitle.trim() || undefined,
      content: ingestContent.trim() || (isLikelyUrl(source) ? undefined : source),
      sourceUrl: isLikelyUrl(source) ? source : undefined,
      sourcePath: source && !isLikelyUrl(source) ? source : undefined,
      sourceType: isLikelyUrl(source) ? 'url' : source ? 'file' : 'manual',
      pageType: 'source',
      confirmUrlIngest,
    })
    if (result.success && result.data) {
      if (result.data.confirmationRequired) {
        setPendingUrlInput(result.data)
      } else {
        if (result.data.evolve) setEvolveResult(result.data.evolve)
        await loadWiki()
        if (result.data.page) await openPage(result.data.page.id)
      }
    } else {
      setError(result.error || t('wiki.ingestFailed'))
    }
    setActionLoading(null)
  }

  async function handleQuery() {
    const query = queryText.trim()
    if (!query) return
    setActionLoading('query')
    setError(null)
    const result = await wikiQueryResult(query, { limit: 6 })
    if (result.success && result.data) {
      setQueryResult(result.data)
      setSynthesisResult(null)
    }
    else setError(result.error || t('wiki.queryFailed'))
    setActionLoading(null)
  }

  async function handleSynthesize() {
    const query = (queryResult?.query || queryText).trim()
    if (!query) return
    setActionLoading('synthesize')
    setError(null)
    const result = await wikiSynthesizeResult({ query, limit: 5 })
    if (result.success && result.data) {
      setSynthesisResult(result.data)
      if (result.data.evolve) setEvolveResult(result.data.evolve)
      await loadWiki()
      await openPage(result.data.page.id)
    } else {
      setError(result.error || t('wiki.synthesizeFailed'))
    }
    setActionLoading(null)
  }

  async function handleLint() {
    setActionLoading('lint')
    setError(null)
    const result = await wikiLintResult()
    if (result.success && result.data) {
      setLintResult(result.data)
      await loadWiki()
    } else {
      setError(result.error || t('wiki.lintFailed'))
    }
    setActionLoading(null)
  }

  async function handleEvolve() {
    setActionLoading('evolve')
    setError(null)
    const result = await wikiEvolveResult()
    if (result.success && result.data) {
      setEvolveResult(result.data)
      await loadWiki()
    } else {
      setError(result.error || t('wiki.evolveFailed'))
    }
    setActionLoading(null)
  }

  const stats = useMemo(() => [
    { label: t('wiki.statPages'), value: String(status?.pageCount ?? 0), icon: FileText },
    { label: t('wiki.statSources'), value: String(status?.sourceCount ?? 0), icon: Link2 },
    { label: t('wiki.statStale'), value: String(status?.staleCount ?? 0), icon: AlertTriangle, hint: t('wiki.statStaleHint') },
    { label: t('wiki.statEngine'), value: status?.memory.engine ?? '-', icon: ShieldCheck },
  ], [status, t])

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="page-kicker">{t('wiki.kicker')}</p>
          <h1 className="page-title">{t('wiki.title')}</h1>
          <p className="page-subtitle">{t('wiki.subtitle')}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50"
          onClick={() => void loadWiki()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="surface-card flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{item.label}</span>
                  {'hint' in item && item.hint ? (
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        aria-label={item.hint}
                      >
                        <CircleHelp className="h-3.5 w-3.5" />
                      </button>
                      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-left text-[11px] leading-4 text-popover-foreground shadow-lg group-focus-within:block group-hover:block">
                        {item.hint}
                      </span>
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm font-semibold text-foreground">{item.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      <section className="surface-card space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="section-title">{t('wiki.bonusTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('wiki.bonusSubtitle')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 p-3">
            <p className="text-2xl font-semibold text-violet-700 dark:text-violet-200">{bonusStats.generated}</p>
            <p className="mt-1 text-xs font-medium text-violet-800 dark:text-violet-200">{t('wiki.bonusGenerated')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('wiki.bonusGeneratedHint')}</p>
          </div>
          <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3">
            <p className="text-2xl font-semibold text-sky-700 dark:text-sky-200">{bonusStats.sources}</p>
            <p className="mt-1 text-xs font-medium text-sky-800 dark:text-sky-200">{t('wiki.bonusSources')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('wiki.bonusSourcesHint')}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-200">{bonusStats.checked}</p>
            <p className="mt-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">{t('wiki.bonusChecked')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('wiki.bonusCheckedHint', {
                changed: bonusStats.maintenanceChanged,
                evolved: bonusStats.evolved,
              })}
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
            <p className="text-2xl font-semibold text-amber-700 dark:text-amber-200">{status?.conflictCount ?? 0}</p>
            <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">{t('wiki.bonusIssues')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('wiki.bonusIssuesHint')}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="surface-card space-y-3">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-primary" />
              <h2 className="section-title">{t('wiki.ingestTitle')}</h2>
            </div>
            <input
              value={ingestTitle}
              onChange={(event) => setIngestTitle(event.target.value)}
              placeholder={t('wiki.ingestTitlePlaceholder')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={ingestSource}
              onChange={(event) => setIngestSource(event.target.value)}
              placeholder={t('wiki.ingestSourcePlaceholder')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={ingestContent}
              onChange={(event) => setIngestContent(event.target.value)}
              placeholder={t('wiki.ingestContentPlaceholder')}
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {pendingUrlInput ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <p className="text-amber-700 dark:text-amber-300">{t('wiki.urlConfirmation')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg bg-primary px-3 py-2 text-xs text-white" onClick={() => void submitIngest(true)}>
                    {t('wiki.confirmIngest')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-2 text-xs"
                    onClick={() => {
                      setPendingUrlInput(null)
                      setLinkChoiceNotice(t('wiki.summarizeOnceNotice'))
                    }}
                  >
                    {t('wiki.summarizeOnce')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-2 text-xs"
                    onClick={() => {
                      setPendingUrlInput(null)
                      setLinkChoiceNotice(t('wiki.currentConversationOnlyNotice'))
                    }}
                  >
                    {t('wiki.currentConversationOnly')}
                  </button>
                  <button type="button" className="rounded-lg border border-border px-3 py-2 text-xs" onClick={() => setPendingUrlInput(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : null}
            {linkChoiceNotice ? (
              <p className="rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground">{linkChoiceNotice}</p>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void submitIngest(false)}
              disabled={actionLoading === 'ingest'}
            >
              {actionLoading === 'ingest' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {t('wiki.ingest')}
            </button>
        </section>

        <section className="surface-card space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="section-title">{t('wiki.queryTitle')}</h2>
            </div>
            <div className="flex gap-2">
              <input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleQuery()
                }}
                placeholder={t('wiki.queryPlaceholder')}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void handleQuery()}
                disabled={actionLoading === 'query'}
              >
                {actionLoading === 'query' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t('wiki.ask')}
              </button>
            </div>
            {queryResult ? (
              <div className="rounded-lg border border-border bg-background/70 p-3 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">{queryResult.answer}</p>
                {queryResult.offerToSave ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-primary">{t('wiki.offerToSave')}</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                      onClick={() => void handleSynthesize()}
                      disabled={actionLoading === 'synthesize'}
                    >
                      {actionLoading === 'synthesize' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {t('wiki.saveSynthesis')}
                    </button>
                  </div>
                ) : null}
                {synthesisResult ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('wiki.synthesisSaved', { title: synthesisResult.title })}
                  </p>
                ) : null}
              </div>
            ) : null}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,1.15fr)_minmax(280px,0.85fr)]">
        <section className="surface-card space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <h2 className="section-title">{t('wiki.searchTitle')}</h2>
          </div>
          <div className="flex gap-2">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSearch()
              }}
              placeholder={t('wiki.searchPlaceholder')}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void handleSearch()}
              disabled={actionLoading === 'search'}
            >
              {actionLoading === 'search' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {t('wiki.search')}
            </button>
          </div>
          {searchSubmitted ? (
            <button
              type="button"
              className="text-xs text-primary"
              onClick={() => {
                setSearchSubmitted(false)
                setSearchResults([])
              }}
            >
              {t('wiki.clearSearch')}
            </button>
          ) : null}
          <PageList pages={visiblePages} selectedId={detailOpen ? selectedPage?.id ?? null : null} onSelect={(id) => void openPage(id)} />
        </section>

        <section className="surface-card space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" onClick={() => void handleLint()}>
                {actionLoading === 'lint' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
                {t('wiki.runLint')}
              </button>
              <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" onClick={() => void handleEvolve()}>
                {actionLoading === 'evolve' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                {t('wiki.runEvolve')}
              </button>
            </div>
            {lintResult ? (
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {t('wiki.lintSummary', { count: lintResult.issueCount })}
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {lintResult.issues.slice(0, 5).map((issue) => (
                    <li key={issue.id}>{issue.title}: {issue.detail}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {evolveResult ? (
              <div className="rounded-lg border border-border bg-background/70 p-3 text-sm text-muted-foreground">
                <p>{t('wiki.evolveSummary', { pages: evolveResult.pageCount, stale: evolveResult.staleCount })}</p>
                <p className="mt-1 text-xs">
                  {t('wiki.evolveDetails', {
                    changed: evolveResult.changedPageIds.length,
                    conflicts: evolveResult.conflictCount,
                    related: Object.keys(evolveResult.related).length,
                  })}
                </p>
                <p className="mt-1 text-xs">
                  {evolveResult.changedPageIds.length > 0
                    ? t('wiki.evolveChangedEvidence', { count: evolveResult.changedPageIds.length })
                    : t('wiki.evolveCheckedOnly')}
                </p>
                {evolveResult.warnings.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-xs text-amber-600 dark:text-amber-300">
                    {evolveResult.warnings.map((warning) => (
                      <li key={warning}>{evolveWarningText(warning, evolveResult, t)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
        </section>
      </div>

      <PageDetailModal
        page={detailOpen ? selectedPage : null}
        onClose={() => setDetailOpen(false)}
        onOpenLink={(target) => void openPage(target)}
      />
    </div>
  )
}
