import { ExternalLink, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PaddleOcrModuleId } from '@/lib/types'
import {
  getPaddleOcrModuleEndpointSuffix,
  getPaddleOcrModulePlaceholder,
  getPaddleOcrModuleTitleKey,
} from '@/shared/paddleocr'

type PaddleOcrSetupDialogProps = {
  open: boolean
  busy: boolean
  error: string | null
  moduleId: PaddleOcrModuleId | null
  apiUrl: string
  accessToken: string
  onClose: () => void
  onApiUrlChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
  onSubmit: () => void
}

export default function PaddleOcrSetupDialog({
  open,
  busy,
  error,
  moduleId,
  apiUrl,
  accessToken,
  onClose,
  onApiUrlChange,
  onAccessTokenChange,
  onSubmit,
}: PaddleOcrSetupDialogProps) {
  const { t } = useTranslation()

  if (!open || !moduleId) return null

  const title = t(getPaddleOcrModuleTitleKey(moduleId))
  const endpointSuffix = getPaddleOcrModuleEndpointSuffix(moduleId)
  const endpointHint = t('setup.paddleocr.endpointHint', { suffix: endpointSuffix })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paddleocr-setup-title"
        className="relative z-10 w-full max-w-xl rounded-[32px] border border-border/70 bg-background p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('setup.paddleocr.kicker')}
            </p>
            <h2 id="paddleocr-setup-title" className="mt-2 text-2xl font-semibold tracking-tight">
              {t('setup.paddleocr.titleForModule', { name: title })}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="button-secondary px-3"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-[24px] border border-border/70 bg-muted/30 p-4">
            <p className="text-sm leading-6 text-foreground">
              {t('setup.paddleocr.descriptionForModule', { name: title })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{endpointHint}</p>
            <a
              href="https://aistudio.baidu.com/paddleocr"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {t('setup.paddleocr.openSite')}
            </a>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">
              {t('setup.paddleocr.apiUrlLabel')}
            </span>
            <input
              type="url"
              aria-label={t('setup.paddleocr.apiUrlLabel')}
              value={apiUrl}
              onChange={(event) => onApiUrlChange(event.target.value)}
              placeholder={getPaddleOcrModulePlaceholder(moduleId)}
              className="control-input"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">
              {t('setup.paddleocr.accessTokenLabel')}
            </span>
            <input
              type="password"
              aria-label={t('setup.paddleocr.accessTokenLabel')}
              value={accessToken}
              onChange={(event) => onAccessTokenChange(event.target.value)}
              placeholder={t('setup.paddleocr.accessTokenPlaceholder')}
              className="control-input"
            />
          </label>

          {error && (
            <div className="rounded-[22px] border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="button-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !apiUrl.trim() || !accessToken.trim()}
            className="button-primary"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('setup.verifying')}
              </>
            ) : (
              t('setup.paddleocr.submit')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
