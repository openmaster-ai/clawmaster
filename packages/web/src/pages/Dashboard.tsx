import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { BarChart3, Brain, Zap, ExternalLink, ScrollText, Settings2 } from 'lucide-react'
import type { SystemInfo, GatewayStatus, OpenClawConfig } from '@/lib/types'

export default function Dashboard() {
  const { t } = useTranslation()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [sys, gw, cfg] = await Promise.all([
          platform.detectSystem(),
          platform.getGatewayStatus(),
          platform.getConfig(),
        ])
        setSystemInfo(sys)
        setGatewayStatus(gw)
        setConfig(cfg)
        setError(null)
      } catch (err: any) {
        console.error('Failed to load dashboard data:', err)
        setError(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{t('common.error')}: {error}</div>
      </div>
    )
  }

  // 计算通道数量
  const channelCount = config?.channels ? Object.keys(config.channels).length : 0

  // 计算代理数量
  const agentCount = config?.agents?.list?.length || 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>

      {/* 系统信息 */}
      {systemInfo && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-2">{t('dashboard.systemEnv')}</h3>
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
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* 网关状态 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.gatewayStatus')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${gatewayStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>{gatewayStatus?.running ? t('dashboard.running') : t('dashboard.stopped')}</span>
            </div>
            <p className="text-muted-foreground">{t('gateway.port')}: {config?.gateway?.port || '-'}</p>
            <p className="text-muted-foreground">{t('gateway.bind')}: {config?.gateway?.bind || '-'}</p>
            <p className="text-muted-foreground">{t('gateway.auth')}: {config?.gateway?.auth?.mode || '-'}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <Link to="/gateway" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90">
              {t('dashboard.manage')}
            </Link>
          </div>
        </div>

        {/* 通道连接 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.channelConnection')}</h3>
          <div className="space-y-2 text-sm">
            {config?.channels && Object.entries(config.channels).map(([name, ch]: [string, any]) => (
              <div key={name} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <span className="capitalize">{name}</span>
                {ch.accounts && (
                  <span className="text-muted-foreground">({Object.keys(ch.accounts).length} 账号)</span>
                )}
              </div>
            ))}
            {channelCount === 0 && (
              <p className="text-muted-foreground">{t('dashboard.noChannelConfig')}</p>
            )}
          </div>
          <Link to="/channels" className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent">
            {t('dashboard.manageChannels')}
          </Link>
        </div>

        {/* 当前模型 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.currentModel')}</h3>
          <p className="text-lg font-medium">{config?.agents?.defaults?.model?.primary || '-'}</p>
          <p className="text-sm text-muted-foreground">
            {t('agents.workspace')}: {config?.agents?.defaults?.workspace || '-'}
          </p>
          <Link to="/models" className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent">
            {t('dashboard.configModel')}
          </Link>
        </div>

        {/* 代理 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">{t('dashboard.agents')}</h3>
          <p className="text-lg font-medium">{t('dashboard.agentsConfigured', { count: agentCount })}</p>
          {config?.agents?.list?.slice(0, 3).map((agent: any) => (
            <p key={agent.id} className="text-sm text-muted-foreground">
              • {agent.name || agent.id}
            </p>
          ))}
          <Link to="/agents" className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent">
            {t('dashboard.manageAgents')}
          </Link>
        </div>
      </div>

      {/* 六大核心速览 */}
      <div className="grid grid-cols-3 gap-4">
        <Link to="/observe" className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-medium">{t('dashboard.costTracking')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('dashboard.costTrackingDesc')}</p>
        </Link>
        <Link to="/memory" className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-primary" />
            <h3 className="font-medium">{t('dashboard.memoryManagement')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('dashboard.memoryManagementDesc')}</p>
        </Link>
        <Link to="/skills" className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="font-medium">{t('dashboard.skillMarket')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{t('dashboard.skillMarketDesc')}</p>
        </Link>
      </div>

      {/* 快捷操作 */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('dashboard.quickActions')}</h3>
        <div className="flex gap-3">
          <a 
            href="http://localhost:18789" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            <ExternalLink className="w-4 h-4 inline mr-1" />{t('dashboard.openConsole')}
          </a>
          <Link to="/logs" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent flex items-center gap-1">
            <ScrollText className="w-4 h-4" />{t('dashboard.viewLogs')}
          </Link>
          <Link to="/config" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent flex items-center gap-1">
            <Settings2 className="w-4 h-4" />{t('dashboard.editConfig')}
          </Link>
        </div>
      </div>
    </div>
  )
}
