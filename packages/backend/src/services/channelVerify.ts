import https from 'node:https'
import { getWhatsAppLoginStatus } from './whatsappLogin.js'

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function requestJson(
  url: string,
  init?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; json: unknown; raw: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        method: init?.method ?? 'GET',
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        port: u.port || 443,
        headers: init?.headers,
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => {
          buf += String(c)
        })
        res.on('end', () => {
          let json: unknown = null
          try {
            json = JSON.parse(buf)
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode ?? 0, json, raw: buf })
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(8000, () => req.destroy(new Error('Request timeout')))
    if (init?.body) req.write(init.body)
    req.end()
  })
}

function mustString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing required field: ${field}`)
  return v.trim()
}

export type VerifyResponse = {
  ok: boolean
  message: string
  detail?: string
}

export async function verifyChannelAccount(
  type: string,
  account: Record<string, unknown>
): Promise<VerifyResponse> {
  if (type === 'telegram') {
    const botToken = mustString(account.botToken, 'botToken')
    const resp = await requestJson(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`)
    const data = asRecord(resp.json)
    if (resp.status === 200 && data?.ok === true) return { ok: true, message: 'Telegram Bot Token 校验成功' }
    return { ok: false, message: 'Telegram Bot Token 校验失败', detail: resp.raw.slice(0, 320) }
  }

  if (type === 'discord') {
    const token = mustString(account.token, 'token')
    const resp = await requestJson('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    })
    const data = asRecord(resp.json)
    if (resp.status === 200 && typeof data?.id === 'string') return { ok: true, message: 'Discord Bot Token 校验成功' }
    return { ok: false, message: 'Discord Bot Token 校验失败', detail: resp.raw.slice(0, 320) }
  }

  if (type === 'feishu') {
    const appId = mustString(account.appId, 'appId')
    const appSecret = mustString(account.appSecret, 'appSecret')
    const domain = typeof account.domain === 'string' && account.domain.toLowerCase() === 'lark' ? 'open.larksuite.com' : 'open.feishu.cn'
    const body = JSON.stringify({ app_id: appId, app_secret: appSecret })
    const resp = await requestJson(`https://${domain}/open-apis/auth/v3/app_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) },
      body,
    })
    const data = asRecord(resp.json)
    if (resp.status === 200 && data?.code === 0) return { ok: true, message: '飞书/Lark 凭证校验成功' }
    return { ok: false, message: '飞书/Lark 凭证校验失败', detail: resp.raw.slice(0, 320) }
  }

  if (type === 'slack') {
    const botToken = mustString(account.botToken, 'botToken')
    const auth = await requestJson('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}` },
    })
    const authData = asRecord(auth.json)
    if (auth.status !== 200 || authData?.ok !== true) {
      return { ok: false, message: 'Slack Bot Token 校验失败', detail: auth.raw.slice(0, 320) }
    }
    const mode = typeof account.mode === 'string' ? account.mode : 'socket'
    if (mode === 'socket' && typeof account.appToken === 'string' && account.appToken.trim()) {
      const open = await requestJson('https://slack.com/api/apps.connections.open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.appToken.trim()}` },
      })
      const openData = asRecord(open.json)
      if (open.status !== 200 || openData?.ok !== true) {
        return { ok: false, message: 'Slack App Token 校验失败', detail: open.raw.slice(0, 320) }
      }
    }
    return { ok: true, message: 'Slack 凭证校验成功' }
  }

  if (type === 'whatsapp') {
    const st = getWhatsAppLoginStatus()
    if (st.status === 'authorized') return { ok: true, message: 'WhatsApp 已登录' }
    return {
      ok: false,
      message: 'WhatsApp 当前未登录，请先在 Gateway 页面发起扫码登录',
      detail: st.message,
    }
  }

  throw new Error(`Unsupported channel type: ${type}`)
}
