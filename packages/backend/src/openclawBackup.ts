import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getOpenclawDataDir, getOpenclawSnapshotsDir, getDefaultDesktopExportDir } from './paths.js'

const execFileAsync = promisify(execFile)

function formatBackupTimestamp(): string {
  const d = new Date()
  const p = (n: number, w: number) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}_${p(d.getHours(), 2)}${p(d.getMinutes(), 2)}${p(d.getSeconds(), 2)}`
}

async function runTar(args: string[]): Promise<void> {
  await execFileAsync('tar', args, {
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  })
}

export interface CreateBackupResult {
  path: string
  snapshotId: string
  size: number
  checksum: string
  exportDir: string
}

/** Like openclaw-uninstaller: tar ~/.openclaw as openclaw_backup_<ts>/openclaw_data + snapshot.json → .tar.gz */
export async function createOpenclawBackupTar(exportDir: string): Promise<CreateBackupResult> {
  const dataDir = getOpenclawDataDir()
  if (!fs.existsSync(dataDir)) {
    throw new Error('未找到 OpenClaw 数据目录（~/.openclaw），无需备份')
  }

  const snapshotId = `openclaw_backup_${formatBackupTimestamp()}`
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-bak-'))
  const snapRoot = path.join(work, snapshotId)

  try {
    fs.mkdirSync(path.join(snapRoot, 'openclaw_data'), { recursive: true })
    fs.cpSync(dataDir, path.join(snapRoot, 'openclaw_data'), { recursive: true })

    const createdAt = new Date().toISOString()
    const metadata = {
      id: snapshotId,
      name: 'pre_uninstall_backup',
      description: '卸载前备份（龙虾管家，对齐 openclaw-uninstaller 快照结构）',
      type: 'clawmaster',
      timestamp: formatBackupTimestamp(),
      created_at: createdAt,
      version: '1.0',
    }
    fs.writeFileSync(path.join(snapRoot, 'snapshot.json'), JSON.stringify(metadata, null, 2), 'utf-8')

    fs.mkdirSync(exportDir, { recursive: true })
    const tarPath = path.join(exportDir, `${snapshotId}.tar.gz`)
    await runTar(['-czf', tarPath, '-C', work, snapshotId])

    const stat = fs.statSync(tarPath)
    const checksum = crypto
      .createHash('md5')
      .update(fs.readFileSync(tarPath))
      .digest('hex')
      .slice(0, 8)

    return {
      path: tarPath,
      snapshotId,
      size: stat.size,
      checksum,
      exportDir,
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

export function listSnapshotTarballs(): string[] {
  const dir = getOpenclawSnapshotsDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => path.join(dir, f))
    .sort()
    .reverse()
}

function findOpenclawDataInExtractRoot(work: string): string | null {
  for (const name of fs.readdirSync(work, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const p = path.join(work, name.name, 'openclaw_data')
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Restore ~/.openclaw from tar.gz; rename existing tree to .bak.<timestamp> first */
export async function restoreOpenclawFromTarGz(tarGzPath: string): Promise<void> {
  const abs = path.resolve(tarGzPath.trim())
  if (!fs.existsSync(abs) || !abs.endsWith('.gz')) {
    throw new Error('备份文件不存在或不是 .tar.gz')
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-restore-'))
  try {
    await runTar(['-xzf', abs, '-C', work])
    const dataSrc = findOpenclawDataInExtractRoot(work)
    if (!dataSrc) {
      throw new Error('备份包内未找到 openclaw_data 目录（请确认为龙虾管家 / 卸载虾生成的快照）')
    }

    const target = getOpenclawDataDir()
    if (fs.existsSync(target)) {
      const bak = `${target}.bak.${Date.now()}`
      fs.renameSync(target, bak)
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.cpSync(dataSrc, target, { recursive: true })
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

export function removeOpenclawDataDirectory(): void {
  const dir = getOpenclawDataDir()
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
