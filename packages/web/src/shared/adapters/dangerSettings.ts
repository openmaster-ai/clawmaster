import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'

export interface UninstallOpenclawCliOutput {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export interface BackupDefaults {
  desktopDir: string
  snapshotsDir: string
  dataDir: string
  /** Wizard default backup dir (currently same as snapshotsDir) */
  defaultBackupPath?: string
}

export interface CreateBackupResponse {
  path: string
  snapshotId: string
  size: number
  checksum: string
  exportDir: string
}

export async function resetOpenclawConfigResult(): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<void>('reset_openclaw_config'))
  }
  return webFetchVoid('/api/settings/reset-config', { method: 'POST' })
}

export async function uninstallOpenclawCliResult(): Promise<
  AdapterResult<UninstallOpenclawCliOutput>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<UninstallOpenclawCliOutput>('uninstall_openclaw_cli')
    )
  }
  return webFetchJson<UninstallOpenclawCliOutput>('/api/settings/uninstall-openclaw', {
    method: 'POST',
  })
}

export async function getBackupDefaultsResult(): Promise<AdapterResult<BackupDefaults>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<BackupDefaults>('get_backup_defaults'))
  }
  return webFetchJson<BackupDefaults>('/api/settings/backup-defaults')
}

export async function createOpenclawBackupResult(opts: {
  mode: 'desktop' | 'snapshots' | 'custom'
  exportDir?: string
}): Promise<AdapterResult<CreateBackupResponse>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<CreateBackupResponse>('create_openclaw_backup', {
        mode: opts.mode,
        exportDir: opts.exportDir ?? null,
      })
    )
  }
  return webFetchJson<CreateBackupResponse>('/api/settings/openclaw-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: opts.mode, exportDir: opts.exportDir }),
  })
}

export async function listOpenclawBackupsResult(): Promise<
  AdapterResult<{ files: string[] }>
> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<{ files: string[] }>('list_openclaw_backups'))
  }
  return webFetchJson<{ files: string[] }>('/api/settings/openclaw-backups')
}

export async function restoreOpenclawBackupResult(tarPath: string): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<void>('restore_openclaw_backup', { tarPath })
    )
  }
  return webFetchVoid('/api/settings/openclaw-restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarPath }),
  })
}

export async function removeOpenclawDataResult(): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<void>('remove_openclaw_data', { confirm: 'DELETE' })
    )
  }
  return webFetchVoid('/api/settings/remove-openclaw-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'DELETE' }),
  })
}
