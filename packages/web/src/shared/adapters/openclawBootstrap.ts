import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

export interface DoctorFixBootstrapResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export interface GatewayStartBootstrapPiece {
  ok: boolean
  error?: string
}

export interface BootstrapAfterInstallResult {
  doctorFix: DoctorFixBootstrapResult
  gatewayStart: GatewayStartBootstrapPiece
}

export function formatBootstrapSummary(r: AdapterResult<BootstrapAfterInstallResult>): string {
  if (!r.success || !r.data) {
    return `初始化请求失败：${r.error ?? '未知'}。请在终端执行 openclaw doctor --fix，并在「网关」页启动。`
  }
  const { doctorFix, gatewayStart } = r.data
  const parts: string[] = []
  parts.push(
    doctorFix.ok
      ? '✓ openclaw doctor --fix 已执行'
      : `⚠ doctor --fix 未完成（退出码 ${doctorFix.code}）`
  )
  if (!doctorFix.ok && doctorFix.stderr.trim()) {
    parts.push(doctorFix.stderr.trim().slice(0, 500))
  }
  parts.push(
    gatewayStart.ok
      ? '✓ 已尝试启动网关（若仍为停止，请到「网关」页再试）'
      : `⚠ 网关：${gatewayStart.error ?? '未启动'}`
  )
  return parts.join('\n')
}

export async function bootstrapAfterInstallResult(): Promise<
  AdapterResult<BootstrapAfterInstallResult>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<BootstrapAfterInstallResult>('bootstrap_openclaw_after_install')
    )
  }
  return webFetchJson<BootstrapAfterInstallResult>('/api/openclaw/bootstrap-after-install', {
    method: 'POST',
  })
}
