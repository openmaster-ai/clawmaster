import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [status, setStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const cap = CAPABILITIES.find((c) => c.id === capabilityId)
  const capName = cap?.name ? t(cap.name) : capabilityId

  // demo 模式下直接放行
  const isDemo = typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('demo')

  // 首次检测
  useState(() => {
    if (isDemo) { setStatus('available'); return }
    checkAvailable().then((ok) => setStatus(ok ? 'available' : 'unavailable')).catch(() => setStatus('unavailable'))
  })

  if (status === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">{t('capability.checking', { name: capName })}</p>
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
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
        <span className="text-muted-foreground text-xl font-bold">+</span>
      </div>
      <h3 className="text-lg font-medium mb-2">{t('capability.notEnabled', { name: capName })}</h3>
      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
        {unavailableMessage ?? t('capability.defaultUnavailable', { name: capName })}
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
          {installing ? t('capability.installing') : t('capability.install', { name: capName })}
        </button>
        <button
          onClick={() => checkAvailable().then((ok) => setStatus(ok ? 'available' : 'unavailable'))}
          className="px-4 py-2 border border-border rounded-lg hover:bg-accent"
        >
          {t('capability.recheck')}
        </button>
      </div>
    </div>
  )
}
