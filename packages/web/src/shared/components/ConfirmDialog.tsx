import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  busy = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={busy ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-lg rounded-[1.75rem] border border-border/80 bg-background p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tone === 'danger' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border/70 bg-muted/60 text-foreground'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="confirm-dialog-title" className="text-[1.2rem] font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
          </div>
        </div>

        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="button-secondary">
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={tone === 'danger' ? 'button-danger' : 'button-primary'}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
