import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'
import i18n from '@/i18n'

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
    return i18n.t('bootstrap.requestFailed', {
      detail: r.error ?? i18n.t('common.unknownError'),
    })
  }
  const { doctorFix, gatewayStart } = r.data
  const parts: string[] = []
  parts.push(
    doctorFix.ok
      ? i18n.t('bootstrap.doctorOk')
      : i18n.t('bootstrap.doctorWarn', { code: doctorFix.code })
  )
  if (!doctorFix.ok && doctorFix.stderr.trim()) {
    parts.push(doctorFix.stderr.trim().slice(0, 500))
  }
  parts.push(
    gatewayStart.ok
      ? i18n.t('bootstrap.gatewayOk')
      : i18n.t('bootstrap.gatewayWarn', {
          detail: gatewayStart.error ?? i18n.t('common.unknownError'),
        })
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
