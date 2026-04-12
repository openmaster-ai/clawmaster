import { useCallback, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Database,
  FileJson,
  FileText,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { platformResults } from '@/adapters'
import type {
  OpenclawMemoryFileEntry,
  OpenclawMemoryFilesPayload,
  OpenclawMemorySearchCapabilityPayload,
  OpenclawMemoryStatusPayload,
} from '@/lib/types'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { OpenclawMemoryHit } from '@/shared/memoryOpenclawParse'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'

interface NormalizedStatusEntry {
  agentId: string
  backend: string
  dbPath?: string
  workspaceDir?: string
  dirty: boolean
  totalFiles: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStatusEntries(data: unknown): NormalizedStatusEntry[] {
  if (!Array.isArray(data)) return []
  const entries: NormalizedStatusEntry[] = []
  for (const item of data) {
    if (!isRecord(item)) continue
    const status = isRecord(item.status) ? item.status : null
    const scan = isRecord(item.scan) ? item.scan : null
    const agentId = typeof item.agentId === 'string' && item.agentId.trim() ? item.agentId : 'main'
    const backend = typeof status?.backend === 'string' && status.backend.trim() ? status.backend : 'unknown'
    const dbPath = typeof status?.dbPath === 'string' ? status.dbPath : undefined
    const workspaceDir = typeof status?.workspaceDir === 'string' ? status.workspaceDir : undefined
    const dirty = Boolean(status?.dirty)
    const totalFiles = typeof scan?.totalFiles === 'number' ? scan.totalFiles : 0
    entries.push({ agentId, backend, dbPath, workspaceDir, dirty, totalFiles })
  }
  return entries
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function getFileKindLabel(entry: OpenclawMemoryFileEntry, t: (key: string) => string): string {
  switch (entry.kind) {
    case 'sqlite':
      return t('memory.fileKindSqlite')
    case 'journal':
      return t('memory.fileKindJournal')
    case 'json':
      return t('memory.fileKindJson')
    case 'text':
      return t('memory.fileKindText')
    default:
      return t('memory.fileKindOther')
  }
}

function getFileHint(entry: OpenclawMemoryFileEntry, t: (key: string) => string): string | null {
  if (entry.kind === 'sqlite') return t('memory.primaryStoreHint')
  if (entry.kind === 'journal') return t('memory.sidecarHint')
  return null
}

function isKnownFtsWarning(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('fts unavailable') || (lower.includes('fts5') && lower.includes('no such module'))
}

export default function MemoryPage() {
  const { t } = useTranslation()
  const [agentFilter, setAgentFilter] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<OpenclawMemoryHit[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null)
  const [reindexLoading, setReindexLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const statusFetcher = useCallback(async () => platformResults.openclawMemoryStatus(), [])
  const searchCapabilityFetcher = useCallback(async () => platformResults.openclawMemorySearchCapability(), [])
  const filesFetcher = useCallback(async () => platformResults.openclawMemoryFiles(), [])

  const {
    data: statusPayload,
    loading: statusLoading,
    error: statusErr,
    refetch: refetchStatus,
  } = useAdapterCall<OpenclawMemoryStatusPayload>(statusFetcher)

  const {
    data: searchCapability,
    loading: searchCapabilityLoading,
    refetch: refetchSearchCapability,
  } = useAdapterCall<OpenclawMemorySearchCapabilityPayload>(searchCapabilityFetcher)

  const {
    data: filesPayload,
    loading: filesLoading,
    error: filesErr,
    refetch: refetchFiles,
  } = useAdapterCall<OpenclawMemoryFilesPayload>(filesFetcher)

  const statusEntries = useMemo(
    () => normalizeStatusEntries(statusPayload?.data),
    [statusPayload?.data],
  )
  const selectedFile =
    filesPayload?.files.find((entry) => entry.relativePath === selectedFilePath) ?? filesPayload?.files[0] ?? null

  const summary = useMemo(() => {
    const agents = statusEntries.length
    const trackedFiles =
      filesPayload?.files.length ?? statusEntries.reduce((sum, entry) => sum + entry.totalFiles, 0)
    const backends = Array.from(new Set(statusEntries.map((entry) => entry.backend))).filter(Boolean)
    const dirty = statusEntries.some((entry) => entry.dirty)
    return {
      agents,
      trackedFiles,
      backend: backends[0] ?? 'unknown',
      dirty,
    }
  }, [filesPayload?.files.length, statusEntries])

  const visibleStatusWarning = useMemo(() => {
    const stderr = statusPayload?.stderr?.trim()
    if (!stderr || isKnownFtsWarning(stderr)) return null
    return stderr
  }, [statusPayload?.stderr])

  async function handleReindex() {
    setReindexLoading(true)
    try {
      const result = await platformResults.reindexOpenclawMemory()
      if (!result.success) {
        setFeedback({ tone: 'error', message: result.error ?? t('memory.reindexFailed') })
        return
      }
      setFeedback({ tone: 'success', message: t('memory.reindexSuccess') })
      await Promise.all([refetchStatus(), refetchFiles(), refetchSearchCapability()])
    } finally {
      setReindexLoading(false)
    }
  }

  async function runSearch() {
    const trimmed = query.trim()
    if (!trimmed) {
      setHits([])
      setSearchErr(null)
      return
    }
    setSearchLoading(true)
    setSearchErr(null)
    const result = await platformResults.openclawMemorySearch(trimmed, {
      agent: agentFilter.trim() || undefined,
      maxResults: 25,
    })
    setSearchLoading(false)
    if (!result.success) {
      setHits(null)
      setSearchErr(result.error ?? t('memory.searchFailed'))
      return
    }
    setHits(result.data ?? [])
  }

  async function handleDeleteFile(relativePath: string) {
    const result = await platformResults.deleteOpenclawMemoryFile(relativePath)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('memory.fileDeleteFailed') })
      return
    }
    if (selectedFilePath === relativePath) {
      setSelectedFilePath(null)
    }
    setFeedback({ tone: 'success', message: t('memory.fileDeleteSuccess') })
    await refetchFiles()
    await refetchStatus()
  }

  const summaryCards = [
    {
      title: t('memory.summaryAgents'),
      value: String(summary.agents),
      icon: Database,
    },
    {
      title: t('memory.summaryFiles'),
      value: String(summary.trackedFiles),
      icon: HardDrive,
    },
    {
      title: t('memory.summaryBackend'),
      value: summary.backend,
      icon: Search,
    },
    {
      title: t('memory.summaryState'),
      value: summary.dirty ? t('memory.stateNeedsAttention') : t('memory.stateClean'),
      icon: ShieldAlert,
    },
  ]

  const searchMode = searchCapability?.mode ?? 'native'
  const SearchModeIcon =
    searchCapabilityLoading ? LoaderCircle : searchMode === 'fallback' ? ShieldAlert : CheckCircle2
  const searchModeBadgeClass =
    searchMode === 'fallback'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  const searchModePanelClass =
    searchMode === 'fallback'
      ? 'border-amber-500/20 bg-amber-500/5'
      : 'border-emerald-500/20 bg-emerald-500/5'
  const searchModeLabel = searchCapabilityLoading
    ? t('memory.searchModeChecking')
    : searchMode === 'fallback'
      ? t('memory.searchModeFallback')
      : t('memory.searchModeNative')
  const searchModeHelp = searchCapabilityLoading
    ? t('memory.searchModeLoadingHelp')
    : searchMode === 'fallback'
      ? t('memory.searchModeFallbackHelp')
      : t('memory.searchModeNativeHelp')

  return (
    <div className="page-shell page-shell-wide">
      {feedback ? <ActionBanner tone={feedback.tone} message={feedback.message} onDismiss={() => setFeedback(null)} /> : null}

      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('memory.title')}</h1>
          <p className="page-subtitle">{t('memory.subtitleTabs')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refetchStatus()} className="button-secondary">
            <RefreshCw className="h-4 w-4" />
            <span>{t('common.refresh')}</span>
          </button>
          <button type="button" onClick={() => void refetchFiles()} className="button-secondary">
            <HardDrive className="h-4 w-4" />
            <span>{t('memory.sectionFiles')}</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} className="surface-card flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{card.title}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{card.value}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 text-foreground">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,1fr)]">
        <div className="space-y-4">
          <div className="surface-card space-y-4">
            <div className="section-heading">
              <div>
                <h3 className="section-title">{t('memory.sectionStatusOverview')}</h3>
                <p className="text-sm text-muted-foreground">{t('memory.openclawHelp')}</p>
              </div>
            </div>

            {statusLoading ? (
              <p className="text-sm text-muted-foreground">{t('memory.statusLoading')}</p>
            ) : statusErr ? (
              <div className="space-y-2">
                <p className="text-sm text-red-500">{statusErr}</p>
                <button type="button" onClick={() => void refetchStatus()} className="button-secondary px-3 py-1.5 text-sm">
                  {t('memory.retry')}
                </button>
              </div>
            ) : (
              <>
                {statusEntries.length > 0 ? (
                  <div className="grid gap-3">
                    {statusEntries.map((entry) => (
                      <div key={entry.agentId} className="list-card bg-background/70">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {entry.agentId}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                            {entry.backend}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs ${entry.dirty ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                            {entry.dirty ? t('memory.stateNeedsAttention') : t('memory.stateClean')}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                          <div>
                            <p className="text-muted-foreground">{t('memory.workspaceDir')}</p>
                            <p className="break-all font-mono text-xs">{entry.workspaceDir || '—'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t('memory.dbPath')}</p>
                            <p className="break-all font-mono text-xs">{entry.dbPath || '—'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('memory.noStatusEntries')}</p>
                )}
                {visibleStatusWarning ? (
                  <p className="text-xs whitespace-pre-wrap text-amber-600 dark:text-amber-500">{visibleStatusWarning}</p>
                ) : null}
              </>
            )}
          </div>

          <div className="surface-card space-y-4">
            <div className="section-heading">
              <div>
                <h3 className="section-title">{t('memory.openclawSearchLabel')}</h3>
                <p className="text-sm text-muted-foreground">{t('memory.openclawSearchHelp')}</p>
              </div>
            </div>

            <div className={`rounded-[1.15rem] border px-4 py-3 ${searchModePanelClass}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {t('memory.searchModeLabel')}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${searchModeBadgeClass}`}>
                      <SearchModeIcon className={`h-3.5 w-3.5 ${searchCapabilityLoading ? 'animate-spin' : ''}`} />
                      <span>{searchModeLabel}</span>
                    </span>
                  </div>
                  <p className="max-w-2xl text-sm text-muted-foreground">{searchModeHelp}</p>
                </div>
                <button
                  type="button"
                  disabled={reindexLoading}
                  onClick={() => void handleReindex()}
                  className="button-secondary shrink-0 disabled:opacity-50"
                >
                  <Wrench className="h-4 w-4" />
                  <span>{reindexLoading ? t('memory.reindexing') : t('memory.reindex')}</span>
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <input
                type="text"
                placeholder={t('memory.agentPlaceholder')}
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.target.value)}
                className="control-input"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder={t('memory.openclawSearchPlaceholder')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="control-input flex-1"
                />
                <button
                  type="button"
                  disabled={searchLoading}
                  onClick={() => void runSearch()}
                  className="button-primary shrink-0 disabled:opacity-50"
                >
                  {searchLoading ? t('memory.searching') : t('memory.search')}
                </button>
              </div>
            </div>

            {searchErr ? <p className="text-sm text-red-500">{searchErr}</p> : null}
            {hits && hits.length > 0 ? (
              <ul className="space-y-3">
                {hits.map((hit) => (
                  <li key={hit.id} className="list-card bg-background/70 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      {hit.score !== undefined && Number.isFinite(hit.score) ? (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                          score: {hit.score.toFixed(3)}
                        </span>
                      ) : null}
                      {hit.path ? (
                        <span className="break-all font-mono text-[11px] text-muted-foreground">{hit.path}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{hit.content}</p>
                  </li>
                ))}
              </ul>
            ) : hits && hits.length === 0 && query.trim() ? (
              <p className="text-sm text-muted-foreground">{t('memory.noHits')}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card space-y-4">
            <div className="section-heading">
              <div>
                <h3 className="section-title">{t('memory.sectionFiles')}</h3>
                <p className="text-sm text-muted-foreground">{t('memory.sectionFilesHint')}</p>
              </div>
            </div>

            <div className="inline-note space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('memory.storageRoot')}: <span className="font-mono break-all">{filesPayload?.root ?? '—'}</span>
              </p>
            </div>

            {filesLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : filesErr ? (
              <div className="space-y-2">
                <p className="text-sm text-red-500">{filesErr}</p>
                <button type="button" onClick={() => void refetchFiles()} className="button-secondary px-3 py-1.5 text-sm">
                  {t('memory.retry')}
                </button>
              </div>
            ) : filesPayload && filesPayload.files.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  {filesPayload.files.map((entry) => {
                    const selected = selectedFile?.relativePath === entry.relativePath
                    const hint = getFileHint(entry, t)
                    const Icon = entry.kind === 'json' ? FileJson : entry.kind === 'text' ? FileText : Database
                    return (
                      <div
                        key={entry.relativePath}
                        className={`list-card flex items-start justify-between gap-3 ${selected ? 'border-primary/30 bg-primary/5' : 'bg-background/70'}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedFilePath(entry.relativePath)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate font-medium text-foreground">{entry.relativePath}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{getFileKindLabel(entry, t)}</span>
                            <span>{formatBytes(entry.size)}</span>
                            <span>{new Date(entry.modifiedAtMs).toLocaleString()}</span>
                          </div>
                          {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeletePath(entry.relativePath)}
                          className="button-danger shrink-0 px-2 py-1 text-xs"
                          aria-label={`${t('common.delete')} ${entry.relativePath}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {selectedFile ? (
                  <div className="section-subcard space-y-2">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-medium text-foreground">{t('memory.fileDetails')}</h4>
                    </div>
                    <p className="break-all font-mono text-xs text-muted-foreground">{selectedFile.absolutePath}</p>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">{t('memory.fileUpdated')}</p>
                        <p>{new Date(selectedFile.modifiedAtMs).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('memory.fileExtension')}</p>
                        <p>{selectedFile.extension || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('memory.summaryFiles')}</p>
                        <p>{formatBytes(selectedFile.size)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('memory.summaryBackend')}</p>
                        <p>{getFileKindLabel(selectedFile, t)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('memory.sectionFilesEmpty')}</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeletePath)}
        title={pendingDeletePath ? t('memory.fileDeleteConfirm', { path: pendingDeletePath }) : ''}
        tone="danger"
        onCancel={() => setPendingDeletePath(null)}
        onConfirm={() => {
          if (!pendingDeletePath) return
          const target = pendingDeletePath
          setPendingDeletePath(null)
          void handleDeleteFile(target)
        }}
      />
    </div>
  )
}
