import { webFetch } from '@/shared/adapters/webHttp'

/**
 * 平台检测与命令执行 — 统一入口
 *
 * 合并原先散落在 adapters/index.ts、StartupDetector.tsx、lib/types.ts 中的检测逻辑
 * 所有新 adapter 通过此文件的 execCommand 执行 CLI 命令
 */

/** 是否运行在 Tauri 桌面环境 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  const candidate = window as Window & {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }
  return typeof candidate.__TAURI_INTERNALS__ === 'object' || typeof candidate.__TAURI__ === 'object'
}

/** Alias for PR #2 compatibility */
export const getIsTauri = isTauri

/** 检测 Windows 环境（前端侧 — 通过 userAgent 推断） */
export function isWindows(): boolean {
  if (typeof navigator !== 'undefined') {
    return /Win/i.test(navigator.userAgent ?? navigator.platform ?? '')
  }
  return false
}

/**
 * 跨平台 temp 目录路径（用于 bash 脚本中）
 * bash 在所有平台上都支持 $TMPDIR，Git Bash on Windows 也设置了它
 */
export const TEMP_DIR = '${TMPDIR:-/tmp}'

/**
 * 执行 CLI 命令并返回 stdout
 *
 * Tauri 环境：通过 Rust invoke 执行
 * Web 环境：通过 Express 后端 /api/exec 执行
 */
export async function execCommand(cmd: string, args: string[] = []): Promise<string> {
  if (isTauri()) {
    return execViaTauri(cmd, args)
  }
  return execViaWeb(cmd, args)
}

/**
 * 执行命令并解析 JSON 输出
 * 大多数 CLI 工具支持 --json 参数
 */
export async function execCommandJson<T>(cmd: string, args: string[] = []): Promise<T> {
  const raw = await execCommand(cmd, args)
  return JSON.parse(raw) as T
}

// ─── Tauri 执行路径 ───

async function execViaTauri(cmd: string, args: string[]): Promise<string> {
  // 动态拼接模块路径，避免 Vite 在 Web 模式静态分析时报错
  const tauriModule = '@tauri-apps/api' + '/core'
  const { invoke } = await import(/* @vite-ignore */ tauriModule)
  const inv = invoke as (cmd: string, args: Record<string, unknown>) => Promise<string>

  // Route to the correct registered Tauri command
  switch (cmd) {
    case 'openclaw':
      return inv('run_openclaw_command', { args })
    case 'clawprobe':
      return inv('run_clawprobe_command', { args })
    default:
      return inv('run_system_command', { cmd, args })
  }
}

// ─── Web 执行路径 ───

async function execViaWeb(cmd: string, args: string[]): Promise<string> {
  const res = await webFetch('/api/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd, args }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Command failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  if (data?.ok === false) {
    const detail = data.stderr || data.error || data.stdout || 'unknown command failure'
    const exitCode = data.exitCode ?? 'error'
    throw new Error(`Command failed (${exitCode}): ${detail}`)
  }
  return data.stdout ?? ''
}

// ─── 环境检测工具 ───

export interface ComponentVersion {
  installed: boolean
  version: string
}

/** 检测单个命令行工具的版本 */
export async function detectCommandVersion(
  cmd: string,
  versionArg = '--version',
): Promise<ComponentVersion> {
  try {
    const raw = await execCommand(cmd, [versionArg])
    // 提取版本号（匹配 vX.Y.Z 或 X.Y.Z 格式）
    const match = raw.match(/v?(\d+\.\d+\.\d+[\w.-]*)/)
    return { installed: true, version: match ? match[1] : raw.trim() }
  } catch {
    return { installed: false, version: '' }
  }
}
