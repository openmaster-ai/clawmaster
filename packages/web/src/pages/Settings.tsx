import { useEffect, useState } from 'react'
import { platform } from '@/adapters'
import type { SystemInfo } from '@/lib/types'

type ThemeMode = 'system' | 'light' | 'dark'

function getStoredTheme(): ThemeMode {
  return (localStorage.getItem('clawmaster-theme') as ThemeMode) || 'system'
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (mode === 'system') {
    const preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.add(preferDark ? 'dark' : 'light')
  } else {
    root.classList.add(mode)
  }
  localStorage.setItem('clawmaster-theme', mode)
}

export default function Settings() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme)

  useEffect(() => {
    loadSystemInfo()
    applyTheme(theme)
  }, [])

  async function loadSystemInfo() {
    try {
      setLoading(true)
      const info = await platform.detectSystem()
      setSystemInfo(info)
    } catch (err) {
      console.error('Failed to load system info:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">设置</h1>

      {/* 外观 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">外观</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">主题:</label>
            <div className="flex gap-4">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="theme"
                    checked={theme === mode}
                    onChange={() => {
                      setTheme(mode)
                      applyTheme(mode)
                    }}
                  />
                  <span className="text-sm">
                    {mode === 'system' ? '跟随系统' : mode === 'light' ? '浅色' : '深色'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">语言:</label>
            <select className="px-3 py-1.5 bg-muted rounded border border-border">
              <option>简体中文</option>
              <option>English</option>
            </select>
          </div>
        </div>
      </section>

      {/* 系统 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">系统</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">开机时启动</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">显示系统托盘图标</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">关闭时最小化到托盘</span>
          </label>
        </div>
      </section>

      {/* 花费预算 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">花费预算</h3>
        <p className="text-sm text-muted-foreground mb-3">
          设置预算上限，超支时在可观测 Dashboard 显示告警
        </p>
        <div className="space-y-3">
          {(['day', 'week', 'month'] as const).map((period) => {
            const labels = { day: '日预算', week: '周预算', month: '月预算' }
            const key = `clawmaster-budget-${period}`
            return (
              <div key={period} className="flex items-center gap-4">
                <label className="w-20 text-sm text-muted-foreground">{labels[period]}:</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm">$</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="不限"
                    defaultValue={localStorage.getItem(key) ?? ''}
                    onChange={(e) => {
                      if (e.target.value) localStorage.setItem(key, e.target.value)
                      else localStorage.removeItem(key)
                    }}
                    className="w-24 px-2 py-1.5 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 系统信息 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">系统信息</h3>
        {systemInfo && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">OpenClaw</span>
              <span className={systemInfo.openclaw.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.openclaw.installed ? `v${systemInfo.openclaw.version}` : '未安装'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Node.js</span>
              <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.nodejs.installed ? systemInfo.nodejs.version : '未安装'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">npm</span>
              <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.npm.installed ? systemInfo.npm.version : '未安装'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">配置路径</span>
              <span className="font-mono text-xs">{systemInfo.openclaw.configPath}</span>
            </div>
          </div>
        )}
      </section>

      {/* 更新 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">更新</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>龙虾管家</span>
            <span className="text-muted-foreground">v0.1.0 (开发中)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>OpenClaw CLI</span>
            <span className="text-muted-foreground">
              {systemInfo?.openclaw.installed ? `v${systemInfo.openclaw.version}` : '未安装'}
            </span>
          </div>
          <button className="px-4 py-2 border border-border rounded hover:bg-accent">
            检查更新
          </button>
          <div className="flex items-center gap-4 mt-2">
            <label className="text-muted-foreground">更新通道:</label>
            <select className="px-3 py-1.5 bg-muted rounded border border-border">
              <option>Stable</option>
              <option>Beta</option>
              <option>Dev</option>
            </select>
          </div>
        </div>
      </section>

      {/* 危险操作 */}
      <section className="bg-card border border-red-500/50 rounded-lg p-4">
        <h3 className="font-medium text-red-500 mb-3">危险操作</h3>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-border rounded hover:bg-accent">
            重置配置
          </button>
          <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            卸载 OpenClaw
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          ⚠️ 这些操作不可逆，请谨慎操作
        </p>
      </section>

      {/* 关于 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-2">关于</h3>
        <p className="text-sm text-muted-foreground">龙虾管理大师 v0.3.0</p>
        <p className="text-sm text-muted-foreground">OpenClaw 生态的六边形战士</p>
        <p className="text-sm text-muted-foreground">由开源社区共建</p>
        <div className="mt-3 flex gap-4">
          <a 
            href="https://docs.openclaw.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            文档
          </a>
          <a 
            href="https://github.com/openclaw/openclaw" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub
          </a>
          <a 
            href="https://clawhub.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            ClawHub
          </a>
        </div>
      </section>
    </div>
  )
}
