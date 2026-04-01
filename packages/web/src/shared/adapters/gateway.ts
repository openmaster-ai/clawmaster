import i18n from '@/i18n'
import type { GatewayStatus, WhatsAppLoginStatus } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'

export async function getGatewayStatusResult(): Promise<AdapterResult<GatewayStatus>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<GatewayStatus>('get_gateway_status'))
  }
  return webFetchJson<GatewayStatus>('/api/gateway/status')
}

export async function startGatewayResult(): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke('start_gateway'))
  }
  return webFetchVoid('/api/gateway/start', { method: 'POST' })
}

export async function stopGatewayResult(): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke('stop_gateway'))
  }
  return webFetchVoid('/api/gateway/stop', { method: 'POST' })
}

export async function restartGatewayResult(): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke('restart_gateway'))
  }
  return webFetchVoid('/api/gateway/restart', { method: 'POST' })
}

export async function startWhatsAppLoginResult(): Promise<AdapterResult<WhatsAppLoginStatus>> {
  if (getIsTauri()) {
    return fromPromise(async () => ({
      status: 'failed',
      message: i18n.t('adapters.whatsappTauriUnsupported'),
      updatedAt: new Date().toISOString(),
    }))
  }
  return webFetchJson<WhatsAppLoginStatus>('/api/whatsapp/login/start', { method: 'POST' })
}

export async function getWhatsAppLoginStatusResult(): Promise<AdapterResult<WhatsAppLoginStatus>> {
  if (getIsTauri()) {
    return fromPromise(async () => ({
      status: 'idle',
      message: i18n.t('adapters.whatsappTauriUnsupported'),
      updatedAt: new Date().toISOString(),
    }))
  }
  return webFetchJson<WhatsAppLoginStatus>('/api/whatsapp/login/status')
}

export async function cancelWhatsAppLoginResult(): Promise<AdapterResult<WhatsAppLoginStatus>> {
  if (getIsTauri()) {
    return fromPromise(async () => ({
      status: 'idle',
      message: i18n.t('adapters.whatsappCancelled'),
      updatedAt: new Date().toISOString(),
    }))
  }
  return webFetchJson<WhatsAppLoginStatus>('/api/whatsapp/login/cancel', { method: 'POST' })
}
