import fs from 'node:fs'
import {
  expandUserPath,
  getDefaultDesktopExportDir,
  getOpenclawConfigResolution,
  getOpenclawDataDir,
  getOpenclawSnapshotsDir,
} from '../paths.js'
import { createOpenclawBackupTar, listSnapshotTarballs, removeOpenclawDataDirectory, restoreOpenclawFromTarGz } from '../openclawBackup.js'
import { writeConfigJson } from '../configJson.js'
import { npmUninstallGlobalRobust } from '../npmUninstallGlobalRobust.js'
import {
  clearOpenclawProfileSelection,
  getOpenclawDataDirForProfile,
  getOpenclawPathModule,
  normalizeOpenclawProfileSelection,
  setOpenclawProfileSelection,
  type OpenclawProfileContext,
  type OpenclawProfileSelection,
} from '../openclawProfile.js'

export interface OpenclawProfileSeedInput {
  mode?: 'empty' | 'clone-current' | 'import-config'
  sourcePath?: string
}

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

function normalizeOpenclawProfileSeedInput(
  seed?: OpenclawProfileSeedInput | null
): Required<OpenclawProfileSeedInput> {
  switch (seed?.mode) {
    case undefined:
    case null:
    case 'empty':
      return { mode: 'empty', sourcePath: '' }
    case 'clone-current':
      return { mode: 'clone-current', sourcePath: '' }
    case 'import-config':
      return { mode: 'import-config', sourcePath: seed.sourcePath?.trim() ?? '' }
    default:
      throw new Error('Unsupported OpenClaw profile seed mode')
  }
}

function resolveProfileSeedSourcePath(
  seed: Required<OpenclawProfileSeedInput>,
  context: OpenclawProfileContext = {}
): string | null {
  if (seed.mode === 'empty') {
    return null
  }

  if (seed.mode === 'clone-current') {
    const sourcePath = getOpenclawConfigResolution(context).configPath
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Current OpenClaw config does not exist, so there is nothing to clone yet')
    }
    return sourcePath
  }

  if (!seed.sourcePath) {
    throw new Error('Enter an OpenClaw config path before importing')
  }

  const sourcePath = expandUserPath(seed.sourcePath)
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Imported OpenClaw config path does not exist')
  }
  if (!fs.statSync(sourcePath).isFile()) {
    throw new Error('Imported OpenClaw config path must point to a file')
  }
  return sourcePath
}

function seedNamedProfileConfig(
  selection: OpenclawProfileSelection,
  seed: Required<OpenclawProfileSeedInput>,
  context: OpenclawProfileContext = {}
): void {
  if (selection.kind !== 'named' || seed.mode === 'empty') {
    return
  }

  const targetDataDir = getOpenclawDataDirForProfile(selection, context)
  if (!targetDataDir) {
    throw new Error('Named OpenClaw profile target could not be resolved')
  }
  const targetConfigPath = getOpenclawPathModule(context.platform).join(
    targetDataDir,
    'openclaw.json'
  )
  if (fs.existsSync(targetConfigPath)) {
    throw new Error('Target named profile already has an OpenClaw config. Choose a new profile name or switch directly.')
  }

  const sourcePath = resolveProfileSeedSourcePath(seed, context)
  if (!sourcePath) {
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  } catch {
    throw new Error('Imported OpenClaw config must be valid JSON')
  }

  fs.mkdirSync(targetDataDir, { recursive: true })
  fs.writeFileSync(targetConfigPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

export function saveOpenclawProfile(
  selection?: Partial<OpenclawProfileSelection> | null,
  seed?: OpenclawProfileSeedInput | null,
  context: OpenclawProfileContext = {}
) {
  const normalizedSelection = normalizeOpenclawProfileSelection(selection)
  const normalizedSeed = normalizeOpenclawProfileSeedInput(seed)
  seedNamedProfileConfig(normalizedSelection, normalizedSeed, context)
  return setOpenclawProfileSelection(normalizedSelection, context)
}

export function resetOpenclawProfile(context: OpenclawProfileContext = {}) {
  clearOpenclawProfileSelection(context)
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
