import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { platform } from '@/adapters'
import { platformResults } from '@/shared/adapters/platformResults'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { LoadingState } from '@/shared/components/LoadingState'
import { RecentLogsSheet } from '@/shared/components/RecentLogsSheet'
import type { GatewayStatus, OpenClawConfig } from '@/lib/types'
import { buildGatewayUrl } from '@/shared/gatewayUrl'

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

      <div className="metric-grid">
        <div className="metric-card">
          <p className="metric-label">{t('dashboard.gatewayStatus')}</p>
          <p className={`metric-value ${status?.running ? 'text-green-600' : 'text-red-600'}`}>
            {status?.running ? t('dashboard.running') : t('dashboard.stopped')}
          </p>
          <p className="metric-meta">{gatewayUrl}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">{t('gateway.port')}</p>
          <p className="metric-value">{gatewayPort}</p>
          <p className="metric-meta">{t('gateway.bind')}: {gatewayBind}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">{t('gateway.auth')}</p>
          <p className="metric-value">{gatewayAuthMode}</p>
          <p className="metric-meta">
            {gatewayToken ? (
              <button onClick={copyToken} className="text-primary hover:underline">
                {t('gateway.copyToken')}
              </button>
            ) : 'Token -'}
          </p>
        </div>
      </div>

      <div id="gateway-runtime" className="surface-card">
        {loading ? (
          <LoadingState message={t('common.loading')} fullPage={false} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-3">
              <div className="section-heading">
                <div>
                  <h3 className="section-title">{t('dashboard.manage')}</h3>
                  <p className="section-subtitle">{gatewayUrl}</p>
                </div>
              </div>
              <div className="inline-note">
                {status?.running
                  ? t('gateway.openInBrowser')
                  : t('gateway.editConfigHint')}
              </div>
              <p className="mono-note max-w-full overflow-auto">{gatewayUrl}</p>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              {operating ? (
                <span className="px-4 py-2 text-muted-foreground animate-pulse">{operating}</span>
              ) : statusLoading ? (
                <span className="px-4 py-2 text-muted-foreground animate-pulse">{t('common.loading')}</span>
              ) : status?.running ? (
                <>
                  <button
                    onClick={() => handleGatewayAction('stop')}
                    className="button-danger"
                  >
                    {t('gateway.stop')}
                  </button>
                  <button
                    onClick={() => handleGatewayAction('restart')}
                    className="button-secondary"
                  >
                    {t('gateway.restart')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleGatewayAction('start')}
                  className="button-primary"
                >
                  {t('gateway.start')}
                </button>
              )}
              <a 
                href={buildGatewayUrl(config)}
                target="_blank"
                rel="noopener noreferrer"
                className="button-secondary"
              >
                {t('gateway.openInBrowser')}
              </a>
              <button type="button" onClick={() => setLogsOpen(true)} className="button-secondary">
                <ScrollText className="h-4 w-4" />
                {t('logs.openRecent')}
              </button>
              <Link to="/settings#settings-logs" className="inline-flex items-center gap-2 px-1 text-sm font-medium text-primary hover:underline">
                {t('logs.moreDiagnostics')}
              </Link>
            </div>
          </div>
        )}
      </div>

      <div id="gateway-config" className="surface-card">
        <div className="section-heading">
          <h3 className="section-title">{t('gateway.config')}</h3>
        </div>
        {loading ? (
          <LoadingState message={t('gateway.config')} fullPage={false} />
        ) : (
          <>
            <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-muted-foreground">{t('gateway.port')}</p>
                <p className="font-mono font-medium">{gatewayPort}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('gateway.bind')}</p>
                <p className="font-medium">{gatewayBind}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('gateway.auth')}</p>
                <p className="font-medium">{gatewayAuthMode}</p>
              </div>
              {gatewayToken && (
                <div>
                  <p className="text-muted-foreground">Token</p>
                  <button onClick={copyToken} className="text-xs text-primary hover:underline">{t('gateway.copyToken')}</button>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('gateway.editConfigHint')}
            </p>
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
