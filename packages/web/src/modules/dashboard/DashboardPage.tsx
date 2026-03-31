import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { platformResults } from '@/adapters'
import { formatBootstrapSummary } from '@/shared/adapters/openclawBootstrap'
import type { SystemInfo, GatewayStatus, OpenClawConfig, OpenClawChannelEntry } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { allSuccess2 } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import LoadingState from '@/shared/components/LoadingState'

export default function Dashboard() {
  /** First paint: gateway + config only; detectSystem is slow (many subprocesses), load async */
  const fetcher = useCallback(async (): Promise<
    AdapterResult<{
      gateway: GatewayStatus
      config: OpenClawConfig
    }>
  > => {
    const [gw, cfg] = await Promise.all([
      platformResults.getGatewayStatus(),
      platformResults.getConfig(),
    ])
    const combined = allSuccess2(gw, cfg)
    if (!combined.success) {
      return fail(combined.error ?? '加载失败')
    }
    const bundle = combined.data!
    return ok({
      gateway: bundle.a,
      config: bundle.b,
    })
  }, [])

  const { data, loading, error, refetch } = useAdapterCall(fetcher)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    void platformResults.detectSystem().then((r) => {
      if (cancelled || !r.success || !r.data) return
      setSystemInfo(r.data)
    })
    return () => {
      cancelled = true
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
    void refetch()
  }, [refetch])

  if (loading) {
    return <LoadingState message="加载概览…" />
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-red-500 text-sm">
        <p>加载失败：{error ?? '未知错误'}</p>
      </div>
    )
  }

  const { gateway: gatewayStatus, config } = data

  const channelCount = config?.channels ? Object.keys(config.channels).length : 0
  const agentCount = config?.agents?.list?.length || 0
  const configKeyCount = config ? Object.keys(config as object).length : 0
  const needsBootstrapCta = configKeyCount === 0 && !gatewayStatus.running

  /** Show port from CLI/probe when gateway.port is not set in config */
  const gatewayPortDisplay =
    config?.gateway?.port != null ? config.gateway.port : gatewayStatus.port
  const gatewayBindDisplay =
    config?.gateway?.bind != null && String(config.gateway.bind).trim() !== ''
      ? String(config.gateway.bind)
      : gatewayStatus.running
        ? '未写入配置（使用默认）'
        : '—'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">概览</h1>

      {needsBootstrapCta && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100 mb-2">
            配置为空且网关未运行
          </p>
          <p className="text-muted-foreground mb-3">
            常见于全新安装或重装后。可尝试一键执行{' '}
            <code className="font-mono text-xs">openclaw doctor --fix</code> 并启动网关；完整能力请在终端运行{' '}
            <code className="font-mono text-xs">openclaw onboard</code>。
          </p>
          <button
            type="button"
            disabled={bootstrapBusy}
            onClick={() => void handleBootstrap()}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {bootstrapBusy ? '执行中…' : '一键初始化并启动网关'}
          </button>
          {bootstrapHint ? (
            <pre className="mt-3 font-mono text-xs whitespace-pre-wrap break-all text-muted-foreground max-h-48 overflow-y-auto">
              {bootstrapHint}
            </pre>
          ) : null}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-2">系统环境</h3>
        {systemInfo ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">正在检测 Node / npm / OpenClaw…</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">网关状态</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${gatewayStatus?.running ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span>{gatewayStatus?.running ? '运行中' : '已停止'}</span>
            </div>
            <p className="text-muted-foreground">端口: {gatewayPortDisplay}</p>
            <p className="text-muted-foreground">绑定: {gatewayBindDisplay}</p>
            <p className="text-muted-foreground">认证: {config?.gateway?.auth?.mode || '—'}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/gateway"
              className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90"
            >
              管理
            </Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">通道连接</h3>
          <div className="space-y-2 text-sm">
            {config?.channels &&
              Object.entries(config.channels).map(([name, ch]: [string, OpenClawChannelEntry]) => (
                <div key={name} className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <span className="capitalize">{name}</span>
                  {ch.accounts != null && typeof ch.accounts === 'object' ? (
                    <span className="text-muted-foreground">
                      ({Object.keys(ch.accounts).length} 账号)
                    </span>
                  ) : null}
                </div>
              ))}
            {channelCount === 0 && <p className="text-muted-foreground">暂无通道配置</p>}
          </div>
          <Link
            to="/channels"
            className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
          >
            管理通道
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">当前模型</h3>
          <p className="text-lg font-medium">{config?.agents?.defaults?.model?.primary || '-'}</p>
          <p className="text-sm text-muted-foreground">
            工作区: {config?.agents?.defaults?.workspace || '-'}
          </p>
          <Link
            to="/models"
            className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
          >
            配置模型
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-3">代理</h3>
          <p className="text-lg font-medium">{agentCount} 个已配置</p>
          {config?.agents?.list?.slice(0, 3).map((agent) => (
            <p key={agent.id} className="text-sm text-muted-foreground">
              • {agent.name || agent.id}
            </p>
          ))}
          <Link
            to="/agents"
            className="mt-3 inline-block px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
          >
            管理代理
          </Link>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">快捷操作</h3>
        <div className="flex gap-3">
          <a
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90"
          >
            📚 OpenClaw 文档
          </a>
          <Link
            to="/logs"
            className="px-4 py-2 text-sm border border-border rounded hover:bg-accent"
          >
            📝 查看日志
          </Link>
          <Link
            to="/config"
            className="px-4 py-2 text-sm border border-border rounded hover:bg-accent"
          >
            ⚙️ 编辑配置
          </Link>
        </div>
      </div>
    </div>
  )
}
