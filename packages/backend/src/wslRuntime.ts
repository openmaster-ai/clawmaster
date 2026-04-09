import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

import {
  getClawmasterRuntimeSelection,
  type ClawmasterRuntimeSelection,
} from './clawmasterSettings.js'
import {
  getOpenclawDataDirForProfile,
  getOpenclawProfileSelection,
  type OpenclawProfileSelection,
} from './openclawProfile.js'

const execFileAsync = promisify(execFile)

export interface WslDistroInfo {
  name: string
  state: string
  version: number | null
  isDefault: boolean
}

export interface WslOpenclawProbe {
  installed: boolean
  version: string
  homeDir: string
  configPath: string
  dataDir: string
  configExists: boolean
}

type ExecWslOutput = {
  code: number
  stdout: string
  stderr: string
}

const WSL_EXE = 'wsl.exe'

export function shouldUseWslRuntime(
  selection: ClawmasterRuntimeSelection = getClawmasterRuntimeSelection()
): selection is ClawmasterRuntimeSelection & { mode: 'wsl2'; wslDistro: string } {
  return process.platform === 'win32' && selection.mode === 'wsl2' && Boolean(selection.wslDistro?.trim())
}

export function shellEscapePosixArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function parseWslListVerbose(stdout: string): WslDistroInfo[] {
  const items: WslDistroInfo[] = []
  for (const rawLine of stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trimEnd())) {
    if (!rawLine.trim() || /^\s*NAME\s+/i.test(rawLine)) continue
    const match = rawLine.match(/^\s*(\*?)\s*([^\r\n]+?)\s{2,}([^\r\n]+?)\s{2,}(\d+)\s*$/)
    if (!match) continue
    items.push({
        isDefault: match[1] === '*',
        name: match[2].trim(),
        state: match[3].trim(),
        version: Number.parseInt(match[4], 10),
      })
  }
  return items
}

export function listWslDistrosSync(): WslDistroInfo[] {
  if (process.platform !== 'win32') return []
  try {
    const stdout = execFileSync(WSL_EXE, ['--list', '--verbose'], {
      encoding: 'utf8',
      windowsHide: true,
      env: process.env,
    })
    return parseWslListVerbose(stdout)
  } catch {
    return []
  }
}

export function detectWslAvailabilitySync(): boolean {
  return listWslDistrosSync().length > 0
}

export function resolveSelectedWslDistroSync(
  selection: ClawmasterRuntimeSelection = getClawmasterRuntimeSelection()
): string | null {
  return resolveSelectedWslDistroFromList(listWslDistrosSync(), selection)
}

export function resolveSelectedWslDistroFromList(
  distros: WslDistroInfo[],
  selection: ClawmasterRuntimeSelection
): string | null {
  const requestedDistro = selection.wslDistro?.trim()
  if (requestedDistro) {
    const match = distros.find((item) => item.name === requestedDistro)
    if (match) return match.name
    return null
  }
  return distros.find((item) => item.isDefault)?.name ?? distros[0]?.name ?? null
}

function buildWslArgs(distro: string, cmd: string, args: string[]): string[] {
  return ['-d', distro, '--', cmd, ...args]
}

export function execWslCommandSync(
  distro: string,
  cmd: string,
  args: string[] = []
): ExecWslOutput {
  try {
    const output = execFileSync(WSL_EXE, buildWslArgs(distro, cmd, args), {
      encoding: 'utf8',
      windowsHide: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout: output, stderr: '' }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer; status?: number }
    return {
      code: typeof err.status === 'number' ? err.status : typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : err.message,
    }
  }
}

export async function execWslCommand(
  distro: string,
  cmd: string,
  args: string[] = []
): Promise<ExecWslOutput> {
  try {
    const out = await execFileAsync(WSL_EXE, buildWslArgs(distro, cmd, args), {
      windowsHide: true,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    })
    return {
      code: 0,
      stdout: String(out.stdout ?? ''),
      stderr: String(out.stderr ?? ''),
    }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : err.message,
    }
  }
}

export function runWslShellSync(distro: string, script: string): ExecWslOutput {
  return execWslCommandSync(distro, 'bash', ['-lc', script])
}

export async function runWslShell(distro: string, script: string): Promise<ExecWslOutput> {
  return execWslCommand(distro, 'bash', ['-lc', script])
}

export function resolveCommandInWslSync(distro: string, cmd: string): string | null {
  const out = runWslShellSync(distro, `command -v ${shellEscapePosixArg(cmd)}`)
  if (out.code !== 0) return null
  const line = out.stdout.trim().split(/\r?\n/)[0]?.trim()
  return line || null
}

export function getWslHomeDirSync(distro: string): string {
  const out = runWslShellSync(distro, 'printf %s "$HOME"')
  return out.code === 0 && out.stdout.trim() ? out.stdout.trim() : '/home'
}

export function fileExistsInWslSync(distro: string, targetPath: string): boolean {
  const out = runWslShellSync(distro, `[ -f ${shellEscapePosixArg(targetPath)} ]`)
  return out.code === 0
}

export function readTextFileInWslSync(distro: string, targetPath: string): string | null {
  const out = runWslShellSync(distro, `cat ${shellEscapePosixArg(targetPath)}`)
  if (out.code !== 0) return null
  return out.stdout
}

export function writeTextFileInWslSync(
  distro: string,
  targetPath: string,
  content: string
): void {
  const parent = targetPath.replace(/\/[^/]+$/, '') || '.'
  execFileSync(WSL_EXE, ['-d', distro, '--', 'bash', '-lc', `mkdir -p ${shellEscapePosixArg(parent)} && cat > ${shellEscapePosixArg(targetPath)}`], {
    input: content,
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function getWslOpenclawProbeSync(
  distro: string,
  profileSelection: OpenclawProfileSelection = getOpenclawProfileSelection({
    platform: 'linux',
  })
): WslOpenclawProbe {
  const homeDir = getWslHomeDirSync(distro)
  const dataDir = getOpenclawDataDirForProfile(profileSelection, {
    homeDir,
    platform: 'linux',
  }) ?? `${homeDir}/.openclaw`
  const configPath = `${dataDir.replace(/\/+$/, '')}/openclaw.json`
  const versionOut = execWslCommandSync(distro, 'openclaw', ['--version'])
  const version = versionOut.code === 0
    ? versionOut.stdout.trim().replace(/^openclaw\s+/i, '').replace(/^v/, '')
    : ''

  return {
    installed: versionOut.code === 0,
    version,
    homeDir,
    configPath,
    dataDir,
    configExists: fileExistsInWslSync(distro, configPath),
  }
}
