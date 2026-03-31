import { expandUserPath, getDefaultDesktopExportDir, getOpenclawDataDir, getOpenclawSnapshotsDir } from '../paths.js'
import { createOpenclawBackupTar, listSnapshotTarballs, removeOpenclawDataDirectory, restoreOpenclawFromTarGz } from '../openclawBackup.js'
import { writeConfigJson } from '../configJson.js'
import { npmUninstallGlobalRobust } from '../npmUninstallGlobalRobust.js'

export function getBackupDefaults() {
  const snapshotsDir = getOpenclawSnapshotsDir()
  return {
    desktopDir: getDefaultDesktopExportDir(),
    snapshotsDir,
    dataDir: getOpenclawDataDir(),
    defaultBackupPath: snapshotsDir,
  }
}

export async function backupOpenclaw(mode?: string, exportDir?: string) {
  let resolved: string
  if (mode === 'snapshots') {
    resolved = getOpenclawSnapshotsDir()
  } else if (mode === 'desktop' || mode === 'custom') {
    resolved = exportDir ? expandUserPath(exportDir) : getDefaultDesktopExportDir()
  } else {
    throw new Error('mode 须为 snapshots | desktop | custom')
  }
  return createOpenclawBackupTar(resolved)
}

export function listOpenclawBackups() {
  return { files: listSnapshotTarballs() }
}

export async function restoreOpenclawBackup(tarPath: string) {
  if (!tarPath.trim()) throw new Error('缺少 tarPath')
  await restoreOpenclawFromTarGz(expandUserPath(tarPath))
}

export function removeOpenclawData(confirm?: string) {
  if (confirm !== 'DELETE') throw new Error('请在 body 中传入 confirm: "DELETE"')
  removeOpenclawDataDirectory()
}

export function resetConfig() {
  writeConfigJson({})
}

export async function uninstallOpenclaw() {
  const a = await npmUninstallGlobalRobust('openclaw')
  const b = await npmUninstallGlobalRobust('clawhub')
  const ok = a.code === 0 && b.code === 0
  return {
    ok,
    code: ok ? 0 : Math.max(a.code, b.code),
    stdout: [a.stdout, b.stdout].filter(Boolean).join('\n'),
    stderr: [a.stderr, b.stderr].filter(Boolean).join('\n'),
  }
}
