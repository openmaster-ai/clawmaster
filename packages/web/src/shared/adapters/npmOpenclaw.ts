import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'
import type { UninstallOpenclawCliOutput } from '@/shared/adapters/dangerSettings'

export interface OpenclawNpmVersions {
  versions: string[]
  distTags: Record<string, string>
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

export interface ReinstallOpenclawOutput {
  ok: boolean
  steps: ReinstallStep[]
}

export interface ReinstallBackupStepResult {
  skipped: boolean
  path?: string
  message: string
}

export async function reinstallBackupStepResult(): Promise<
  AdapterResult<ReinstallBackupStepResult>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<ReinstallBackupStepResult>('reinstall_step_backup_openclaw')
    )
  }
  return webFetchJson<ReinstallBackupStepResult>('/api/npm/reinstall-step/backup', {
    method: 'POST',
  })
}

export async function reinstallUninstallStepResult(): Promise<
  AdapterResult<UninstallOpenclawCliOutput>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<UninstallOpenclawCliOutput>('reinstall_step_uninstall_openclaw_cli')
    )
  }
  return webFetchJson<UninstallOpenclawCliOutput>('/api/npm/reinstall-step/uninstall', {
    method: 'POST',
  })
}

export async function listOpenclawNpmVersionsResult(): Promise<
  AdapterResult<OpenclawNpmVersions>
> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<OpenclawNpmVersions>('list_openclaw_npm_versions'))
  }
  return webFetchJson<OpenclawNpmVersions>('/api/npm/openclaw-versions')
}

/** `version`: `latest`, dist-tag name, or concrete semver */
export async function installOpenclawGlobalResult(version: string): Promise<
  AdapterResult<UninstallOpenclawCliOutput>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<UninstallOpenclawCliOutput>('npm_install_openclaw_global', {
        versionSpec: version.trim() === '' || version.trim() === 'latest' ? null : version.trim(),
      })
    )
  }
  return webFetchJson<UninstallOpenclawCliOutput>('/api/npm/install-openclaw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
}

/** Install from local `npm pack` artifact (.tgz) without hitting the registry */
export async function installOpenclawFromLocalFileResult(
  localPath: string
): Promise<AdapterResult<UninstallOpenclawCliOutput>> {
  const p = localPath.trim()
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<UninstallOpenclawCliOutput>('npm_install_openclaw_from_file', {
        filePath: p,
      })
    )
  }
  return webFetchJson<UninstallOpenclawCliOutput>('/api/npm/install-openclaw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localPath: p }),
  })
}

/** When already installed: backup → uninstall openclaw → install version (keep clawhub) */
export async function reinstallOpenclawGlobalResult(version: string): Promise<
  AdapterResult<ReinstallOpenclawOutput>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<ReinstallOpenclawOutput>('reinstall_openclaw_global', {
        versionSpec: version.trim() === '' || version.trim() === 'latest' ? null : version.trim(),
      })
    )
  }
  return webFetchJson<ReinstallOpenclawOutput>('/api/npm/reinstall-openclaw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
}
