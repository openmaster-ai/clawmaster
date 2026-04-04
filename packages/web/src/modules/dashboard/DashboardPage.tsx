import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { BarChart3, Brain, Zap, ExternalLink, ScrollText, Settings2 } from 'lucide-react'
import type { SystemInfo, GatewayStatus, OpenClawConfig } from '@/lib/types'
import { buildGatewayUrl } from '@/shared/gatewayUrl'

export default function Dashboard() {
  const { t } = useTranslation()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [systemLoading, setSystemLoading] = useState(true)
  const [gatewayLoading, setGatewayLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)

  const reportError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    setError((prev) => prev ?? message)
  }, [])

  useEffect(() => {
    let active = true

    setError(null)
    setSystemLoading(true)
    setGatewayLoading(true)
    setConfigLoading(true)

    void platform.detectSystem()
      .then((sys) => {
        if (!active) return
        setSystemInfo(sys)
      })
      .catch((err) => {
        console.error('Failed to load dashboard system info:', err)
        if (!active) return
        reportError(err)
      })
      .finally(() => {
        if (!active) return
        setSystemLoading(false)
      })

    void platform.getGatewayStatus()
      .then((gw) => {
        if (!active) return
        setGatewayStatus(gw)
      })
      .catch((err) => {
        console.error('Failed to load dashboard gateway status:', err)
        if (!active) return
        reportError(err)
      })
      .finally(() => {
        if (!active) return
        setGatewayLoading(false)
      })

    void platform.getConfig()
      .then((cfg) => {
        if (!active) return
        setConfig(cfg)
      })
      .catch((err) => {
        console.error('Failed to load dashboard config:', err)
        if (!active) return
        reportError(err)
      })
      .finally(() => {
        if (!active) return
        setConfigLoading(false)
      })

    return () => {
      active = false
    }
  }, [reportError])

  // 计算通道数量
  const channelCount = config?.channels ? Object.keys(config.channels).length : 0

  // 计算代理数量
  const agentCount = config?.agents?.list?.length || 0

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <HeaderMetaItem
              loading={gatewayLoading}
              value={gatewayStatus?.running ? t('dashboard.running') : t('dashboard.stopped')}
            />
            <HeaderMetaItem
              loading={configLoading}
              value={`${agentCount} ${t('layout.nav.agents')}`}
            />
            <HeaderMetaItem
              loading={configLoading}
              value={`${t('config.countUnit', { count: channelCount })} ${t('layout.nav.channels')}`}
            />
          </div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={buildGatewayUrl(config)}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary"
          >
            <ExternalLink className="h-4 w-4" />
            {t('gateway.openInBrowser')}
          </a>
          <Link to="/config" className="button-secondary">
            <Settings2 className="h-4 w-4" />
            {t('config.title')}
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="surface-card border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300">
          {t('common.error')}: {error}
        </div>
      )}

      <div className="metric-grid">
        <div className="metric-card">
          <p className="metric-label">Node.js</p>
          <p className="metric-value">
            <MetricValue
              loading={systemLoading}
              value={systemInfo?.nodejs.installed ? systemInfo.nodejs.version : t('common.notInstalled')}
            />
          </p>
          <p className="metric-meta">
            {systemLoading ? <LoadingLine widthClass="w-20" /> : `npm ${systemInfo?.npm.installed ? systemInfo.npm.version : '-'}`}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">OpenClaw</p>
          <p className="metric-value">
            <MetricValue
              loading={systemLoading}
              value={systemInfo?.openclaw.installed ? `v${systemInfo.openclaw.version}` : t('common.notInstalled')}
            />
          </p>
          <p className="metric-meta">
            {systemLoading ? <LoadingLine widthClass="w-full max-w-[14rem]" /> : (systemInfo?.openclaw.configPath || t('common.notSet'))}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">{t('dashboard.gatewayStatus')}</p>
          <p className="metric-value">
            <MetricValue
              loading={gatewayLoading}
              value={gatewayStatus?.running ? t('dashboard.running') : t('dashboard.stopped')}
            />
          </p>
          <p className="metric-meta">
            {configLoading ? <LoadingLine widthClass="w-32" /> : buildGatewayUrl(config)}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">{t('dashboard.agents')}</p>
          <p className="metric-value">
            <MetricValue loading={configLoading} value={String(agentCount)} />
          </p>
          <p className="metric-meta">
            {configLoading ? <LoadingLine widthClass="w-24" /> : `${t('config.countUnit', { count: channelCount })} ${t('layout.nav.channels')}`}
          </p>
        </div>
      </div>

      <div className="surface-card">
        <div className="dashboard-section-head">
          <div className="dashboard-section-copy">
            <p className="dashboard-section-meta">{t('settings.systemInfo')}</p>
            <h3 className="section-title">{t('dashboard.systemEnv')}</h3>
          </div>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
          {systemLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <LoadingLine widthClass="w-20" />
                <LoadingLine widthClass="w-32" />
              </div>
            ))
          ) : systemInfo ? (
            <>
              <div>
                <span className="text-muted-foreground">Node.js: </span>
                <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                  {systemInfo.nodejs.installed ? `Node ${systemInfo.nodejs.version}` : t('common.notInstalled')}
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
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.notSet')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card">
          <div className="dashboard-section-head">
            <div className="dashboard-section-copy">
              <p className="dashboard-section-meta">{t('dashboard.manage')}</p>
              <h3 className="section-title">{t('dashboard.gatewayStatus')}</h3>
            </div>
            <Link to="/gateway" className="button-secondary">
              {t('dashboard.manage')}
            </Link>
          </div>
          <div className="dashboard-inline-stack text-sm">
            {gatewayLoading || configLoading ? (
              <CardPlaceholder rows={4} />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${gatewayStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span>{gatewayStatus?.running ? t('dashboard.running') : t('dashboard.stopped')}</span>
                </div>
                <p className="text-muted-foreground">{t('gateway.port')}: {config?.gateway?.port || '-'}</p>
                <p className="text-muted-foreground">{t('gateway.bind')}: {config?.gateway?.bind || '-'}</p>
                <p className="text-muted-foreground">{t('gateway.auth')}: {config?.gateway?.auth?.mode || '-'}</p>
              </>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="dashboard-section-head">
            <div className="dashboard-section-copy">
              <p className="dashboard-section-meta">{t('layout.nav.channels')}</p>
              <h3 className="section-title">{t('dashboard.channelConnection')}</h3>
            </div>
            <Link to="/channels" className="button-secondary">
              {t('dashboard.manageChannels')}
            </Link>
          </div>
          <div className="dashboard-inline-stack text-sm">
            {configLoading ? (
              <CardPlaceholder rows={3} />
            ) : config?.channels && Object.entries(config.channels).map(([name, ch]: [string, any]) => (
              <div key={name} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <span className="capitalize">{name}</span>
                {ch.accounts && (
                  <span className="text-muted-foreground">({Object.keys(ch.accounts).length} 账号)</span>
                )}
              </div>
            ))}
            {!configLoading && channelCount === 0 && (
              <p className="text-muted-foreground">{t('dashboard.noChannelConfig')}</p>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="dashboard-section-head">
            <div className="dashboard-section-copy">
              <p className="dashboard-section-meta">{t('layout.nav.models')}</p>
              <h3 className="section-title">{t('dashboard.currentModel')}</h3>
            </div>
            <Link to="/models" className="button-secondary">
              {t('dashboard.configModel')}
            </Link>
          </div>
          {configLoading ? (
            <CardPlaceholder rows={2} />
          ) : (
            <>
              <p className="text-lg font-medium">{config?.agents?.defaults?.model?.primary || '-'}</p>
              <p className="text-sm text-muted-foreground">
                {t('agents.workspace')}: {config?.agents?.defaults?.workspace || '-'}
              </p>
            </>
          )}
        </div>

        <div className="surface-card">
          <div className="dashboard-section-head">
            <div className="dashboard-section-copy">
              <p className="dashboard-section-meta">{t('layout.nav.agents')}</p>
              <h3 className="section-title">{t('dashboard.agents')}</h3>
            </div>
            <Link to="/agents" className="button-secondary">
              {t('dashboard.manageAgents')}
            </Link>
          </div>
          {configLoading ? (
            <CardPlaceholder rows={4} />
          ) : (
            <>
              <p className="text-lg font-medium">{t('dashboard.agentsConfigured', { count: agentCount })}</p>
              {config?.agents?.list?.slice(0, 3).map((agent: any) => (
                <p key={agent.id} className="text-sm text-muted-foreground">
                  • {agent.name || agent.id}
                </p>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link to="/observe" className="list-card transition hover:border-primary/50">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-medium">{t('dashboard.costTracking')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('dashboard.costTrackingDesc')}</p>
        </Link>
        <Link to="/memory" className="list-card transition hover:border-primary/50">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-primary" />
            <h3 className="font-medium">{t('dashboard.memoryManagement')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('dashboard.memoryManagementDesc')}</p>
        </Link>
        <Link to="/skills" className="list-card transition hover:border-primary/50">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="font-medium">{t('dashboard.skillMarket')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('dashboard.skillMarketDesc')}</p>
        </Link>
      </div>

      <div className="surface-card">
        <div className="dashboard-section-head">
          <div className="dashboard-section-copy">
            <p className="dashboard-section-meta">{t('dashboard.manage')}</p>
            <h3 className="section-title">{t('dashboard.quickActions')}</h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={buildGatewayUrl(config)}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary"
          >
            <ExternalLink className="h-4 w-4" />
            {t('dashboard.openConsole')}
          </a>
          <Link to="/gateway" className="button-secondary">
            <ScrollText className="h-4 w-4" />
            {t('dashboard.viewLogs')}
          </Link>
          <Link to="/config" className="button-secondary">
            <Settings2 className="h-4 w-4" />
            {t('dashboard.editConfig')}
          </Link>
        </div>
      </div>
    </div>
  )
}

function HeaderMetaItem({ loading, value }: { loading: boolean; value: string }) {
  if (loading) {
    return <LoadingLine widthClass="w-20" className="rounded-full" />
  }

  return <span>{value}</span>
}

function MetricValue({ loading, value }: { loading: boolean; value: string }) {
  if (loading) {
    return <LoadingLine widthClass="w-24 h-8" className="rounded-xl" />
  }

  return <>{value}</>
}

function CardPlaceholder({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-label="loading">
      {Array.from({ length: rows }).map((_, index) => (
        <LoadingLine
          key={index}
          widthClass={index === rows - 1 ? 'w-24' : 'w-full'}
        />
      ))}
    </div>
  )
}

function LoadingLine({
  widthClass,
  className = '',
}: {
  widthClass: string
  className?: string
}) {
  return <span className={`block animate-pulse rounded-md bg-primary/10 h-4 ${widthClass} ${className}`.trim()} />
}
