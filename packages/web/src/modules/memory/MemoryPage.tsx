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
  ManagedMemoryBridgeStatusPayload,
  ManagedMemoryImportStatusPayload,
  ManagedMemoryListPayload,
  ManagedMemorySearchHit,
  ManagedMemoryStatsPayload,
  ManagedMemoryStatusPayload,
  OpenclawMemoryFileEntry,
  OpenclawMemoryFilesPayload,
  OpenclawMemorySearchCapabilityPayload,
  OpenclawMemoryStatusPayload,
} from '@/lib/types'
import { getIsTauri } from '@/shared/adapters/platform'
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

function isKnownLegacyMemoryUnsupported(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("unknown command 'memory'") ||
    (lower.includes('requires node >=') && lower.includes('upgrade node and re-run openclaw'))
  )
}

export default function MemoryPage() {
  const { t } = useTranslation()
  const isTauri = getIsTauri()
  const [managedUserId, setManagedUserId] = useState('')
  const [managedAgentId, setManagedAgentId] = useState('')
  const [managedQuery, setManagedQuery] = useState('')
  const [managedContent, setManagedContent] = useState('')
  const [managedHits, setManagedHits] = useState<ManagedMemorySearchHit[] | null>(null)
  const [managedSearchLoading, setManagedSearchLoading] = useState(false)
  const [managedSearchErr, setManagedSearchErr] = useState<string | null>(null)
  const [managedMutationLoading, setManagedMutationLoading] = useState(false)
  const [managedImportLoading, setManagedImportLoading] = useState(false)
  const [managedBridgeSyncLoading, setManagedBridgeSyncLoading] = useState(false)
  const [comparisonQuery, setComparisonQuery] = useState('')
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [comparisonManagedHits, setComparisonManagedHits] = useState<ManagedMemorySearchHit[] | null>(null)
  const [comparisonOpenclawHits, setComparisonOpenclawHits] = useState<OpenclawMemoryHit[] | null>(null)
  const [agentFilter, setAgentFilter] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<OpenclawMemoryHit[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null)
  const [reindexLoading, setReindexLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const managedStatusFetcher = useCallback(async () => platformResults.managedMemoryStatus(), [])
  const managedBridgeStatusFetcher = useCallback(async () => platformResults.managedMemoryBridgeStatus(), [])
  const managedStatsFetcher = useCallback(async () => platformResults.managedMemoryStats(), [])
  const managedImportStatusFetcher = useCallback(async () => platformResults.managedMemoryImportStatus(), [])
  const managedListFetcher = useCallback(async () => platformResults.managedMemoryList({ limit: 8 }), [])
  const statusFetcher = useCallback(async () => platformResults.openclawMemoryStatus(), [])
  const searchCapabilityFetcher = useCallback(async () => platformResults.openclawMemorySearchCapability(), [])
  const filesFetcher = useCallback(async () => platformResults.openclawMemoryFiles(), [])

  const {
    data: managedStatus,
    loading: managedStatusLoading,
    error: managedStatusErr,
    refetch: refetchManagedStatus,
  } = useAdapterCall<ManagedMemoryStatusPayload>(managedStatusFetcher)

  const {
    data: managedBridgeStatus,
    loading: managedBridgeStatusLoading,
    error: managedBridgeStatusErr,
    refetch: refetchManagedBridgeStatus,
  } = useAdapterCall<ManagedMemoryBridgeStatusPayload>(managedBridgeStatusFetcher)

  const {
    data: managedStats,
    loading: managedStatsLoading,
    error: managedStatsErr,
    refetch: refetchManagedStats,
  } = useAdapterCall<ManagedMemoryStatsPayload>(managedStatsFetcher)

  const {
    data: managedList,
    loading: managedListLoading,
    error: managedListErr,
    refetch: refetchManagedList,
  } = useAdapterCall<ManagedMemoryListPayload>(managedListFetcher)

  const {
    data: managedImportStatus,
    loading: managedImportStatusLoading,
    error: managedImportStatusErr,
    refetch: refetchManagedImportStatus,
  } = useAdapterCall<ManagedMemoryImportStatusPayload>(managedImportStatusFetcher)

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
  const managedMemories = useMemo(
    () => (Array.isArray(managedList?.memories) ? managedList.memories : []),
    [managedList],
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
    if (!stderr || isKnownFtsWarning(stderr) || isKnownLegacyMemoryUnsupported(stderr)) return null
    return stderr
  }, [statusPayload?.stderr])

  const managedSectionError = managedStatusErr || managedStatsErr || managedListErr || managedImportStatusErr
  const managedBridgeReady = !isTauri || managedBridgeStatus?.state === 'ready'
  const managedDesktopBridgePending = isTauri && !managedBridgeReady
  const managedRuntimeInteractive = managedBridgeReady
  const managedRuntimeNote = managedStatus?.provisioned
    ? t('memory.managedProvisionedNote')
    : t('memory.managedUnprovisionedNote')
  const managedRuntimeSummaryNote = managedDesktopBridgePending
    ? t('memory.managedDesktopSyncRequired')
    : managedRuntimeNote
  const managedImportedCount = managedImportStatus?.importedMemoryCount ?? 0
  const managedAvailableSourceCount = managedImportStatus?.availableSourceCount ?? 0
  const managedTrackedSourceCount = managedImportStatus?.trackedSources ?? 0
  const managedOnlyCount = Math.max((managedStats?.totalMemories ?? 0) - managedImportedCount, 0)
  const managedCoverageValue =
    managedAvailableSourceCount > 0
      ? `${managedImportedCount} / ${managedAvailableSourceCount}`
      : t('memory.managedProofNone')
  const comparisonManagedCount = comparisonManagedHits?.length ?? 0
  const comparisonLegacyCount = comparisonOpenclawHits?.length ?? 0
  const comparisonReady = comparisonManagedHits !== null && comparisonOpenclawHits !== null
  const legacySearchMode = searchCapability?.mode ?? 'native'
  const legacyMemoryUnsupported = legacySearchMode === 'unsupported'
  const comparisonValue = comparisonReady
    ? `${comparisonManagedCount} · ${comparisonLegacyCount}`
    : legacyMemoryUnsupported
      ? t('memory.managedProofUnavailableValue')
      : t('memory.managedProofPending')
  const comparisonDelta = comparisonManagedCount - comparisonLegacyCount

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

  async function refreshManagedSection() {
    await Promise.all([
      refetchManagedStatus(),
      refetchManagedBridgeStatus(),
      refetchManagedStats(),
      refetchManagedImportStatus(),
      refetchManagedList(),
    ])
  }

  async function refreshLegacySection() {
    await Promise.all([
      refetchStatus(),
      refetchFiles(),
      refetchSearchCapability(),
    ])
  }

  async function handleSyncManagedBridge() {
    setManagedBridgeSyncLoading(true)
    const result = await platformResults.syncManagedMemoryBridge()
    setManagedBridgeSyncLoading(false)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('memory.managedBridgeSyncFailed') })
      return
    }
    setFeedback({
      tone: result.data?.state === 'ready' ? 'success' : 'error',
      message:
        result.data?.state === 'ready'
          ? t('memory.managedBridgeSyncSuccess')
          : t('memory.managedBridgeSyncDrifted'),
    })
    await Promise.all([refreshManagedSection(), refreshLegacySection()])
  }

  async function handleImportOpenclawMemory() {
    if (!managedRuntimeInteractive) {
      setFeedback({ tone: 'error', message: t('memory.managedDesktopSyncRequired') })
      return
    }
    setManagedImportLoading(true)
    const result = await platformResults.importOpenclawManagedMemory()
    setManagedImportLoading(false)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('memory.managedImportFailed') })
      return
    }
    setFeedback({ tone: 'success', message: t('memory.managedImportSuccess') })
    await refreshManagedSection()
  }

  async function handleComparisonSearch() {
    if (!managedRuntimeInteractive) {
      setComparisonError(t('memory.managedDesktopSyncRequired'))
      setComparisonManagedHits(null)
      setComparisonOpenclawHits(null)
      return
    }
    const trimmed = comparisonQuery.trim()
    if (!trimmed) {
      setComparisonManagedHits([])
      setComparisonOpenclawHits([])
      setComparisonError(null)
      return
    }

    setComparisonLoading(true)
    setComparisonError(null)
    const [managedResult, openclawResult] = await Promise.all([
      platformResults.managedMemorySearch(trimmed, { limit: 6 }),
      platformResults.openclawMemorySearch(trimmed, { maxResults: 6 }),
    ])
    setComparisonLoading(false)

    if (!managedResult.success) {
      setComparisonError(managedResult.error ?? t('memory.managedComparisonFailed'))
      setComparisonManagedHits(null)
      setComparisonOpenclawHits(null)
      return
    }
    if (!openclawResult.success) {
      setComparisonError(openclawResult.error ?? t('memory.managedComparisonFailed'))
      setComparisonManagedHits(null)
      setComparisonOpenclawHits(null)
      return
    }

    setComparisonManagedHits(managedResult.data ?? [])
    setComparisonOpenclawHits(openclawResult.data ?? [])
  }

  async function runManagedSearch() {
    if (!managedRuntimeInteractive) {
      setManagedHits([])
      setManagedSearchErr(t('memory.managedDesktopSyncRequired'))
      return
    }
    const trimmed = managedQuery.trim()
    if (!trimmed) {
      setManagedHits([])
      setManagedSearchErr(null)
      return
    }
    setManagedSearchLoading(true)
    setManagedSearchErr(null)
    const result = await platformResults.managedMemorySearch(trimmed, {
      userId: managedUserId.trim() || undefined,
      agentId: managedAgentId.trim() || undefined,
      limit: 12,
    })
    setManagedSearchLoading(false)
    if (!result.success) {
      setManagedHits(null)
      setManagedSearchErr(result.error ?? t('memory.managedSearchFailed'))
      return
    }
    setManagedHits(result.data ?? [])
  }

  async function handleAddManagedMemory() {
    if (!managedRuntimeInteractive) {
      setFeedback({ tone: 'error', message: t('memory.managedDesktopSyncRequired') })
      return
    }
    const content = managedContent.trim()
    if (!content) {
      setFeedback({ tone: 'error', message: t('memory.managedAddFailed') })
      return
    }

    setManagedMutationLoading(true)
    const result = await platformResults.addManagedMemory({
      content,
      userId: managedUserId.trim() || undefined,
      agentId: managedAgentId.trim() || undefined,
    })
    setManagedMutationLoading(false)

    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('memory.managedAddFailed') })
      return
    }

    setManagedContent('')
    setFeedback({ tone: 'success', message: t('memory.managedAddSuccess') })
    await refreshManagedSection()
  }

  async function handleDeleteManagedMemory(memoryId: string) {
    if (!managedRuntimeInteractive) {
      setFeedback({ tone: 'error', message: t('memory.managedDesktopSyncRequired') })
      return
    }
    setManagedMutationLoading(true)
    const result = await platformResults.deleteManagedMemory(memoryId)
    setManagedMutationLoading(false)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('memory.managedDeleteFailed') })
      return
    }
    if (!result.data?.deleted) {
      setFeedback({ tone: 'error', message: t('memory.managedDeleteMissing') })
      await refreshManagedSection()
      if (managedQuery.trim()) {
        await runManagedSearch()
      }
      return
    }
    setFeedback({ tone: 'success', message: t('memory.managedDeleteSuccess') })
    await refreshManagedSection()
    if (managedQuery.trim()) {
      await runManagedSearch()
    }
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

  const searchMode = legacySearchMode
  const SearchModeIcon =
    searchCapabilityLoading ? LoaderCircle : searchMode === 'native' ? CheckCircle2 : ShieldAlert
  const searchModeBadgeClass =
    searchMode === 'native'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : searchMode === 'fallback'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'border-border/70 bg-muted text-muted-foreground'
  const searchModePanelClass =
    searchMode === 'native'
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : searchMode === 'fallback'
        ? 'border-amber-500/20 bg-amber-500/5'
        : 'border-border/70 bg-muted/30'
  const searchModeLabel = searchCapabilityLoading
    ? t('memory.searchModeChecking')
    : searchMode === 'fallback'
      ? t('memory.searchModeFallback')
      : searchMode === 'unsupported'
        ? t('memory.searchModeUnsupported')
      : t('memory.searchModeNative')
  const searchModeHelp = searchCapabilityLoading
    ? t('memory.searchModeLoadingHelp')
    : searchMode === 'fallback'
      ? t('memory.searchModeFallbackHelp')
      : searchMode === 'unsupported'
        ? t('memory.searchModeUnsupportedHelp')
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
          <div className="surface-card space-y-4" id="memory-managed">
            <div className="section-heading">
              <div>
                <h3 className="section-title">{t('memory.managedFoundationTitle')}</h3>
                <p className="text-sm text-muted-foreground">{t('memory.managedFoundationHelp')}</p>
              </div>
              <button type="button" onClick={() => void refreshManagedSection()} className="button-secondary">
                <RefreshCw className="h-4 w-4" />
                <span>{t('common.refresh')}</span>
              </button>
            </div>

            <div className="section-subcard space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="text-sm font-medium text-foreground">{t('memory.managedBridgeTitle')}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{t('memory.managedBridgeHelp')}</p>
                </div>
                <button
                  type="button"
                  disabled={
                    managedBridgeSyncLoading
                    || managedBridgeStatusLoading
                    || managedBridgeStatus?.state === 'unsupported'
                  }
                  onClick={() => void handleSyncManagedBridge()}
                  className="button-secondary shrink-0 disabled:opacity-50"
                >
                  <Wrench className={`h-4 w-4 ${managedBridgeSyncLoading ? 'animate-spin' : ''}`} />
                  <span>
                    {managedBridgeSyncLoading ? t('memory.managedBridgeSyncing') : t('memory.managedBridgeSyncAction')}
                  </span>
                </button>
              </div>

              {managedBridgeStatusLoading ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : managedBridgeStatusErr ? (
                <p className="text-sm text-red-500">{managedBridgeStatusErr}</p>
              ) : managedBridgeStatus ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        managedBridgeStatus.state === 'ready'
                          ? 'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                          : managedBridgeStatus.state === 'unsupported'
                            ? 'inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400'
                            : 'inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
                      }
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        {managedBridgeStatus.state === 'ready'
                          ? t('memory.managedBridgeReady')
                          : managedBridgeStatus.state === 'unsupported'
                            ? t('memory.managedBridgeUnsupported')
                            : t('memory.managedBridgeNeedsSync')}
                      </span>
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {managedBridgeStatus.pluginId}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {managedBridgeStatus.installed
                        ? t('memory.managedBridgeInstalled')
                        : t('memory.managedBridgeNotInstalled')}
                    </span>
                  </div>

                  <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
                    <p>
                      {t('memory.managedBridgeSlotLabel')}: <span className="font-mono">{managedBridgeStatus.currentSlotValue ?? '—'}</span>
                    </p>
                    <p>
                      {t('memory.managedBridgeRuntimePathLabel')}:{' '}
                      <span className="font-mono break-all">{managedBridgeStatus.runtimePluginPath ?? '—'}</span>
                    </p>
                    <p>
                      {t('memory.managedBridgePluginPathLabel')}:{' '}
                      <span className="font-mono break-all">{managedBridgeStatus.pluginPath}</span>
                    </p>
                    <p>
                      {t('memory.managedBridgeDataRootLabel')}:{' '}
                      <span className="font-mono break-all">{managedBridgeStatus.desired.entry?.config.dataRoot ?? '—'}</span>
                    </p>
                  </div>

                  {managedBridgeStatus.issues.length > 0 ? (
                    <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {t('memory.managedBridgeIssuesTitle')}
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {managedBridgeStatus.issues.map((issue) => (
                          <li key={issue} className="list-disc ml-5">
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {managedStatusLoading || managedStatsLoading || managedImportStatusLoading || managedListLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : managedSectionError ? (
              <div className="space-y-2">
                <p className="text-sm text-red-500">{managedSectionError}</p>
                <p className="text-xs text-muted-foreground">{t('memory.managedFoundationUnavailable')}</p>
              </div>
            ) : managedStatus && managedStats && managedImportStatus && managedList ? (
              <>
                <div className={managedRuntimeInteractive
                  ? 'rounded-[1.15rem] border border-emerald-500/20 bg-emerald-500/5 px-4 py-3'
                  : 'rounded-[1.15rem] border border-border/70 bg-background/70 px-4 py-3'}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={managedRuntimeInteractive
                          ? 'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                          : 'inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{managedRuntimeInteractive ? t('memory.managedReadyBadge') : t('memory.managedBridgeNeedsSync')}</span>
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {managedStats.engine}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {managedStats.storageType}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{managedRuntimeSummaryNote}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
                    <p>
                      {t('memory.managedProfileLabel')}: <span className="font-mono">{managedStatus.profileKey}</span>
                    </p>
                    <p>
                      {t('memory.managedRuntimeRootLabel')}:{' '}
                      <span className="font-mono break-all">{managedStatus.runtimeRoot}</span>
                    </p>
                    <p>
                      {t('memory.managedDbPathLabel')}: <span className="font-mono break-all">{managedStatus.storagePath}</span>
                    </p>
                  </div>
                </div>

                <div className="section-subcard space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{t('memory.managedImportTitle')}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{t('memory.managedImportHelp')}</p>
                    </div>
                    <button
                      type="button"
                      disabled={managedImportLoading || !managedRuntimeInteractive}
                      onClick={() => void handleImportOpenclawMemory()}
                      className="button-secondary shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${managedImportLoading ? 'animate-spin' : ''}`} />
                      <span>{managedImportLoading ? t('memory.managedImporting') : t('memory.managedImportAction')}</span>
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportAvailableSources')}</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{managedImportStatus.availableSourceCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportTrackedSources')}</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{managedImportStatus.trackedSources}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportImportedCount')}</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{managedImportStatus.importedMemoryCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportLastRun')}</p>
                      <p className="mt-2 text-sm text-foreground">
                        {managedImportStatus.lastImportedAt ? new Date(managedImportStatus.lastImportedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                  </div>

                  {managedImportStatus.lastRun ? (
                    <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3">
                      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportScanned')}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{managedImportStatus.lastRun.scanned}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportImported')}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{managedImportStatus.lastRun.imported}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportUpdated')}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{managedImportStatus.lastRun.updated}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportSkipped')}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{managedImportStatus.lastRun.skipped}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportDuplicate')}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{managedImportStatus.lastRun.duplicate}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedImportFailedMetric')}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{managedImportStatus.lastRun.failed}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('memory.managedImportIdle')}</p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="section-subcard">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedStatsTotal')}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{managedStats.totalMemories}</p>
                  </div>
                  <div className="section-subcard">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedStatsUsers')}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{managedStats.userCount}</p>
                  </div>
                  <div className="section-subcard">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('memory.managedStatsStorage')}</p>
                    <p className="mt-3 text-sm font-medium text-foreground">{managedStats.storageType}</p>
                  </div>
                </div>

                <div className="section-subcard space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{t('memory.managedProofTitle')}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{t('memory.managedProofHelp')}</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {t('memory.managedProofCoverageTitle')}
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{managedCoverageValue}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {managedAvailableSourceCount > 0
                          ? t('memory.managedProofCoverageReady', {
                              imported: managedImportedCount,
                              available: managedAvailableSourceCount,
                              tracked: managedTrackedSourceCount,
                            })
                          : t('memory.managedProofCoverageIdle')}
                      </p>
                    </div>

                    <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {t('memory.managedProofDirectTitle')}
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{managedOnlyCount}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {managedOnlyCount > 0
                          ? t('memory.managedProofDirectReady', { count: managedOnlyCount })
                          : t('memory.managedProofDirectIdle')}
                      </p>
                    </div>

                    <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {t('memory.managedProofRecallTitle')}
                      </p>
                      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{comparisonValue}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {legacyMemoryUnsupported
                          ? t('memory.managedProofRecallUnavailable')
                          : comparisonReady
                          ? comparisonDelta > 0
                            ? t('memory.managedProofRecallAhead', {
                                managed: comparisonManagedCount,
                                legacy: comparisonLegacyCount,
                              })
                            : comparisonDelta < 0
                              ? t('memory.managedProofRecallBehind', {
                                  managed: comparisonManagedCount,
                                  legacy: comparisonLegacyCount,
                                })
                              : t('memory.managedProofRecallEven', {
                                  managed: comparisonManagedCount,
                                })
                          : t('memory.managedProofRecallPending')}
                      </p>
                    </div>
                  </div>
                </div>

                {!legacyMemoryUnsupported ? (
                  <div className="section-subcard space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{t('memory.managedComparisonTitle')}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{t('memory.managedComparisonHelp')}</p>
                    </div>

                    <div className="flex flex-col gap-2 lg:flex-row">
                      <input
                        type="text"
                        placeholder={t('memory.managedComparisonPlaceholder')}
                        value={comparisonQuery}
                        onChange={(event) => setComparisonQuery(event.target.value)}
                        disabled={!managedRuntimeInteractive}
                        className="control-input flex-1"
                      />
                      <button
                        type="button"
                        disabled={comparisonLoading || !managedRuntimeInteractive}
                        onClick={() => void handleComparisonSearch()}
                        className="button-secondary shrink-0 disabled:opacity-50"
                      >
                        {comparisonLoading ? t('memory.managedComparisonRunning') : t('memory.managedComparisonAction')}
                      </button>
                    </div>

                    {comparisonError ? <p className="text-sm text-red-500">{comparisonError}</p> : null}
                    {comparisonManagedHits || comparisonOpenclawHits ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-[1rem] border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <h5 className="text-sm font-medium text-foreground">{t('memory.managedComparisonManaged')}</h5>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                              {comparisonManagedHits?.length ?? 0}
                            </span>
                          </div>
                          {comparisonManagedHits && comparisonManagedHits.length > 0 ? (
                            <ul className="mt-3 space-y-3">
                              {comparisonManagedHits.map((hit) => (
                                <li key={hit.memoryId} className="text-sm">
                                  <p className="whitespace-pre-wrap">{hit.content}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">{t('memory.managedComparisonEmptyManaged')}</p>
                          )}
                        </div>

                        <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <h5 className="text-sm font-medium text-foreground">{t('memory.managedComparisonLegacy')}</h5>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {comparisonOpenclawHits?.length ?? 0}
                            </span>
                          </div>
                          {comparisonOpenclawHits && comparisonOpenclawHits.length > 0 ? (
                            <ul className="mt-3 space-y-3">
                              {comparisonOpenclawHits.map((hit) => (
                                <li key={hit.id} className="text-sm">
                                  <p className="whitespace-pre-wrap">{hit.content}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">{t('memory.managedComparisonEmptyLegacy')}</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    placeholder={t('memory.managedUserPlaceholder')}
                    value={managedUserId}
                    onChange={(event) => setManagedUserId(event.target.value)}
                    disabled={!managedRuntimeInteractive}
                    className="control-input"
                  />
                  <input
                    type="text"
                    placeholder={t('memory.managedAgentPlaceholder')}
                    value={managedAgentId}
                    onChange={(event) => setManagedAgentId(event.target.value)}
                    disabled={!managedRuntimeInteractive}
                    className="control-input"
                  />
                </div>

                <textarea
                  placeholder={t('memory.managedContentPlaceholder')}
                  value={managedContent}
                  onChange={(event) => setManagedContent(event.target.value)}
                  disabled={!managedRuntimeInteractive}
                  className="control-input min-h-28 resize-y"
                />

                <div className="flex flex-col gap-2 lg:flex-row">
                  <input
                    type="text"
                    placeholder={t('memory.managedSearchPlaceholder')}
                    value={managedQuery}
                    onChange={(event) => setManagedQuery(event.target.value)}
                    disabled={!managedRuntimeInteractive}
                    className="control-input flex-1"
                  />
                  <button
                    type="button"
                    disabled={managedMutationLoading || !managedRuntimeInteractive}
                    onClick={() => void handleAddManagedMemory()}
                    className="button-primary shrink-0 disabled:opacity-50"
                  >
                    {managedMutationLoading ? t('memory.managedAdding') : t('memory.managedAdd')}
                  </button>
                  <button
                    type="button"
                    disabled={managedSearchLoading || !managedRuntimeInteractive}
                    onClick={() => void runManagedSearch()}
                    className="button-secondary shrink-0 disabled:opacity-50"
                  >
                    {managedSearchLoading ? t('memory.searching') : t('memory.search')}
                  </button>
                </div>

                {managedSearchErr ? <p className="text-sm text-red-500">{managedSearchErr}</p> : null}
                {managedHits && managedHits.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-foreground">{t('memory.managedSearchTitle')}</h4>
                    <ul className="space-y-3">
                      {managedHits.map((hit) => (
                        <li key={hit.memoryId} className="list-card bg-background/70 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            {hit.score !== undefined && Number.isFinite(hit.score) ? (
                              <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                                score: {hit.score.toFixed(3)}
                              </span>
                            ) : null}
                            {hit.userId ? (
                              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                user: {hit.userId}
                              </span>
                            ) : null}
                            {hit.agentId ? (
                              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                agent: {hit.agentId}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap">{hit.content}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : managedHits && managedHits.length === 0 && managedQuery.trim() ? (
                  <p className="text-sm text-muted-foreground">{t('memory.managedSearchEmpty')}</p>
                ) : null}

                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">{t('memory.managedRecentTitle')}</h4>
                  {managedMemories.length > 0 ? (
                    <ul className="space-y-3">
                      {managedMemories.map((memory) => (
                        <li key={memory.memoryId} className="list-card bg-background/70 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {memory.userId ? (
                                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                    user: {memory.userId}
                                  </span>
                                ) : null}
                                {memory.agentId ? (
                                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                    agent: {memory.agentId}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 whitespace-pre-wrap">{memory.content}</p>
                              {memory.updatedAt ? (
                                <p className="mt-2 text-xs text-muted-foreground">{new Date(memory.updatedAt).toLocaleString()}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              disabled={managedMutationLoading || !managedRuntimeInteractive}
                              onClick={() => void handleDeleteManagedMemory(memory.memoryId)}
                              className="button-danger shrink-0 px-2 py-1 text-xs disabled:opacity-50"
                              aria-label={`${t('common.delete')} ${memory.memoryId}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('memory.managedEmpty')}</p>
                  )}
                </div>
              </>
            ) : null}
          </div>

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
                {legacyMemoryUnsupported ? (
                  <div className="rounded-[1rem] border border-border/70 bg-muted/30 px-4 py-3">
                    <p className="text-sm text-muted-foreground">{t('memory.openclawUnavailableHelp')}</p>
                    {searchCapability?.detail ? (
                      <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{searchCapability.detail}</p>
                    ) : null}
                  </div>
                ) : statusEntries.length > 0 ? (
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
                  disabled={reindexLoading || legacyMemoryUnsupported}
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
                disabled={legacyMemoryUnsupported}
                className="control-input"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder={t('memory.openclawSearchPlaceholder')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={legacyMemoryUnsupported}
                  className="control-input flex-1"
                />
                <button
                  type="button"
                  disabled={searchLoading || legacyMemoryUnsupported}
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
