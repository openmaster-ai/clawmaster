import { useEffect, useState } from 'react'
import { platform } from '@/adapters'
import type { GatewayStatus, OpenClawConfig } from '@/lib/types'

export default function Gateway() {
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [gw, cfg] = await Promise.all([
        platform.getGatewayStatus(),
        platform.getConfig(),
      ])
      setStatus(gw)
      setConfig(cfg)
    } catch (err) {
      console.error('Failed to load gateway data:', err)
    } finally {
      setLoading(false)
    }
  }

  /** 轮询等待网关状态变化 */
  async function pollStatus(expectRunning: boolean, maxRetries = 10): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      try {
        const gw = await platform.getGatewayStatus()
        setStatus(gw)
        if (gw.running === expectRunning) return true
      } catch {
        // 继续轮询
      }
    }
    return false
  }

  async function handleGatewayAction(action: 'start' | 'stop' | 'restart') {
    const labels = { start: '启动中...', stop: '停止中...', restart: '重启中...' }
    setOperating(labels[action])
    try {
      if (action === 'start') await platform.startGateway()
      else if (action === 'stop') await platform.stopGateway()
      else await platform.restartGateway()

      const expectRunning = action !== 'stop'
      const ok = await pollStatus(expectRunning)
      if (!ok) {
        alert(`操作超时，网关可能尚未${expectRunning ? '启动' : '停止'}完成`)
      }
      await loadData()
    } catch (err: any) {
      alert(`操作失败: ${err.message}`)
    } finally {
      setOperating(null)
    }
  }

  function copyToken() {
    const token = config?.gateway?.auth?.token
    if (token) {
      navigator.clipboard.writeText(token)
      alert('Token 已复制')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  const gatewayUrl = `ws://127.0.0.1:${config?.gateway?.port || 18789}`

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">网关管理</h1>
      
      {/* 状态指示 */}
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className={`w-4 h-4 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className={`text-2xl font-bold ${status?.running ? 'text-green-600' : 'text-red-600'}`}>
            {status?.running ? '运行中' : '已停止'}
          </span>
        </div>
        <p className="text-muted-foreground font-mono">{gatewayUrl}</p>
        <div className="mt-4 flex justify-center gap-3">
          {operating ? (
            <span className="px-4 py-2 text-muted-foreground animate-pulse">{operating}</span>
          ) : status?.running ? (
            <>
              <button
                onClick={() => handleGatewayAction('stop')}
                className="px-4 py-2 bg-red-500 text-primary-foreground rounded-lg hover:bg-red-600"
              >
                停止
              </button>
              <button
                onClick={() => handleGatewayAction('restart')}
                className="px-4 py-2 border border-border rounded-lg hover:bg-accent"
              >
                重启
              </button>
            </>
          ) : (
            <button
              onClick={() => handleGatewayAction('start')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              启动
            </button>
          )}
          <a 
            href={`http://127.0.0.1:${config?.gateway?.port || 18789}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-border rounded-lg hover:bg-accent"
          >
            在浏览器打开
          </a>
        </div>
      </div>

      {/* 配置概览 */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">配置</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">端口</p>
            <p className="font-mono font-medium">{config?.gateway?.port || 18789}</p>
          </div>
          <div>
            <p className="text-muted-foreground">绑定</p>
            <p className="font-medium">{config?.gateway?.bind || 'loopback'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">认证</p>
            <p className="font-medium">{config?.gateway?.auth?.mode || 'token'}</p>
          </div>
          {config?.gateway?.auth?.token && (
            <div>
              <p className="text-muted-foreground">Token</p>
              <button onClick={copyToken} className="text-xs text-primary hover:underline">点击复制</button>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          修改配置请前往「配置」页面编辑 JSON
        </p>
      </div>
    </div>
  )
}
