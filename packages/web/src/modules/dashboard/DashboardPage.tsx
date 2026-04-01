import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { platformResults } from '@/adapters'
import { formatBootstrapSummary } from '@/shared/adapters/openclawBootstrap'
import type { SystemInfo, GatewayStatus, OpenClawConfig, OpenClawChannelEntry } from '@/lib/types'

const DASHBOARD_CACHE_KEY = 'dashboard:overview:v1'
const MAX_VISIBLE_CHANNELS = 20

type DashboardCachePayload = {
  ts: number
  gateway: GatewayStatus
  config: OpenClawConfig
}

function readDashboardCache(): DashboardCachePayload | null {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DashboardCachePayload>
    if (!parsed || !parsed.gateway || !parsed.config || typeof parsed.ts !== 'number') return null
    return parsed as DashboardCachePayload
  } catch {
    return null
  }
}

function writeDashboardCache(payload: DashboardCachePayload) {
  try {
    window.localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota/storage errors
  }
}

export default function Dashboard() {
  const { t } = useTranslation()
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loadingGateway, setLoadingGateway] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [systemInfoLoading, setSystemInfoLoading] = useState(true)

  const refreshOverview = useCallback(async () => {
    setError(null)
    setLoadingGateway(true)
    setLoadingConfig(true)

    const [gw, cfg] = await Promise.all([
      platformResults.getGatewayStatus(),
      platformResults.getConfig(),
    ])

    if (gw.success && gw.data) {
      setGatewayStatus(gw.data)
      setLoadingGateway(false)
    } else {
      setLoadingGateway(false)
      setError((prev) => prev ?? gw.error ?? t('dashboard.errGatewayStatus'))
    }

    if (cfg.success && cfg.data) {
      setConfig(cfg.data)
      setLoadingConfig(false)
    } else {
      setLoadingConfig(false)
      setError((prev) => prev ?? cfg.error ?? t('dashboard.errConfig'))
    }

    if (gw.success && gw.data && cfg.success && cfg.data) {
      writeDashboardCache({
        ts: Date.now(),
        gateway: gw.data,
        config: cfg.data,
      })
    }
  }, [t])

  useEffect(() => {
    const cached = readDashboardCache()
    if (cached) {
      setGatewayStatus(cached.gateway)
      setConfig(cached.config)
      setLoadingGateway(false)
      setLoadingConfig(false)
    }
    void refreshOverview()
  }, [refreshOverview])

  useEffect(() => {
    let cancelled = false
    const id = window.setTimeout(() => {
      void platformResults.detectSystem().then((r) => {
        if (cancelled) return
        setSystemInfoLoading(false)
        if (!r.success || !r.data) return
        setSystemInfo(r.data)
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [])
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const [bootstrapHint, setBootstrapHint] = useState<string | null>(null)

  const handleBootstrap = useCallback(async () => {
    setBootstrapBusy(true)
    setBootstrapHint(null)
    const r = await platformResults.bootstrapAfterInstall()
    setBootstrapHint(formatBootstrapSummary(r))
    setBootstrapBusy(false)
    void refreshOverview()
  }, [refreshOverview])

  if (!gatewayStatus && !config && (loadingGateway || loadingConfig)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground">
          {t('dashboard.loadingOverview')}
        </div>
      </div>
    )
  }

  if (error && !gatewayStatus && !config) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-red-500 text-sm">
        <p>
          {t('dashboard.loadFailedPrefix')}
          {error ?? t('common.unknownError')}
        </p>
      </div>
    )
  }

  const channelEntries = config?.channels ? Object.entries(config.channels) : []
  const visibleChannelEntries = channelEntries.slice(0, MAX_VISIBLE_CHANNELS)
  const hiddenChannelCount = channelEntries.length - visibleChannelEntries.length
  const channelCount = channelEntries.length
  const agentCount = config?.agents?.list?.length || 0
  const configKeyCount = config ? Object.keys(config as object).length : 0
  const needsBootstrapCta = configKeyCount === 0 && !gatewayStatus?.running

  /** Show port from CLI/probe when gateway.port is not set in config */
  const gatewayPortDisplay =
    config?.gateway?.port != null ? config.gateway.port : gatewayStatus?.port
  const gatewayBindDisplay =
    config?.gateway?.bind != null && String(config.gateway.bind).trim() !== ''
      ? String(config.gateway.bind)
      : gatewayStatus?.running
        ? t('dashboard.bindDefault')
        : '—'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
      {error ? (
        <div className="rounded-md border border-amber-500/35 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {t('dashboard.partialRefresh', { detail: error })}
        </div>
      ) : null}

      {needsBootstrapCta && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100 mb-2">{t('dashboard.emptyConfigTitle')}</p>
          <p className="text-muted-foreground mb-3">{t('dashboard.emptyConfigBody')}</p>
          <button
            type="button"
            disabled={bootstrapBusy}
            onClick={() => void handleBootstrap()}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {bootstrapBusy ? t('dashboard.bootstrapBusy') : t('dashboard.btnBootstrap')}
          </button>
          {bootstrapHint ? (
            <pre className="mt-3 font-mono text-xs whitespace-pre-wrap break-all text-muted-foreground max-h-48 overflow-y-auto">
              {bootstrapHint}
            </pre>
          ) : null}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-2">{t('dashboard.systemEnv')}</h3>
        {systemInfoLoading ? (
          <p className="text-sm text-muted-foreground">{t('dashboard.detectingEnv')}</p>
        ) : systemInfo ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Node.js: </span>
              <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.nodejs.installed ? systemInfo.nodejs.version : t('common.notInstalled')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">npm: </span>
              <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.npm.installed ? systemInfo.npm.version : t('common.notInstalled')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">OpenClaw: </span>
              <span className={systemInfo.openclaw.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.openclaw.installed ? `v${systemInfo.openclaw.version}` : t('common.notInstalled')}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('dashboard.envDetectFailed')}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.gatewayCard')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${gatewayStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span>{gatewayStatus?.running ? t('dashboard.running') : t('dashboard.stopped')}</span>
            </div>
            <p className="text-muted-foreground">
              {t('dashboard.port')}: {gatewayPortDisplay}
            </p>
            <p className="text-muted-foreground">
              {t('dashboard.bind')}: {gatewayBindDisplay}
            </p>
            <p className="text-muted-foreground">
              {t('dashboard.auth')}: {config?.gateway?.auth?.mode || '—'}
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/gateway"
              className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90"
            >
              {t('dashboard.manage')}
            </Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.channelsCard')}</h3>
          <div className="space-y-2 text-sm">
            {visibleChannelEntries.map(([name, ch]: [string, OpenClawChannelEntry]) => (
                <div key={name} className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <span className="capitalize">{name}</span>
                  {ch.accounts != null && typeof ch.accounts === 'object' ? (
                    <span className="text-muted-foreground">
                      ({Object.keys(ch.accounts).length} {t('dashboard.accountsSuffix')})
                    </span>
                  ) : null}
                </div>
              ))}
            {channelCount === 0 && <p className="text-muted-foreground">{t('dashboard.noChannels')}</p>}
            {hiddenChannelCount > 0 && (
              <p className="text-muted-foreground">
                {t('dashboard.moreChannels', { count: hiddenChannelCount })}
              </p>
            )}
          </div>
          <Link
            to="/channels"
            className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
          >
            {t('dashboard.manageChannels')}
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.modelCard')}</h3>
          <p className="text-lg font-medium">{config?.agents?.defaults?.model?.primary || '-'}</p>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.workspace')}: {config?.agents?.defaults?.workspace || '-'}
          </p>
          <Link
            to="/models"
            className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
          >
            {t('dashboard.configureModel')}
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.agentsCard')}</h3>
          <p className="text-lg font-medium">{t('dashboard.agentsConfigured', { count: agentCount })}</p>
          {config?.agents?.list?.slice(0, 3).map((agent) => (
            <p key={agent.id} className="text-sm text-muted-foreground">
              • {agent.name || agent.id}
            </p>
          ))}
          <Link
            to="/agents"
            className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
          >
            {t('dashboard.manageAgents')}
          </Link>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('dashboard.quickActions')}</h3>
        <div className="flex gap-3">
          <a
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
          >
            {t('dashboard.openDocs')}
          </a>
          <Link
            to="/logs"
            className="px-4 py-2 text-sm border border-border rounded hover:bg-accent"
          >
            {t('dashboard.viewLogs')}
          </Link>
          <Link
            to="/config"
            className="px-4 py-2 text-sm border border-border rounded hover:bg-accent"
          >
            {t('dashboard.editConfig')}
          </Link>
        </div>
      </div>
    </div>
  )
}
