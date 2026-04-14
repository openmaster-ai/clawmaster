import { ExternalLink, Loader2, RotateCcw, ShieldOff, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type {
  PaddleOcrModuleId,
  PaddleOcrModuleStatus,
  PaddleOcrPreviewPayload,
} from '@/lib/types'
import {
  getPaddleOcrModuleEndpointSuffix,
  getPaddleOcrModulePlaceholder,
  getPaddleOcrModuleTitleKey,
} from '@/shared/paddleocr'

type PaddleOcrSetupDialogProps = {
  open: boolean
  busy: boolean
  submitBusy?: boolean
  previewBusy?: boolean
  clearBusy?: boolean
  error: string | null
  moduleId: PaddleOcrModuleId | null
  moduleStatus?: PaddleOcrModuleStatus | null
  apiUrl: string
  accessToken: string
  preview?: PaddleOcrPreviewPayload | null
  submitLabel?: string
  onClose: () => void
  onApiUrlChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
  onPreview?: () => void
  onRequestClear?: () => void
  onSubmit: () => void
}

export default function PaddleOcrSetupDialog({
  open,
  busy,
  submitBusy = false,
  previewBusy = false,
  clearBusy = false,
  error,
  moduleId,
  moduleStatus = null,
  apiUrl,
  accessToken,
  preview = null,
  submitLabel,
  onClose,
  onApiUrlChange,
  onAccessTokenChange,
  onPreview = () => {},
  onRequestClear = () => {},
  onSubmit,
}: PaddleOcrSetupDialogProps) {
  const { t } = useTranslation()

  if (!open || !moduleId) return null

  const title = t(getPaddleOcrModuleTitleKey(moduleId))
  const endpointSuffix = getPaddleOcrModuleEndpointSuffix(moduleId)
  const endpointHint = t('setup.paddleocr.endpointHint', { suffix: endpointSuffix })
  const hasSavedToken = moduleStatus?.accessTokenConfigured ?? false
  const hasSavedEndpoint = Boolean(moduleStatus?.apiUrl)
  const canRunAction =
    Boolean(apiUrl.trim()) && (Boolean(accessToken.trim()) || hasSavedToken)
  const canClear =
    moduleStatus?.enabled === true ||
    moduleStatus?.accessTokenConfigured === true ||
    moduleStatus?.apiUrlConfigured === true

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
        className="relative z-10 w-full max-w-3xl rounded-[32px] border border-border/70 bg-background p-6 shadow-2xl"
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

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/70 bg-muted/30 p-4">
              <p className="text-sm leading-6 text-foreground">
                {t('setup.paddleocr.descriptionForModule', { name: title })}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('setup.paddleocr.moduleScopeHint', { name: title })}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{endpointHint}</p>
              {hasSavedEndpoint && moduleStatus?.apiUrl ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('setup.paddleocr.savedEndpoint', { apiUrl: moduleStatus.apiUrl })}
                </p>
              ) : null}
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

            {hasSavedToken ? (
              <div className="rounded-[20px] border border-border/60 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
                {t('setup.paddleocr.tokenReuseHint')}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[22px] border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/70 bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {t('setup.paddleocr.previewTitle')}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('setup.paddleocr.previewDescription')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onPreview}
                  disabled={busy || !canRunAction}
                  className="button-secondary shrink-0"
                >
                  {previewBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('setup.paddleocr.previewRunning')}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      {t('setup.paddleocr.previewAction')}
                    </>
                  )}
                </button>
              </div>

              {preview ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('setup.paddleocr.previewLatency')}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {t('setup.paddleocr.previewLatencyValue', { value: preview.latencyMs })}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('setup.paddleocr.previewPages')}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {preview.pageCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('setup.paddleocr.previewTextLines')}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {preview.textLineCount}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('setup.paddleocr.previewExtractedText')}
                    </p>
                    <pre className="mt-2 max-h-52 overflow-auto rounded-[20px] border border-border/70 bg-muted/20 p-4 text-xs leading-6 text-foreground whitespace-pre-wrap">
                      {preview.extractedText || t('setup.paddleocr.previewEmpty')}
                    </pre>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('setup.paddleocr.previewResponse')}
                    </p>
                    <pre className="mt-2 max-h-52 overflow-auto rounded-[20px] border border-border/70 bg-slate-950 p-4 text-xs leading-6 text-slate-100 whitespace-pre-wrap">
                      {preview.responsePreview}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[20px] border border-dashed border-border/70 bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                  {t('setup.paddleocr.previewEmptyState')}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {canClear ? (
              <button
                type="button"
                onClick={onRequestClear}
                disabled={busy || clearBusy}
                className="button-danger"
              >
                <ShieldOff className="h-4 w-4" />
                {t('setup.paddleocr.clearAction')}
              </button>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
              disabled={busy || !canRunAction}
              className="button-primary"
            >
              {submitBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('setup.verifying')}
                </>
              ) : (
                submitLabel ?? t('setup.paddleocr.submit')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
