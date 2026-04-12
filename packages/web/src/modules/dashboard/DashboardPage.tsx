import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { platform, platformResults } from '@/adapters'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Brain,
  CircleDashed,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Loader2,
  MessageSquare,
  ScrollText,
  Settings2,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type {
  SystemInfo,
  GatewayStatus,
  OpenClawConfig,
  PluginsListPayload,
  SkillInfo,
} from '@/lib/types'
import type { ClawprobeStatusJson } from '@/types/clawprobe'
import { getMcpServers, type McpServersMap } from '@/shared/adapters/mcp'
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
  const [probeStatus, setProbeStatus] = useState<ClawprobeStatusJson | null>(null)
  const [pluginsPayload, setPluginsPayload] = useState<PluginsListPayload | null>(null)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [mcpServers, setMcpServers] = useState<McpServersMap>({})
  const [taskSignalsLoading, setTaskSignalsLoading] = useState(true)
  const [activeTaskId, setActiveTaskId] = useState<TaskCardConfig['id'] | null>(null)

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
    setTaskSignalsLoading(true)

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

    void Promise.allSettled([
      platformResults.clawprobeStatus(),
      platformResults.listPlugins(),
      platformResults.getSkills(),
      getMcpServers(),
    ])
      .then(([probeResult, pluginResult, skillsResult, mcpResult]) => {
        if (!active) return

        if (probeResult.status === 'fulfilled' && probeResult.value.success && probeResult.value.data) {
          setProbeStatus(probeResult.value.data)
        }

        if (pluginResult.status === 'fulfilled' && pluginResult.value.success && pluginResult.value.data) {
          setPluginsPayload(pluginResult.value.data)
        }

        if (skillsResult.status === 'fulfilled' && skillsResult.value.success && skillsResult.value.data) {
          setSkills(skillsResult.value.data)
        }

        if (mcpResult.status === 'fulfilled' && mcpResult.value.success && mcpResult.value.data) {
          setMcpServers(mcpResult.value.data)
        }
      })
      .finally(() => {
        if (!active) return
        setTaskSignalsLoading(false)
      })

    return () => {
      active = false
    }
  }, [reportError])

  const channelCount = config?.channels ? Object.keys(config.channels).length : 0
  const agentCount = config?.agents?.list?.length || 0
  const providerCount = Object.keys(config?.models?.providers || {}).length
  const defaultModel = config?.agents?.defaults?.model?.primary || ''
  const feishuAccounts = getChannelAccountCount(config, 'feishu')
  const enabledPluginCount = getEnabledPluginCount(pluginsPayload)
  const enabledSkillCount = getEnabledSkillCount(skills)
  const installedMcpCount = Object.keys(mcpServers).length

  const taskCards: TaskCardConfig[] = [
    {
      id: 'feishu',
      icon: MessageSquare,
      accentClass: 'border-sky-500/30 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(255,255,255,0)_55%)]',
      title: t('dashboard.task.feishu.title'),
      outcome: t('dashboard.task.feishu.outcome'),
      checklist: [
        {
          id: 'models',
          label: t('dashboard.task.feishu.step1'),
          to: '/models#models-providers',
          hint: t('dashboard.task.gotoSection', { page: t('nav.models'), section: t('models.firstRunTitle') }),
          status: configLoading
            ? 'loading'
            : providerCount > 0 && Boolean(defaultModel)
              ? 'ready'
              : 'attention',
        },
        {
          id: 'gateway',
          label: t('dashboard.task.feishu.step2'),
          to: '/gateway#gateway-runtime',
          hint: t('dashboard.task.gotoSection', { page: t('nav.gateway'), section: t('dashboard.gatewayStatus') }),
          status: gatewayLoading ? 'loading' : gatewayStatus?.running ? 'ready' : 'attention',
        },
        {
          id: 'runtime',
          label: t('dashboard.task.feishu.step3'),
          to: '/channels#channel-focus',
          hint: t('dashboard.task.gotoSection', { page: t('nav.channels'), section: t('channelsPage.focusTitle') }),
          status: systemLoading
            ? 'loading'
            : systemInfo?.openclaw.installed && systemInfo?.nodejs.installed
              ? 'ready'
              : 'attention',
        },
        {
          id: 'login',
          label: t('dashboard.task.feishu.step4'),
          to: '/channels#channel-configured',
          hint: t('dashboard.task.gotoSection', { page: t('nav.channels'), section: t('channelsPage.configured') }),
          status: configLoading ? 'loading' : feishuAccounts > 0 ? 'ready' : 'attention',
        },
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
        {
          id: 'observe',
          label: t('dashboard.task.cost.step1'),
          to: '/observe#observe-runtime',
          hint: t('dashboard.task.gotoSection', { page: t('nav.observe'), section: t('observe.sectionSession') }),
          status: taskSignalsLoading
            ? 'loading'
            : probeStatus?.installRequired || probeStatus?.daemonRunning === false
              ? 'attention'
              : probeStatus
                ? 'ready'
                : 'unknown',
        },
        {
          id: 'model',
          label: t('dashboard.task.cost.step2'),
          to: '/models#models-providers',
          hint: t('dashboard.task.gotoSection', { page: t('nav.models'), section: t('models.title') }),
          status: configLoading
            ? 'loading'
            : providerCount > 0 && Boolean(defaultModel)
              ? 'ready'
              : 'attention',
        },
        {
          id: 'sessions',
          label: t('dashboard.task.cost.step3'),
          to: '/sessions#sessions-toolbar',
          hint: t('dashboard.task.gotoSection', { page: t('nav.sessions'), section: t('sessions.title') }),
          status: taskSignalsLoading ? 'loading' : probeStatus?.sessionKey ? 'ready' : 'unknown',
        },
        {
          id: 'logs',
          label: t('dashboard.task.cost.step4'),
          to: '/settings#settings-logs',
          hint: t('dashboard.task.gotoSection', { page: t('nav.settings'), section: t('logs.settingsTitle') }),
          status: systemLoading ? 'loading' : systemInfo?.openclaw.installed ? 'ready' : 'attention',
        },
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
        {
          id: 'profile',
          label: t('dashboard.task.private.step1'),
          to: '/settings#settings-profile',
          hint: t('dashboard.task.gotoSection', { page: t('nav.settings'), section: t('settings.profileTitle') }),
          status: systemLoading ? 'loading' : systemInfo?.openclaw.installed ? 'ready' : 'attention',
        },
        {
          id: 'gateway-config',
          label: t('dashboard.task.private.step2'),
          to: '/gateway#gateway-config',
          hint: t('dashboard.task.gotoSection', { page: t('nav.gateway'), section: t('gateway.config') }),
          status: configLoading
            ? 'loading'
            : isGatewayProtected(config)
              ? 'ready'
              : 'attention',
        },
        {
          id: 'raw-config',
          label: t('dashboard.task.private.step3'),
          to: '/config#config-editor',
          hint: t('dashboard.task.gotoSection', { page: t('nav.config'), section: 'openclaw.json' }),
          status: configLoading ? 'loading' : config ? 'ready' : 'attention',
        },
        {
          id: 'diagnostics',
          label: t('dashboard.task.private.step4'),
          to: '/settings#settings-system-info',
          hint: t('dashboard.task.gotoSection', { page: t('nav.settings'), section: t('settings.systemInfo') }),
          status: systemLoading ? 'loading' : systemInfo?.openclaw.installed ? 'ready' : 'attention',
        },
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
        {
          id: 'mcp',
          label: t('dashboard.task.extend.step1'),
          to: '/mcp#mcp-import',
          hint: t('dashboard.task.gotoSection', { page: t('nav.mcp'), section: t('mcp.importTitle') }),
          status: taskSignalsLoading ? 'loading' : installedMcpCount > 0 ? 'ready' : 'attention',
        },
        {
          id: 'plugins',
          label: t('dashboard.task.extend.step2'),
          to: '/plugins#plugins-groups',
          hint: t('dashboard.task.gotoSection', { page: t('nav.plugins'), section: t('nav.plugins') }),
          status: taskSignalsLoading ? 'loading' : enabledPluginCount > 0 ? 'ready' : 'attention',
        },
        {
          id: 'skills',
          label: t('dashboard.task.extend.step3'),
          to: '/skills#skills-featured',
          hint: t('dashboard.task.gotoSection', { page: t('nav.skills'), section: t('skills.featuredTitle') }),
          status: taskSignalsLoading ? 'loading' : enabledSkillCount > 0 ? 'ready' : 'attention',
        },
        {
          id: 'runtime-verify',
          label: t('dashboard.task.extend.step4'),
          to: '/skills#skills-installed',
          hint: t('dashboard.task.gotoSection', { page: t('nav.skills'), section: t('skills.installedTitle') }),
          status: taskSignalsLoading
            ? 'loading'
            : installedMcpCount + enabledPluginCount + enabledSkillCount > 0
              ? 'ready'
              : 'unknown',
        },
      ],
      primaryLink: { to: '/mcp', label: t('dashboard.task.openFlow') },
      secondaryLinks: [
        { to: '/plugins', label: t('nav.plugins') },
        { to: '/skills', label: t('nav.skills') },
      ],
    },
  ]
  const activeTask = activeTaskId
    ? taskCards.find((task) => task.id === activeTaskId) ?? null
    : null

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
            <TaskEntryCard key={task.id} task={task} onOpen={() => setActiveTaskId(task.id)} />
          ))}
        </div>
      </section>

      <TaskChecklistDrawer task={activeTask} onClose={() => setActiveTaskId(null)} />

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

