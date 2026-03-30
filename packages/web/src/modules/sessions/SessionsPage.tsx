import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoadingState } from '@/shared/components/LoadingState'
import {
  getSessions,
  cleanupSessions,
  type SessionsData,
  type SessionInfo,
} from '@/shared/adapters/sessions'
import {
  MessageCircle,
  Trash2,
  RefreshCw,
  Filter,
  Cpu,
  Clock,
  Zap,
} from 'lucide-react'

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

function isActive(session: SessionInfo): boolean {
  if (session.ageMs > 0) return session.ageMs < ACTIVE_THRESHOLD_MS
  if (session.updatedAt > 0) return Date.now() - session.updatedAt < ACTIVE_THRESHOLD_MS
  return false
}

function formatRelativeTime(session: SessionInfo): string {
  const ms = session.ageMs > 0 ? session.ageMs : (session.updatedAt > 0 ? Date.now() - session.updatedAt : 0)
  if (ms <= 0) return '-'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function tokenPercentage(total: number, context: number): number {
  if (context <= 0) return 0
  return Math.min(Math.round((total / context) * 100), 100)
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function SessionsPage() {
  return (
    <ErrorBoundary>
      <SessionsContent />
    </ErrorBoundary>
  )
}

function SessionsContent() {
  const { t } = useTranslation()
  const [cleaning, setCleaning] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<string>('')

  const { data, loading, error, refetch } = useAdapterCall<SessionsData>(
    () => getSessions(),
    { pollInterval: 30000 },
  )

  const agentIds = useMemo(() => {
    if (!data?.sessions) return []
    const ids = new Set(data.sessions.map((s) => s.agentId).filter(Boolean))
    return Array.from(ids).sort()
  }, [data])

  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return []
    if (!selectedAgent) return data.sessions
    return data.sessions.filter((s) => s.agentId === selectedAgent)
  }, [data, selectedAgent])

  const handleCleanup = useCallback(async () => {
    setCleaning(true)
    try {
      await cleanupSessions()
      await refetch()
    } finally {
      setCleaning(false)
    }
  }, [refetch])

  if (loading && !data) {
    return <LoadingState message={t('sessions.title')} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t('sessions.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 border border-border rounded hover:bg-accent"
            title={t('common.refresh') ?? 'Refresh'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded hover:bg-accent disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {cleaning ? t('sessions.cleaning') : t('sessions.cleanup')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded text-sm"
          >
            <option value="">{t('sessions.allAgents')}</option>
            {agentIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredSessions.length} / {data?.count ?? 0} {t('sessions.title').toLowerCase()}
        </span>
      </div>

      {/* Error state */}
      {error && !data && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 border border-border rounded hover:bg-accent"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Empty state */}
      {data && filteredSessions.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      )}

      {/* Session grid */}
      {filteredSessions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSessions.map((session) => (
            <SessionCard key={session.key || session.sessionId} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ session }: { session: SessionInfo }) {
  const { t } = useTranslation()
  const active = isActive(session)
  const pct = tokenPercentage(session.totalTokens, session.contextTokens)

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Top row: key + active indicator */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {active && (
              <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" title={t('sessions.active')} />
            )}
            <span className="font-mono text-sm font-medium truncate" title={session.key}>
              {session.key || session.sessionId}
            </span>
          </div>
        </div>
        <KindBadge kind={session.kind} t={t} />
      </div>

      {/* Agent + Model row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5" title={t('sessions.agent')}>
          <Zap className="w-3.5 h-3.5" />
          <span className="truncate max-w-[120px]">{session.agentId || '-'}</span>
        </span>
        <span className="flex items-center gap-1.5" title={t('sessions.model')}>
          <Cpu className="w-3.5 h-3.5" />
          <span className="truncate max-w-[160px]">{session.model || '-'}</span>
        </span>
      </div>

      {/* Token usage bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('sessions.tokenUsage')}</span>
          <span>
            {formatTokenCount(session.totalTokens)} / {formatTokenCount(session.contextTokens)}
            {session.contextTokens > 0 && (
              <span className="ml-1">({pct}%)</span>
            )}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {session.contextTokens > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {t('sessions.tokens')}: {formatTokenCount(session.inputTokens)} in / {formatTokenCount(session.outputTokens)} out
            </span>
            <span>{t('sessions.contextWindow')}: {formatTokenCount(session.contextTokens)}</span>
          </div>
        )}
      </div>

      {/* Last active */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>{t('sessions.lastActive')}: {formatRelativeTime(session)} ago</span>
        {session.modelProvider && (
          <>
            <span className="mx-1">|</span>
            <span>{session.modelProvider}</span>
          </>
        )}
      </div>
    </div>
  )
}

function KindBadge({ kind, t }: { kind: string; t: (key: string) => string }) {
  const isDirect = kind === 'direct'
  const label = isDirect ? t('sessions.kind.direct') : kind === 'channel' ? t('sessions.kind.channel') : kind

  return (
    <span
      className={`flex-shrink-0 px-2 py-0.5 text-xs rounded-full ${
        isDirect
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      }`}
    >
      {label}
    </span>
  )
}
