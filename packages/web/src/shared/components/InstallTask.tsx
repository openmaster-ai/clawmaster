import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import type { InstallStatus } from '@/shared/hooks/useInstallTask'

interface InstallTaskProps {
  /** Display name, e.g. "Context7" */
  label: string
  /** Subtitle, e.g. "@upstash/context7-mcp" */
  description?: string
  status: InstallStatus
  /** 0-100, undefined = indeterminate spinner */
  progress?: number
  /** Current operation log line (monospace) */
  log?: string
  /** Error message */
  error?: string
  /** Called when user clicks retry */
  onRetry?: () => void
}

/**
 * Unified install/download progress display.
 *
 * Shows nothing when idle. When running/done/error, renders a compact
 * status row with icon, label, progress bar, and optional retry.
 */
export function InstallTask({
  label,
  description,
  status,
  progress,
  log,
  error,
  onRetry,
}: InstallTaskProps) {
  const { t } = useTranslation()

  if (status === 'idle') return null

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      status === 'error' ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30' :
      status === 'done' ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/30' :
      'border-border bg-card'
    }`}>
      {/* Top row: icon + label + status text */}
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">
              {status === 'running' && t('install.running')}
              {status === 'done' && t('install.done')}
              {status === 'error' && t('install.failed')}
            </span>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground font-mono truncate">{description}</p>
          )}
        </div>
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-accent"
          >
            <RefreshCw className="w-3 h-3" />
            {t('install.retry')}
          </button>
        )}
      </div>

      {/* Progress bar (running only) */}
      {status === 'running' && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          {progress !== undefined ? (
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          ) : (
            <div className="h-full bg-primary rounded-full animate-progress-indeterminate" />
          )}
        </div>
      )}

      {/* Log line */}
      {log && status === 'running' && (
        <p className="text-xs text-muted-foreground font-mono truncate">{log}</p>
      )}

      {/* Error message */}
      {error && status === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: InstallStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
    case 'done':
      return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
    default:
      return null
  }
}