type TaskChecklistTone = 'ready' | 'attention' | 'unknown' | 'loading'

interface TaskChecklistItem {
  id: string
  label: string
  to: string
  hint: string
  status: TaskChecklistTone
}

interface TaskCardConfig {
  id: string
  icon: LucideIcon
  accentClass: string
  title: string
  outcome: string
  checklist: TaskChecklistItem[]
  primaryLink: TaskCardLink
  secondaryLinks: TaskCardLink[]
}

function TaskEntryCard({
  task,
  onOpen,
}: {
  task: TaskCardConfig
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const Icon = task.icon
  const summary = summarizeTaskChecklist(task.checklist)
  const nextItem = findNextChecklistItem(task.checklist)

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
        <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
          {t('dashboard.task.readyCount', { ready: summary.ready, total: summary.total })}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {task.checklist.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-sm text-foreground/90">
            <TaskStatusIcon status={item.status} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('dashboard.task.openChecklistAria', { task: task.title })}
          className="button-primary"
        >
          {t('dashboard.task.reviewChecklist')}
          <ArrowRight className="h-4 w-4" />
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {nextItem && (
            <Link to={nextItem.to} className="button-secondary px-3 py-1.5 text-sm">
              {t('dashboard.task.jumpToSection')}
            </Link>
          )}
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

function TaskChecklistDrawer({
  task,
  onClose,
}: {
  task: TaskCardConfig | null
  onClose: () => void
}) {
  const { t } = useTranslation()

  if (!task) return null

  const Icon = task.icon
  const summary = summarizeTaskChecklist(task.checklist)
  const nextItem = findNextChecklistItem(task.checklist)

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/55 p-0 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-task-drawer-title"
        className="pointer-events-auto relative flex h-full min-h-0 w-full max-w-[42rem] flex-col overflow-hidden border-l border-border/80 bg-background shadow-2xl"
      >
        <div className="border-b border-border/70 bg-background/96 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/60">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('dashboard.task.drawerTitle')}
                  </p>
                  <h3 id="dashboard-task-drawer-title" className="text-[1.35rem] font-semibold tracking-tight text-foreground">
                    {task.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{task.outcome}</p>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="button-secondary px-3">
              <X className="h-4 w-4" />
              {t('common.close')}
            </button>
          </div>
        </div>

        <div className="border-b border-border/70 px-5 py-4 sm:px-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <DrawerMetric label={t('dashboard.task.statusReady')} value={String(summary.ready)} tone="ready" />
            <DrawerMetric label={t('dashboard.task.statusAttention')} value={String(summary.attention)} tone="attention" />
            <DrawerMetric label={t('dashboard.task.statusUnknown')} value={String(summary.unknown)} tone="unknown" />
          </div>
          {nextItem && (
            <div className="mt-4 rounded-[1.4rem] border border-border/70 bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('dashboard.task.nextAction')}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{nextItem.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{nextItem.hint}</p>
              <Link to={nextItem.to} onClick={onClose} className="button-primary mt-4">
                {t('dashboard.task.jumpToSection')}
              </Link>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="space-y-3">
            {task.checklist.map((item) => (
              <div key={item.id} className="rounded-[1.4rem] border border-border/70 bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <TaskStatusIcon status={item.status} className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${taskStatusToneClass(item.status)}`}>
                    {taskStatusLabel(t, item.status)}
                  </span>
                </div>
                <div className="mt-4 flex justify-end">
                  <Link to={item.to} onClick={onClose} className="button-secondary px-3 py-1.5 text-sm">
                    {t('dashboard.task.jumpToSection')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DrawerMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: Exclude<TaskChecklistTone, 'loading'>
}) {
  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 ${taskStatusToneClass(tone)}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function TaskStatusIcon({
  status,
  className = '',
}: {
  status: TaskChecklistTone
  className?: string
}) {
  if (status === 'ready') {
    return <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-300`.trim()} />
  }

  if (status === 'attention') {
    return <AlertCircle className={`${className} text-amber-600 dark:text-amber-300`.trim()} />
  }

  if (status === 'loading') {
    return <Loader2 className={`${className} animate-spin text-muted-foreground`.trim()} />
  }

  return <CircleDashed className={`${className} text-muted-foreground`.trim()} />
}

function summarizeTaskChecklist(checklist: TaskChecklistItem[]) {
  return checklist.reduce(
    (summary, item) => {
      if (item.status === 'ready') summary.ready += 1
      if (item.status === 'attention') summary.attention += 1
      if (item.status === 'unknown') summary.unknown += 1
      return summary
    },
    { total: checklist.length, ready: 0, attention: 0, unknown: 0 },
  )
}

function findNextChecklistItem(checklist: TaskChecklistItem[]) {
  return checklist.find((item) => item.status === 'attention')
    ?? checklist.find((item) => item.status === 'unknown')
    ?? checklist.find((item) => item.status === 'loading')
    ?? checklist[0]
}

function getChannelAccountCount(config: OpenClawConfig | null, channelId: string): number {
  const accounts = config?.channels?.[channelId]?.accounts
  return accounts ? Object.keys(accounts).length : 0
}

function isGatewayProtected(config: OpenClawConfig | null): boolean {
  const authMode = config?.gateway?.auth?.mode
  return Boolean(config?.gateway?.bind) && Boolean(authMode) && authMode !== 'none'
}

function getEnabledPluginCount(pluginsPayload: PluginsListPayload | null): number {
  return (pluginsPayload?.plugins ?? []).filter((plugin) => {
    const status = plugin.status?.trim().toLowerCase() ?? ''
    if (!status) return false
    if (/\bdisabled\b/.test(status) || /\boff\b/.test(status)) return false
    return /\benabled\b/.test(status) || /\bactive\b/.test(status) || /\bloaded\b/.test(status)
  }).length
}

function getEnabledSkillCount(skills: SkillInfo[]): number {
  return skills.filter((skill) => skill.disabled !== true).length
}

function taskStatusToneClass(status: Exclude<TaskChecklistTone, 'loading'> | TaskChecklistTone): string {
  if (status === 'ready') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'attention') return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'border-border/70 bg-background/80 text-muted-foreground'
}

function taskStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: TaskChecklistTone,
): string {
  if (status === 'ready') return t('dashboard.task.statusReady')
  if (status === 'attention') return t('dashboard.task.statusAttention')
  if (status === 'loading') return t('dashboard.task.statusLoading')
  return t('dashboard.task.statusUnknown')
}
