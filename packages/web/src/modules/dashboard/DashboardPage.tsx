import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  MessageSquare,
  ScrollText,
  Settings2,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
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

  const taskCards: TaskCardConfig[] = [
    {
      id: 'feishu',
      icon: MessageSquare,
      accentClass: 'border-sky-500/30 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(255,255,255,0)_55%)]',
      title: t('dashboard.task.feishu.title'),
      outcome: t('dashboard.task.feishu.outcome'),
      checklist: [
        t('dashboard.task.feishu.step1'),
        t('dashboard.task.feishu.step2'),
        t('dashboard.task.feishu.step3'),
        t('dashboard.task.feishu.step4'),
      ],
      primaryLink: { to: '/channels', label: t('dashboard.task.openFlow') },
      secondaryLinks: [
        { to: '/gateway', label: t('nav.gateway') },
        { to: '/docs', label: t('nav.docs') },
      ],
    },
    {
      id: 'cost',
      icon: BarChart3,
      accentClass: 'border-emerald-500/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(255,255,255,0)_58%)]',
      title: t('dashboard.task.cost.title'),
      outcome: t('dashboard.task.cost.outcome'),
      checklist: [
        t('dashboard.task.cost.step1'),
        t('dashboard.task.cost.step2'),
        t('dashboard.task.cost.step3'),
        t('dashboard.task.cost.step4'),
      ],
      primaryLink: { to: '/observe', label: t('dashboard.task.openFlow') },
      secondaryLinks: [
        { to: '/models', label: t('nav.models') },
        { to: '/sessions', label: t('nav.sessions') },
      ],
    },
    {
      id: 'private',
      icon: HardDrive,
      accentClass: 'border-amber-500/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(255,255,255,0)_58%)]',
      title: t('dashboard.task.private.title'),
      outcome: t('dashboard.task.private.outcome'),
      checklist: [
        t('dashboard.task.private.step1'),
        t('dashboard.task.private.step2'),
        t('dashboard.task.private.step3'),
        t('dashboard.task.private.step4'),
      ],
      primaryLink: { to: '/gateway', label: t('dashboard.task.openFlow') },
      secondaryLinks: [
        { to: '/settings', label: t('nav.settings') },
        { to: '/config', label: t('nav.config') },
      ],
    },
    {
      id: 'extend',
      icon: Wrench,
      accentClass: 'border-fuchsia-500/25 bg-[linear-gradient(135deg,rgba(217,70,239,0.13),rgba(255,255,255,0)_58%)]',
      title: t('dashboard.task.extend.title'),
      outcome: t('dashboard.task.extend.outcome'),
      checklist: [
        t('dashboard.task.extend.step1'),
        t('dashboard.task.extend.step2'),
        t('dashboard.task.extend.step3'),
        t('dashboard.task.extend.step4'),
      ],
      primaryLink: { to: '/mcp', label: t('dashboard.task.openFlow') },
      secondaryLinks: [
        { to: '/plugins', label: t('nav.plugins') },
        { to: '/skills', label: t('nav.skills') },
      ],
    },
  ]

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

      <section className="surface-card space-y-5">
        <div className="dashboard-section-head">
          <div className="dashboard-section-copy">
            <p className="dashboard-section-meta">{t('dashboard.task.meta')}</p>
            <h2 className="section-title">{t('dashboard.task.title')}</h2>
            <p className="section-subtitle">{t('dashboard.task.subtitle')}</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {taskCards.map((task) => (
            <TaskEntryCard key={task.id} task={task} />
          ))}
        </div>
      </section>

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

interface TaskCardLink {
  to: string
  label: string
}

interface TaskCardConfig {
  id: string
  icon: LucideIcon
  accentClass: string
  title: string
  outcome: string
  checklist: string[]
  primaryLink: TaskCardLink
  secondaryLinks: TaskCardLink[]
}

function TaskEntryCard({ task }: { task: TaskCardConfig }) {
  const Icon = task.icon

  return (
    <div className={`rounded-[1.6rem] border p-5 shadow-sm transition hover:border-primary/40 ${task.accentClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/90">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[1.05rem] font-semibold tracking-tight text-foreground">{task.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{task.outcome}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {task.checklist.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-foreground/90">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link to={task.primaryLink.to} className="button-primary">
          {task.primaryLink.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          {task.secondaryLinks.map((link) => (
            <Link key={link.to} to={link.to} className="button-secondary px-3 py-1.5 text-sm">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
