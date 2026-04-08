import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoadingState } from '@/shared/components/LoadingState'
import {
  getSessions,
  cleanupSessions,
  getSessionDetail,
  type SessionsData,
  type SessionInfo,
  type SessionDetail,
  type TurnInfo,
} from '@/shared/adapters/sessions'
import {
  MessageCircle,
  Trash2,
  RefreshCw,
  Filter,
  Cpu,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Loader2,
  Wrench,
  AlertTriangle,
} from 'lucide-react'

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000

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
  return `${Math.floor(hours / 24)}d`
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

function formatTimestamp(ts: number): string {
  if (ts <= 0) return '-'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

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
    <div className="page-shell page-shell-medium">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{filteredSessions.length} / {data?.count ?? 0}</span>
            <span>{t('sessions.allAgents')}</span>
          </div>
          <h1 className="page-title">{t('sessions.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="button-secondary p-2"
            title={t('common.refresh') ?? 'Refresh'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="button-secondary disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {cleaning ? t('sessions.cleaning') : t('sessions.cleanup')}
          </button>
        </div>
      </div>

      <div id="sessions-toolbar" className="toolbar-card">
        <div className="toolbar-group">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="control-select sm:w-auto"
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
        <div className="state-panel">
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
        <div className="state-panel">
          <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      )}

      {filteredSessions.length > 0 && (
        <div className="space-y-4">
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.key || session.sessionId}
              session={session}
              expanded={expandedKey === session.key}
              onToggle={() => setExpandedKey(expandedKey === session.key ? null : session.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({
  session,
  expanded,
  onToggle,
}: {
  session: SessionInfo
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const active = isActive(session)
  const pct = tokenPercentage(session.totalTokens, session.contextTokens)

  return (
    <div className={`list-card transition-colors ${expanded ? 'border-primary/40' : 'border-border'}`}>
      <div className="cursor-pointer rounded-t-[1rem] p-4 hover:bg-accent/20" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2 mb-3">
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
          <div className="flex items-center gap-2">
            <KindBadge kind={session.kind} t={t} />
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Agent + Model row */}
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5" title={t('sessions.agent')}>
            <Zap className="w-3.5 h-3.5" />
            <span className="truncate">{session.agentId || '-'}</span>
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5" title={t('sessions.model')}>
            <Cpu className="w-3.5 h-3.5" />
            <span className="truncate">{session.model || '-'}</span>
          </span>
          {session.modelProvider && (
            <span className="text-xs">{session.modelProvider}</span>
          )}
        </div>

        {/* Token usage bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('sessions.tokenUsage')}</span>
            <span>
              {formatTokenCount(session.totalTokens)} / {formatTokenCount(session.contextTokens)}
              {session.contextTokens > 0 && <span className="ml-1">({pct}%)</span>}
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
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {t('sessions.tokens')}: {formatTokenCount(session.inputTokens)} in / {formatTokenCount(session.outputTokens)} out
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(session)} ago
            </span>
          </div>
        </div>
      </div>

      {/* Expanded: conversation history */}
      {expanded && (
        <ConversationHistory sessionKey={session.key} />
      )}
    </div>
  )
}

function ConversationHistory({ sessionKey }: { sessionKey: string }) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch on mount / when sessionKey changes
  useEffect(() => {
    let cancelled = false
    getSessionDetail(sessionKey).then((result) => {
      if (cancelled) return
      if (result.success && result.data) {
        setDetail(result.data)
      } else {
        setError(result.error ?? 'Failed to load')
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [sessionKey])

  if (loading) {
    return (
      <div className="border-t border-border px-4 py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="border-t border-border px-4 py-4 text-sm text-muted-foreground text-center">
        {error || t('sessions.noHistory')}
      </div>
    )
  }

  return (
    <div className="border-t border-border">
      {/* Summary row */}
      <div className="px-4 py-3 flex items-center gap-4 text-xs text-muted-foreground bg-muted/30 flex-wrap">
        <span className="flex items-center gap-1">
          <DollarSign className="w-3 h-3" />
          ${detail.estimatedUsd.toFixed(4)}
        </span>
        <span>{detail.turns.length} {t('sessions.turns')}</span>
        {detail.durationMin > 0 && (
          <span>{detail.durationMin} {t('observe.minutes')}</span>
        )}
        {detail.compactionCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
            {detail.compactionCount} {t('observe.compactionCount').toLowerCase()}
          </span>
        )}
      </div>

      {/* Turn timeline */}
      <div className="px-4 py-3 space-y-0">
        {detail.turns.map((turn) => (
          <TurnRow key={turn.turnIndex} turn={turn} t={t} />
        ))}
      </div>
    </div>
  )
}

function TurnRow({ turn, t }: { turn: TurnInfo; t: (key: string) => string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      {/* Turn number */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
        {turn.turnIndex}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="font-mono">{formatTimestamp(turn.timestamp)}</span>
          <span>{formatTokenCount(turn.inputTokensDelta)} in / {formatTokenCount(turn.outputTokensDelta)} out</span>
          {turn.estimatedUsd > 0 && (
            <span>${turn.estimatedUsd.toFixed(4)}</span>
          )}
          {turn.compactOccurred && (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-3 h-3" />
              {t('sessions.compacted')}
            </span>
          )}
        </div>
        {turn.tools.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Wrench className="w-3 h-3 text-muted-foreground" />
            {turn.tools.map((tool) => (
              <span key={tool} className="px-1.5 py-0.5 text-xs bg-muted rounded font-mono">
                {tool}
              </span>
            ))}
          </div>
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
