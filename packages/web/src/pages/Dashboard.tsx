import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { platform } from '@/adapters'
import type { SystemInfo, GatewayStatus, OpenClawConfig } from '@/lib/types'

export default function Dashboard() {
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
        setError(err.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">错误: {error}</div>
      </div>
    )
  }

  // 计算通道数量
  const channelCount = config?.channels ? Object.keys(config.channels).length : 0

  // 计算代理数量
  const agentCount = config?.agents?.list?.length || 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">概览</h1>
      
      {/* 系统信息 */}
      {systemInfo && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-2">系统环境</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Node.js: </span>
              <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.nodejs.installed ? systemInfo.nodejs.version : '未安装'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">npm: </span>
              <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.npm.installed ? systemInfo.npm.version : '未安装'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">OpenClaw: </span>
              <span className={systemInfo.openclaw.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.openclaw.installed ? `v${systemInfo.openclaw.version}` : '未安装'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* 网关状态 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">网关状态</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${gatewayStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>{gatewayStatus?.running ? '运行中' : '已停止'}</span>
            </div>
            <p className="text-muted-foreground">端口: {config?.gateway?.port || '-'}</p>
            <p className="text-muted-foreground">绑定: {config?.gateway?.bind || '-'}</p>
            <p className="text-muted-foreground">认证: {config?.gateway?.auth?.mode || '-'}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <Link to="/gateway" className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90">
              管理
            </Link>
          </div>
        </div>

        {/* 通道连接 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">通道连接</h3>
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
              <p className="text-muted-foreground">暂无通道配置</p>
            )}
          </div>
          <Link to="/channels" className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent">
            管理通道
          </Link>
        </div>

        {/* 当前模型 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">当前模型</h3>
          <p className="text-lg font-medium">{config?.agents?.defaults?.model?.primary || '-'}</p>
          <p className="text-sm text-muted-foreground">
            工作区: {config?.agents?.defaults?.workspace || '-'}
          </p>
          <Link to="/models" className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent">
            配置模型
          </Link>
        </div>

        {/* 代理 */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">代理</h3>
          <p className="text-lg font-medium">{agentCount} 个已配置</p>
          {config?.agents?.list?.slice(0, 3).map((agent: any) => (
            <p key={agent.id} className="text-sm text-muted-foreground">
              • {agent.name || agent.id}
            </p>
          ))}
          <Link to="/agents" className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent">
            管理代理
          </Link>
        </div>
      </div>

      {/* 六大核心速览 */}
      <div className="grid grid-cols-3 gap-4">
        <Link to="/observe" className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💰</span>
            <h3 className="font-medium">费用追踪</h3>
          </div>
          <p className="text-sm text-muted-foreground">查看 Token 消耗、API 费用、上下文健康度</p>
        </Link>
        <Link to="/memory" className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧠</span>
            <h3 className="font-medium">记忆管理</h3>
          </div>
          <p className="text-sm text-muted-foreground">PowerMem 智能记忆，Token 降 96%</p>
        </Link>
        <Link to="/skills" className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚡</span>
            <h3 className="font-medium">技能市场</h3>
          </div>
          <p className="text-sm text-muted-foreground">拍照答题、错题本、发票整理，开箱即用</p>
        </Link>
      </div>

      {/* 快捷操作 */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">快捷操作</h3>
        <div className="flex gap-3">
          <a 
            href="http://localhost:18789" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
          >
            📊 打开控制台
          </a>
          <Link to="/logs" className="px-4 py-2 text-sm border border-border rounded hover:bg-accent">
            📝 查看日志
          </Link>
          <Link to="/config" className="px-4 py-2 text-sm border border-border rounded hover:bg-accent">
            ⚙️ 编辑配置
          </Link>
        </div>
      </div>
    </div>
  )
}
