import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Copy, RefreshCw, ScrollText, X } from 'lucide-react'
import type { LogEntry } from '@/lib/types'
import { getLogsResult } from '@/shared/adapters/logs'
import { LoadingState } from '@/shared/components/LoadingState'
import { filterLogEntriesByScope, type RecentLogScope } from '@/shared/logScopes'

interface RecentLogsSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  lines?: number
  scope?: RecentLogScope
}

type LogLevelFilter = 'ALL' | LogEntry['level']

const LEVELS: LogLevelFilter[] = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG']

function levelTone(level: LogEntry['level']): string {
  if (level === 'ERROR') return 'text-red-600 dark:text-red-300'
  if (level === 'WARN') return 'text-amber-600 dark:text-amber-300'
  if (level === 'DEBUG') return 'text-sky-600 dark:text-sky-300'
  return 'text-emerald-600 dark:text-emerald-300'
}

function formatEntries(entries: LogEntry[]): string {
  return entries
    .map((entry) => `${entry.timestamp} [${entry.level}] ${entry.message}`)
    .join('\n')
}

export function RecentLogsSheet({
  open,
  onClose,
  title,
  description,
  lines = 120,
  scope = 'all',
}: RecentLogsSheetProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LogLevelFilter>('ALL')
  const [copyState, setCopyState] = useState<'idle' | 'done'>('idle')

  async function loadLogs() {
    setLoading(true)
    setError(null)
    const result = await getLogsResult(lines)
    if (!result.success || !result.data) {
      setError(result.error ?? t('common.unknownError'))
      setEntries([])
      setLoading(false)
      return
    }
    setEntries(result.data)
    setLoading(false)
  }

  useEffect(() => {
    if (!open) return
    void loadLogs()
  }, [open, lines])

  const filteredEntries = useMemo(() => {
    const scopedEntries = filterLogEntriesByScope(entries, scope)
    const lowered = query.trim().toLowerCase()
    return scopedEntries.filter((entry) => {
      if (level !== 'ALL' && entry.level !== level) return false
      if (!lowered) return true
      return `${entry.timestamp} ${entry.level} ${entry.message}`.toLowerCase().includes(lowered)
    })
  }, [entries, level, query, scope])

  async function copyLogs() {
    await navigator.clipboard.writeText(formatEntries(filteredEntries))
    setCopyState('done')
    window.setTimeout(() => setCopyState('idle'), 1800)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/55 p-0 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-logs-title"
        className="relative flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border/80 bg-background shadow-2xl sm:w-[calc(100vw-24px)] lg:w-[calc(100vw-32px)] xl:w-[min(1100px,calc(100vw-48px))] sm:rounded-l-[30px]"
      >
        <div className="shrink-0 border-b border-border/70 bg-background/96 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/60">
                  <ScrollText className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 id="recent-logs-title" className="text-[1.35rem] font-semibold tracking-tight text-foreground">
                    {title}
                  </h3>
                  {description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  ) : null}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="button-secondary px-3">
              <X className="h-4 w-4" />
              {t('common.close')}
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-border/70 px-5 py-4 sm:px-7">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('logs.searchPlaceholder')}
                className="control-input"
              />
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as LogLevelFilter)}
                className="control-select"
              >
                <option value="ALL">{t('logs.allLevels')}</option>
                {LEVELS.filter((item) => item !== 'ALL').map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                {t('logs.recentLines', { count: lines })}
              </span>
              <button type="button" onClick={() => void loadLogs()} className="button-secondary px-3" disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </button>
              <button
                type="button"
                onClick={() => void copyLogs()}
                className="button-secondary px-3"
                disabled={filteredEntries.length === 0}
              >
                <Copy className="h-4 w-4" />
                {copyState === 'done' ? t('logs.copied') : t('logs.copyVisible')}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {loading ? (
            <LoadingState message={t('logs.loadingRecent')} fullPage={false} />
          ) : error ? (
            <div className="surface-card-danger text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">{t('logs.loadFailed')}</p>
                  <p className="mt-1 text-muted-foreground">{error}</p>
                </div>
              </div>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="state-panel min-h-[12rem] text-muted-foreground">
              {scope === 'all'
                ? t('logs.noLogs')
                : t('logs.noScopedLogs', { count: lines })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEntries.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="rounded-[22px] border border-border/70 bg-muted/25 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {entry.timestamp}
                    </span>
                    <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${levelTone(entry.level)}`}>
                      {entry.level}
                    </span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{entry.message}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
