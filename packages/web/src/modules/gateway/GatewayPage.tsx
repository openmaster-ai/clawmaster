import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Play, RotateCw, ScrollText, Shield, ShieldCheck, Square } from 'lucide-react'
import { Link } from 'react-router-dom'
import { platform } from '@/adapters'
import { platformResults } from '@/shared/adapters/platformResults'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { LoadingState } from '@/shared/components/LoadingState'
import { RecentLogsSheet } from '@/shared/components/RecentLogsSheet'
import type { GatewayStatus, OpenClawConfig } from '@/lib/types'
import { buildGatewayUrl, buildGatewayWebUiUrl } from '@/shared/gatewayUrl'

export default function Gateway() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(true)
  const [operating, setOperating] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setStatusLoading(true)

    const cfgRes = await platformResults.getConfig()
    if (cfgRes.success && cfgRes.data) {
      setConfig(cfgRes.data)
    } else if (!cfgRes.success) {
      console.error('Failed to load gateway config:', cfgRes.error)
    }
    setLoading(false)

    const gwRes = await platformResults.getGatewayStatus()
    if (gwRes.success && gwRes.data) {
      setStatus(gwRes.data)
    } else if (!gwRes.success) {
      console.error('Failed to load gateway status:', gwRes.error)
      setStatus((prev) => prev ?? { running: false, port: cfgRes.data?.gateway?.port ?? 18789 })
    }
    setStatusLoading(false)
  }

  /** 轮询等待网关状态变化 */
  async function pollStatus(expectRunning: boolean, maxRetries = 10): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const gwRes = await platformResults.getGatewayStatus()
      if (gwRes.success && gwRes.data) {
        setStatus(gwRes.data)
        if (gwRes.data.running === expectRunning) return true
      }
    }
    return false
  }

  async function handleGatewayAction(action: 'start' | 'stop' | 'restart') {
    const labels = { start: t('gateway.starting'), stop: t('gateway.stopping'), restart: t('gateway.restarting') }
    setOperating(labels[action])
    try {
      if (action === 'start') await platform.startGateway()
      else if (action === 'stop') await platform.stopGateway()
      else await platform.restartGateway()

      const expectRunning = action !== 'stop'
      const ok = await pollStatus(expectRunning)
      if (!ok) {
        setFeedback({ tone: 'error', message: t('gateway.operationTimeout') })
      }
      await loadData()
    } catch (err: any) {
      setFeedback({ tone: 'error', message: t('gateway.operationFailed', { message: err.message }) })
    } finally {
      setOperating(null)
    }
  }

  async function copyToken() {
    const token = config?.gateway?.auth?.token
    if (token) {
      await navigator.clipboard.writeText(token)
      setFeedback({ tone: 'success', message: t('gateway.tokenCopied') })
    }
  }

  const gatewayUrl = buildGatewayUrl(config, { protocol: 'ws' })
  const gatewayPort = config?.gateway?.port || status?.port || 18789
  const gatewayBind = config?.gateway?.bind || 'loopback'
  const gatewayAuthMode = config?.gateway?.auth?.mode || 'token'
  const gatewayToken = config?.gateway?.auth?.token
  const watchdog = status?.watchdog
  const watchdogState = watchdog?.state ?? 'disabled'
  const watchdogStateLabels: Record<string, string> = {
    disabled: t('gateway.watchdogDisabled'),
    idle: t('gateway.watchdogIdle'),
    healthy: t('gateway.watchdogHealthy'),
    checking: t('gateway.watchdogChecking'),
    restarting: t('gateway.watchdogRestarting'),
    paused: t('gateway.watchdogPaused'),
    error: t('gateway.watchdogError'),
  }
  const watchdogStateLabel = watchdogStateLabels[watchdogState] ?? watchdogState
  const watchdogSummary = !watchdog
    ? t('gateway.safeguardUnavailable')
    : watchdog.enabled
      ? watchdog.state === 'paused'
        ? t('gateway.safeguardPaused')
        : t('gateway.safeguardEnabled')
      : t('gateway.safeguardDisabled')

  return (
    <div className="page-shell page-shell-medium">
      {feedback ? (
        <ActionBanner tone={feedback.tone} message={feedback.message} onDismiss={() => setFeedback(null)} />
      ) : null}
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{status?.running ? t('dashboard.running') : t('dashboard.stopped')}</span>
            <span>{t('gateway.port')}: {gatewayPort}</span>
            <span>{t('gateway.auth')}: {gatewayAuthMode}</span>
            <span>{t('gateway.safeguard')}: {watchdogSummary}</span>
          </div>
          <h1 className="page-title">{t('gateway.title')}</h1>
          <p className="page-subtitle">{t('gateway.editConfigHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setLogsOpen(true)} className="button-secondary">
            <ScrollText className="h-4 w-4" />
            {t('logs.openRecent')}
          </button>
          <Link to="/settings#settings-logs" className="inline-flex items-center gap-2 px-1 text-sm font-medium text-primary hover:underline">
            {t('logs.moreDiagnostics')}
          </Link>
        </div>
      </div>

      <div id="gateway-runtime" className="surface-card space-y-5">
        {loading ? (
          <LoadingState message={t('common.loading')} fullPage={false} />
        ) : (
          <>
            <div className="section-heading">
              <div>
                <h3 className="section-title">{t('dashboard.manage')}</h3>
                <p className="section-subtitle">{gatewayUrl}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
              <div className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0)_58%),radial-gradient(circle_at_top_right,rgba(233,98,36,0.14),rgba(233,98,36,0)_42%)] p-5">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t('dashboard.gatewayStatus')}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <span className={`h-3 w-3 rounded-full ${status?.running ? 'bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.45)]' : 'bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.35)]'}`} />
                        <p className={`text-3xl font-semibold tracking-tight ${status?.running ? 'text-emerald-500' : 'text-red-500'}`}>
                          {status?.running ? t('dashboard.running') : t('dashboard.stopped')}
                        </p>
                      </div>
                      <p className="mt-4 max-w-2xl font-mono text-sm leading-6 text-muted-foreground break-all">
                        {gatewayUrl}
                      </p>
                    </div>

                    <a
                      href={buildGatewayWebUiUrl(config)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('gateway.openInBrowser')}
                    </a>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-background/55 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.port')}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{gatewayPort}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/55 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.bind')}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{gatewayBind}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/55 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.auth')}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{gatewayAuthMode}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`h-4 w-4 ${watchdog?.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {t('gateway.safeguard')}
                      </p>
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">{watchdogSummary}</p>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.safeguardState')}</p>
                        <p className="mt-1 font-medium text-foreground">{watchdogStateLabel}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.safeguardRestarts')}</p>
                        <p className="mt-1 font-mono font-medium text-foreground">{watchdog?.restartCount ?? 0}</p>
                      </div>
                    </div>
                    {watchdog?.lastError ? (
                      <p className="mt-3 text-xs leading-5 text-red-600 dark:text-red-400">{watchdog.lastError}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('dashboard.quickActions')}
                  </p>
                </div>
                <div className="mt-4 grid gap-2">
                  {operating ? (
                    <span className="px-4 py-2 text-muted-foreground animate-pulse">{operating}</span>
                  ) : statusLoading ? (
                    <span className="px-4 py-2 text-muted-foreground animate-pulse">{t('common.loading')}</span>
                  ) : status?.running ? (
                    <>
                      <button
                        onClick={() => handleGatewayAction('stop')}
                        className="button-danger justify-center"
                      >
                        <Square className="h-4 w-4" />
                        {t('gateway.stop')}
                      </button>
                      <button
                        onClick={() => handleGatewayAction('restart')}
                        className="button-secondary justify-center"
                      >
                        <RotateCw className="h-4 w-4" />
                        {t('gateway.restart')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleGatewayAction('start')}
                      className="button-primary justify-center"
                    >
                      <Play className="h-4 w-4" />
                      {t('gateway.start')}
                    </button>
                  )}
                  <button type="button" onClick={() => setLogsOpen(true)} className="button-secondary justify-center">
                    <ScrollText className="h-4 w-4" />
                    {t('logs.openRecent')}
                  </button>
                  <Link to="/settings#settings-logs" className="inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/5">
                    {t('logs.moreDiagnostics')}
                  </Link>
                </div>
              </div>
            </div>

            <p className="text-xs leading-6 text-muted-foreground">
              {watchdog?.enabled ? t('gateway.safeguardHelp') : status?.running ? t('gateway.openInBrowser') : t('gateway.editConfigHint')}
            </p>
          </>
        )}
      </div>

      <div id="gateway-config" className="surface-card space-y-4">
        <div className="section-heading">
          <h3 className="section-title">{t('gateway.config')}</h3>
        </div>
        {loading ? (
          <LoadingState message={t('gateway.config')} fullPage={false} />
        ) : (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.25rem] border border-border/70 bg-background/55 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.port')}</p>
                <p className="mt-3 font-mono text-2xl font-semibold text-foreground">{gatewayPort}</p>
              </div>
              <div className="rounded-[1.25rem] border border-border/70 bg-background/55 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.bind')}</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{gatewayBind}</p>
              </div>
              <div className="rounded-[1.25rem] border border-border/70 bg-background/55 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.auth')}</p>
                <p className="mt-3 text-2xl font-semibold text-foreground">{gatewayAuthMode}</p>
              </div>
              {gatewayToken && (
                <div className="rounded-[1.25rem] border border-border/70 bg-background/55 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('gateway.token')}</p>
                  <button onClick={copyToken} className="mt-3 w-fit text-sm font-medium text-primary hover:underline">{t('gateway.copyToken')}</button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <span>{t('gateway.editConfigHint')}</span>
              <Link to="/config#config-editor" className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
                {t('config.title')}
              </Link>
            </div>
          </>
        )}
      </div>

      <RecentLogsSheet
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={t('logs.gatewayTitle')}
        description={t('logs.gatewayDescription')}
        lines={240}
        scope="gateway"
      />
    </div>
  )
}
