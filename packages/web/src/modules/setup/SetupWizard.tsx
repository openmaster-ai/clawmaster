import { useState, useCallback } from 'react'
import { getSetupAdapter } from './adapters'
import type { CapabilityStatus, InstallProgress, SetupPhase, CapabilityId } from './types'

interface SetupWizardProps {
  onComplete: () => void
}

/**
 * 安装向导
 *
 * 统一入口：检测 → 安装/补全 → 完成 → 进入 Dashboard
 * 支持 ?demo=install 模拟全流程
 */
export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [phase, setPhase] = useState<SetupPhase>('detecting')
  const [capabilities, setCapabilities] = useState<CapabilityStatus[]>([])
  const [installProgress, setInstallProgress] = useState<Record<CapabilityId, InstallProgress>>({} as any)
  const [error, setError] = useState<string | null>(null)

  const adapter = getSetupAdapter()

  // ─── 检测阶段 ───
  const startDetection = useCallback(async () => {
    setPhase('detecting')
    setError(null)

    try {
      const results = await adapter.detectCapabilities((status) => {
        setCapabilities((prev) => {
          const idx = prev.findIndex((c) => c.id === status.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = status
            return next
          }
          return [...prev, status]
        })
      })

      const allInstalled = results.every((r) => r.status === 'installed')
      setPhase(allInstalled ? 'done' : 'ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [adapter])

  // 首次挂载自动开始检测
  useState(() => {
    startDetection()
  })

  // ─── 安装阶段 ───
  const startInstall = useCallback(async () => {
    const missing = capabilities
      .filter((c) => c.status === 'not_installed')
      .map((c) => c.id)

    if (missing.length === 0) {
      setPhase('done')
      return
    }

    setPhase('installing')

    // 初始化进度状态
    const initialProgress: Record<string, InstallProgress> = {}
    for (const id of missing) {
      initialProgress[id] = { id, status: 'waiting' }
    }
    setInstallProgress(initialProgress as Record<CapabilityId, InstallProgress>)

    try {
      await adapter.installCapabilities(missing, (progress) => {
        setInstallProgress((prev) => ({ ...prev, [progress.id]: progress }))
        // 安装完成后更新 capabilities 状态
        if (progress.status === 'done') {
          setCapabilities((prev) =>
            prev.map((c) => (c.id === progress.id ? { ...c, status: 'installed' } : c)),
          )
        }
      })
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [adapter, capabilities])

  // ─── 渲染 ───

  const missingCount = capabilities.filter((c) => c.status === 'not_installed').length
  const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'install'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      {/* Logo */}
      <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center text-3xl mb-4 shadow-lg">
        🦞
      </div>
      <h1 className="text-2xl font-bold mb-1">龙虾管理大师</h1>
      <p className="text-sm text-muted-foreground mb-6">OpenClaw 生态的六边形战士</p>

      {isDemo && (
        <div className="mb-4 px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
          Demo 模式
        </div>
      )}

      {/* 检测中 */}
      {phase === 'detecting' && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">正在检测系统能力...</p>
          <CapabilityList capabilities={capabilities} />
        </div>
      )}

      {/* 检测完成，有缺失 → 显示安装按钮 */}
      {phase === 'ready' && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">
            检测到 {missingCount} 项能力未安装
          </p>
          <CapabilityList capabilities={capabilities} />
          <button
            onClick={startInstall}
            className="mt-6 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            一键安装全部能力
          </button>
        </div>
      )}

      {/* 安装中 */}
      {phase === 'installing' && (
        <div className="w-full max-w-md">
          <p className="text-center text-muted-foreground mb-4">正在安装...</p>
          <InstallList
            capabilities={capabilities}
            progress={installProgress}
          />
        </div>
      )}

      {/* 全部就绪 */}
      {phase === 'done' && (
        <div className="w-full max-w-md">
          <p className="text-center text-green-600 font-medium mb-4">全部就绪!</p>
          <CapabilityList capabilities={capabilities} />
          <button
            onClick={onComplete}
            className="mt-6 w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            进入管理大师
          </button>
        </div>
      )}

      {/* 错误 */}
      {phase === 'error' && (
        <div className="w-full max-w-md text-center">
          <p className="text-red-500 mb-4">{error ?? '发生未知错误'}</p>
          <button
            onClick={startDetection}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}

// ─── 子组件 ───

function CapabilityList({ capabilities }: { capabilities: CapabilityStatus[] }) {
  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {capabilities.map((cap) => (
        <div key={cap.id} className="flex items-center justify-between px-4 py-3">
          <span className="text-sm">{cap.name}</span>
          <CapabilityBadge status={cap.status} version={cap.version} />
        </div>
      ))}
    </div>
  )
}

function CapabilityBadge({ status, version }: { status: CapabilityStatus['status']; version?: string }) {
  switch (status) {
    case 'checking':
      return <span className="text-xs text-muted-foreground animate-pulse">检测中...</span>
    case 'installed':
      return (
        <span className="text-xs text-green-600">
          {version ? `v${version}` : '已安装'}
        </span>
      )
    case 'not_installed':
      return <span className="text-xs text-orange-500">未安装</span>
    case 'error':
      return <span className="text-xs text-red-500">检测失败</span>
  }
}

function InstallList({
  capabilities,
  progress,
}: {
  capabilities: CapabilityStatus[]
  progress: Record<CapabilityId, InstallProgress>
}) {
  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {capabilities.map((cap) => {
        const p = progress[cap.id]
        const isInstalling = p && (p.status === 'installing' || p.status === 'waiting')
        const isDone = cap.status === 'installed' || p?.status === 'done'
        const isError = p?.status === 'error'

        return (
          <div key={cap.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">{cap.name}</span>
              {isDone && <span className="text-xs text-green-600">已就绪</span>}
              {isError && <span className="text-xs text-red-500">失败</span>}
              {isInstalling && p?.status === 'installing' && (
                <span className="text-xs text-blue-500">{p.progress ?? 0}%</span>
              )}
              {isInstalling && p?.status === 'waiting' && (
                <span className="text-xs text-muted-foreground">等待中</span>
              )}
            </div>
            {p?.status === 'installing' && p.progress !== undefined && (
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
            )}
            {p?.log && (
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{p.log}</p>
            )}
            {p?.error && (
              <p className="text-xs text-red-500 mt-1">{p.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
