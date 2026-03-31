import { execOpenclaw } from '../execOpenclaw.js'

type WhatsAppLoginState = {
  status: 'idle' | 'pending' | 'authorized' | 'failed'
  qr?: string
  message?: string
  updatedAt: string
}

const state: WhatsAppLoginState = {
  status: 'idle',
  updatedAt: new Date().toISOString(),
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const text = raw.trim()
  if (!text) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function update(next: Partial<WhatsAppLoginState>) {
  Object.assign(state, next, { updatedAt: new Date().toISOString() })
}

export function getWhatsAppLoginStatus() {
  return { ...state }
}

async function tryExecCandidates(candidates: string[][]) {
  let last: Awaited<ReturnType<typeof execOpenclaw>> | null = null
  for (const args of candidates) {
    const out = await execOpenclaw(args)
    last = out
    if (out.code === 0) return out
  }
  return last ?? execOpenclaw(['gateway', 'status'])
}

export async function startWhatsAppLogin(): Promise<WhatsAppLoginState> {
  update({ status: 'pending', message: '正在拉起扫码登录流程…', qr: undefined })
  const out = await tryExecCandidates([
    ['gateway', 'web.login.start', '--json'],
    ['gateway', 'web', 'login', 'start', '--json'],
    ['web.login.start', '--json'],
    ['web', 'login', 'start', '--json'],
  ])
  if (out.code !== 0) {
    update({
      status: 'failed',
      message: (out.stderr || out.stdout || '启动扫码流程失败').slice(0, 400),
      qr: undefined,
    })
    return getWhatsAppLoginStatus()
  }
  const raw = [out.stdout, out.stderr].filter(Boolean).join('\n')
  const parsed = parseJsonLoose(raw)
  const qr =
    typeof parsed?.qr === 'string'
      ? parsed.qr
      : typeof parsed?.qrcode === 'string'
        ? parsed.qrcode
        : undefined
  const status = typeof parsed?.status === 'string' ? parsed.status.toLowerCase() : ''
  if (status.includes('authorized') || status.includes('success')) {
    update({ status: 'authorized', message: 'WhatsApp 已授权', qr: undefined })
  } else {
    update({
      status: 'pending',
      qr,
      message: qr ? '请使用 WhatsApp 扫描二维码完成登录' : '扫码流程已启动，请在控制台查看二维码',
    })
  }
  return getWhatsAppLoginStatus()
}

export async function pollWhatsAppLoginStatus(): Promise<WhatsAppLoginState> {
  if (state.status === 'idle') return getWhatsAppLoginStatus()
  const out = await tryExecCandidates([
    ['gateway', 'web.login.wait', '--json', '--timeout', '1'],
    ['gateway', 'web', 'login', 'wait', '--json', '--timeout', '1'],
    ['web.login.wait', '--json', '--timeout', '1'],
  ])
  if (out.code !== 0) {
    return getWhatsAppLoginStatus()
  }
  const raw = [out.stdout, out.stderr].filter(Boolean).join('\n')
  const parsed = parseJsonLoose(raw)
  const status = typeof parsed?.status === 'string' ? parsed.status.toLowerCase() : ''
  if (status.includes('authorized') || status.includes('success')) {
    update({ status: 'authorized', message: 'WhatsApp 已授权', qr: undefined })
  } else if (typeof parsed?.qr === 'string' || typeof parsed?.qrcode === 'string') {
    update({
      status: 'pending',
      qr: (parsed.qr as string | undefined) ?? (parsed.qrcode as string | undefined),
      message: '等待扫码中',
    })
  }
  return getWhatsAppLoginStatus()
}

export function cancelWhatsAppLogin(): WhatsAppLoginState {
  update({ status: 'idle', message: '已取消扫码流程', qr: undefined })
  return getWhatsAppLoginStatus()
}
