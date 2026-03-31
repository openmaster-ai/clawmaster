import { useCallback, useState } from 'react'
import { platformResults } from '@/adapters'
import type { GatewayStatus, OpenClawConfig } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { allSuccess2 } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import LoadingState from '@/shared/components/LoadingState'

export default function Gateway() {
  const fetcher = useCallback(async (): Promise<
    AdapterResult<{ status: GatewayStatus; config: OpenClawConfig }>
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
    return ok({ status: bundle.a, config: bundle.b })
  }, [])

  const { data, loading, error, refetch } = useAdapterCall(fetcher)
  const [startBusy, setStartBusy] = useState(false)

  async function handleStart() {
    setStartBusy(true)
    try {
      const r = await platformResults.startGateway()
      if (!r.success) {
        alert(`启动失败: ${r.error ?? '未知错误'}`)
        return
      }
      for (let i = 0; i < 30; i++) {
        await new Promise((res) => setTimeout(res, 500))
        const gw = await platformResults.getGatewayStatus()
        if (gw.success && gw.data?.running) {
          await refetch()
          return
        }
      }
      await refetch()
      alert(
        '仍未检测到网关已运行。若端口被占用或配置有误，请在系统终端执行 `openclaw gateway start` 查看报错，或打开「日志」页排查。'
      )
    } finally {
      setStartBusy(false)
    }
  }

  async function handleStop() {
    const r = await platformResults.stopGateway()
    if (!r.success) {
      alert(`停止失败: ${r.error ?? '未知错误'}`)
      return
    }
    window.setTimeout(() => void refetch(), 1000)
  }

  async function handleRestart() {
    const r = await platformResults.restartGateway()
    if (!r.success) {
      alert(`重启失败: ${r.error ?? '未知错误'}`)
      return
    }
    window.setTimeout(() => void refetch(), 1000)
  }

  function copyToken() {
    const token = data?.config?.gateway?.auth?.token
    if (token) {
      void navigator.clipboard.writeText(token)
      alert('Token 已复制')
    }
  }

  if (loading) {
    return <LoadingState message="加载网关…" />
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center text-sm text-red-500">加载失败：{error ?? '未知错误'}</div>
    )
  }

  const { status, config } = data
  const gatewayUrl = `ws://127.0.0.1:${config?.gateway?.port || 18789}`

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">网关管理</h1>

      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span
            className={`w-4 h-4 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
          />
          <span
            className={`text-2xl font-bold ${status?.running ? 'text-green-600' : 'text-red-600'}`}
          >
            {status?.running ? '运行中' : '已停止'}
          </span>
        </div>
        <p className="text-muted-foreground font-mono">{gatewayUrl}</p>
        <p className="text-xs text-muted-foreground max-w-lg mx-auto mt-3 text-left leading-relaxed">
          这是 <span className="font-mono">WebSocket</span> 网关地址，供 OpenClaw 客户端与代理连接；用浏览器访问{' '}
          <span className="font-mono">http://</span> 同端口通常<strong>不会</strong>出现网页，属正常现象。
          图形化管理即本应用；无需单独再启动「dashboard」。
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {status?.running ? (
            <>
              <button
                type="button"
                onClick={() => void handleStop()}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                停止
              </button>
              <button
                type="button"
                onClick={() => void handleRestart()}
                className="px-4 py-2 border border-border rounded hover:bg-accent"
              >
                重启
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={startBusy}
              onClick={() => void handleStart()}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {startBusy ? '正在启动…' : '启动'}
            </button>
          )}
          <a
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-border rounded hover:bg-accent"
          >
            OpenClaw 文档
          </a>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-4">配置</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="w-24 text-sm text-muted-foreground">端口:</label>
            <input
              type="number"
              value={config?.gateway?.port || 18789}
              className="px-3 py-1.5 bg-muted rounded border border-border w-32"
              readOnly
            />
            <span className="text-xs text-muted-foreground">（只读，需在配置文件中修改）</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="w-24 text-sm text-muted-foreground">绑定模式:</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={config?.gateway?.bind === 'loopback'} readOnly />
                <span>本地</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={config?.gateway?.bind === 'lan'} readOnly />
                <span>局域网</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={config?.gateway?.bind === 'tailnet'} readOnly />
                <span>Tailscale</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="w-24 text-sm text-muted-foreground">认证方式:</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={config?.gateway?.auth?.mode === 'token'} readOnly />
                <span>Token</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={config?.gateway?.auth?.mode === 'password'} readOnly />
                <span>密码</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={config?.gateway?.auth?.mode === 'none'} readOnly />
                <span>无</span>
              </label>
            </div>
          </div>
          {config?.gateway?.auth?.mode === 'token' && config?.gateway?.auth?.token && (
            <div className="flex items-center gap-4">
              <label className="w-24 text-sm text-muted-foreground">Token:</label>
              <input
                type="password"
                value={config.gateway.auth.token}
                className="flex-1 px-3 py-1.5 bg-muted rounded border border-border font-mono text-sm"
                readOnly
              />
              <button
                type="button"
                onClick={copyToken}
                className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
              >
                复制
              </button>
            </div>
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          💡 配置修改需要编辑配置文件，请前往「配置」页面
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">最近日志</h3>
        <div className="bg-muted rounded p-3 text-sm font-mono text-muted-foreground h-32 overflow-auto">
          <p>12:34:56 [INFO] Gateway started on port {config?.gateway?.port || 18789}</p>
          <p className="text-xs text-muted-foreground mt-2">完整日志请前往「日志」页面查看</p>
        </div>
      </div>
    </div>
  )
}
