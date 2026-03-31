import { useCallback } from 'react'
import { platformResults } from '@/adapters'
import type { OpenClawAgentListItem, OpenClawBinding } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'

export default function Agents() {
  const fetcher = useCallback(async () => platformResults.getConfig(), [])
  const { data: config, loading, error } = useAdapterCall(fetcher)

  if (loading) {
    return <LoadingState message="加载代理…" />
  }

  if (error || config === null) {
    return (
      <div className="py-16 text-center text-sm text-red-500">
        {error ? `加载失败：${error}` : '暂无配置数据'}
      </div>
    )
  }

  const agents = config?.agents?.list || []
  const defaults = config?.agents?.defaults || {}

  // Icon map for known agent ids
  const agentIcons: Record<string, string> = {
    cipher: '🔐',
    vector: '🎯',
    anya: '🌸',
    hugo: '🎭',
    main: '🏠',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">代理管理</h1>
        <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90">
          + 创建代理
        </button>
      </div>

      {/* Default settings */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">默认设置</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">默认模型: </span>
            <span className="font-medium">{defaults.model?.primary || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">工作区: </span>
            <span className="font-mono">{defaults.workspace || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">最大并发: </span>
            <span className="font-medium">{defaults.maxConcurrent || '-'}</span>
          </div>
        </div>
      </div>

      {/* Agent list */}
      <div className="space-y-3">
        {agents.map((agent: OpenClawAgentListItem) => (
          <div
            key={agent.id}
            className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {agentIcons[agent.id] || agentIcons[agent.id.toLowerCase()] || '🤖'}
                </span>
                <span className="font-medium">{agent.name || agent.id}</span>
                <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {agent.model || defaults.model?.primary}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                工作区: <span className="font-mono">{agent.workspace || defaults.workspace}</span>
              </p>
              {agent.agentDir && (
                <p className="text-xs text-muted-foreground mt-1">
                  配置: <span className="font-mono">{agent.agentDir}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent">
                编辑
              </button>
              {agent.id !== 'main' && (
                <button className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent text-red-500">
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          暂无代理配置
        </div>
      )}

      {/* Route bindings */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">路由绑定</h3>
        <p className="text-sm text-muted-foreground mb-3">不同通道的消息可以路由到不同的代理</p>
        {config?.bindings?.map((binding: OpenClawBinding, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-sm py-1">
            <span className="capitalize bg-muted px-2 py-0.5 rounded">
              {binding.match?.channel}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium">{binding.agentId}</span>
          </div>
        ))}
        {!config?.bindings?.length && <p className="text-sm text-muted-foreground">无路由绑定</p>}
      </div>

      <div className="text-xs text-muted-foreground">
        💡 代理配置需要编辑配置文件，请前往「配置」页面
      </div>
    </div>
  )
}
