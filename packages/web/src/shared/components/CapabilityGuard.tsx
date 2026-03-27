import { useState } from 'react'
import { CAPABILITIES, type CapabilityId } from '@/modules/setup/types'
import { getSetupAdapter } from '@/modules/setup/adapters'

interface CapabilityGuardProps {
  /** 当前模块需要的能力 ID */
  capabilityId: CapabilityId
  /** 连接检测函数：返回 true 表示能力可用 */
  checkAvailable: () => Promise<boolean>
  /** 能力可用时渲染的内容 */
  children: React.ReactNode
  /** 自定义不可用时的提示文案 */
  unavailableMessage?: string
}

/**
 * 能力守卫组件
 *
 * 包裹在模块页面外层，检测依赖能力是否可用：
 * - 可用 → 渲染 children
 * - 不可用 → 显示引导安装 UI
 *
 * @example
 * <CapabilityGuard capabilityId="observe" checkAvailable={async () => (await getProbeStatus()).success}>
 *   <ObserveContent />
 * </CapabilityGuard>
 */
export function CapabilityGuard({
  capabilityId,
  checkAvailable,
  children,
  unavailableMessage,
}: CapabilityGuardProps) {
  const [status, setStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const cap = CAPABILITIES.find((c) => c.id === capabilityId)
  const capName = cap?.name ?? capabilityId

  // 首次检测
  useState(() => {
    checkAvailable().then((ok) => setStatus(ok ? 'available' : 'unavailable')).catch(() => setStatus('unavailable'))
  })

  if (status === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">正在检测{capName}...</p>
      </div>
    )
  }

  if (status === 'available') {
    return <>{children}</>
  }

  // 不可用 → 引导安装
  async function handleInstall() {
    if (!cap) return
    setInstalling(true)
    setInstallError(null)
    try {
      const adapter = getSetupAdapter()
      await adapter.installCapabilities([capabilityId], () => {})
      // 安装完重新检测
      const ok = await checkAvailable()
      setStatus(ok ? 'available' : 'unavailable')
      if (!ok) setInstallError('安装完成但能力检测仍失败，请检查配置')
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 p-8">
      <div className="text-4xl mb-4">🔧</div>
      <h3 className="text-lg font-medium mb-2">{capName}尚未启用</h3>
      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
        {unavailableMessage ?? `此功能需要「${capName}」支持。点击下方按钮一键安装。`}
      </p>
      {installError && (
        <p className="text-sm text-red-500 mb-3">{installError}</p>
      )}
      <div className="flex gap-3">
        <button
          onClick={handleInstall}
          disabled={installing}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {installing ? '安装中...' : `安装${capName}`}
        </button>
        <button
          onClick={() => checkAvailable().then((ok) => setStatus(ok ? 'available' : 'unavailable'))}
          className="px-4 py-2 border border-border rounded-lg hover:bg-accent"
        >
          重新检测
        </button>
      </div>
    </div>
  )
}
