import fs from 'fs'
import { getOpenclawDataDir, getOpenclawSnapshotsDir } from './paths.js'
import { createOpenclawBackupTar } from './openclawBackup.js'
import { npmUninstallGlobalRobust } from './npmUninstallGlobalRobust.js'
import { npmInstallOpenclawGlobal } from './npmOpenclaw.js'

export interface ReinstallBackupStepResult {
  skipped: boolean
  path?: string
  message: string
}

/** Phased API / progress UI: backup step only */
export async function runReinstallBackupStep(): Promise<ReinstallBackupStepResult> {
  const dataDir = getOpenclawDataDir()
  if (!fs.existsSync(dataDir)) {
    return {
      skipped: true,
      message: '未找到 OpenClaw 数据目录，已跳过备份',
    }
  }
  const b = await createOpenclawBackupTar(getOpenclawSnapshotsDir())
  return {
    skipped: false,
    path: b.path,
    message: `已备份到 ${b.path}`,
  }
}

/** Phased API: uninstall openclaw only */
export async function runReinstallUninstallStep(): Promise<{
  ok: boolean
  code: number
  stdout: string
  stderr: string
}> {
  const u = await npmUninstallGlobalRobust('openclaw')
  return { ok: u.code === 0, code: u.code, stdout: u.stdout, stderr: u.stderr }
}

export type ReinstallStepId = 'backup' | 'uninstall' | 'install'

export interface ReinstallStep {
  id: ReinstallStepId
  ok: boolean
  message: string
  stdout: string
  stderr: string
  backupPath?: string
}

export interface ReinstallOpenclawResult {
  ok: boolean
  steps: ReinstallStep[]
}

/**
 * Reinstall: backup ~/.openclaw if present → npm uninstall -g openclaw (keep clawhub) → install version.
 * Abort if backup fails; still try install if uninstall fails (repair-style overwrite).
 */
export async function reinstallOpenclawWithBackup(versionSpec: string): Promise<ReinstallOpenclawResult> {
  const steps: ReinstallStep[] = []

  try {
    const backupDto = await runReinstallBackupStep()
    steps.push({
      id: 'backup',
      ok: true,
      message: backupDto.message,
      stdout: backupDto.path ?? '',
      stderr: '',
      backupPath: backupDto.path,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps.push({
      id: 'backup',
      ok: false,
      message: '备份失败，已中止重装',
      stdout: '',
      stderr: msg,
    })
    return { ok: false, steps }
  }

  const u = await runReinstallUninstallStep()
  steps.push({
    id: 'uninstall',
    ok: u.code === 0,
    message:
      u.code === 0
        ? '已卸载全局 openclaw（含 npm rename 失败时的 --force / 目录清理回退）'
        : '卸载 openclaw 仍失败，将继续尝试安装',
    stdout: u.stdout,
    stderr: u.stderr,
  })

  const spec = versionSpec.trim() === '' ? 'latest' : versionSpec.trim()
  const inst = await npmInstallOpenclawGlobal(spec)
  steps.push({
    id: 'install',
    ok: inst.ok,
    message: inst.ok ? '安装完成' : '安装失败',
    stdout: inst.stdout,
    stderr: inst.stderr,
  })

  const backupOk = steps.find((s) => s.id === 'backup')?.ok ?? false
  const ok = backupOk && inst.ok
  return { ok, steps }
}
