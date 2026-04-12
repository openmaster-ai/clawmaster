import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type ActionBannerTone = 'info' | 'success' | 'error'

interface ActionBannerProps {
  tone?: ActionBannerTone
  message: string
  onDismiss?: () => void
}

const TONE_STYLES: Record<ActionBannerTone, string> = {
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  error: 'border-destructive/30 bg-destructive/5 text-destructive',
}

function toneIcon(tone: ActionBannerTone) {
  if (tone === 'success') return CheckCircle2
  if (tone === 'error') return AlertTriangle
  return Info
}

export function ActionBanner({ tone = 'info', message, onDismiss }: ActionBannerProps) {
  const Icon = toneIcon(tone)

  return (
    <div className={`flex items-start justify-between gap-3 rounded-[1.15rem] border px-4 py-3 text-sm ${TONE_STYLES[tone]}`} role="status">
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="min-w-0 whitespace-pre-wrap break-words">{message}</p>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded-lg p-1 transition hover:bg-black/5 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
