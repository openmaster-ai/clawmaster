import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { getClawmasterRuntimeSelection } from './clawmasterSettings.js'
import { normalizeLoginShellWhichLine } from './shellWhichNormalize.js'
import {
  resolveCommandInWslSync,
  resolveSelectedWslDistroSync,
  shouldUseWslRuntime,
} from './wslRuntime.js'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)

export type ClawprobeUnavailableReason = 'not-installed' | 'not-visible'

export class ClawprobeUnavailableError extends Error {
  code = 'CLAWPROBE_UNAVAILABLE'
  reason: ClawprobeUnavailableReason

  constructor(reason: ClawprobeUnavailableReason = 'not-installed') {
    const message =
      reason === 'not-visible'
        ? 'ClawProbe appears to be installed, but the backend cannot resolve its executable path'
        : 'ClawProbe is not installed'
    super(message)
    this.reason = reason
    this.name = 'ClawprobeUnavailableError'
  }
}

export interface ClawprobeCommandOutput {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

type ClawprobeCommandResolution = {
  cmd: string
  argsPrefix: string[]
  source: 'local-package' | 'global-package' | 'login-shell' | 'bare'
  globalInstallDetected: boolean
}

function getClawprobePackageRoot(): string | null {
  try {
    const pkgJson = require.resolve('clawprobe/package.json')
    return path.dirname(pkgJson)
  } catch {
    return null
  }
}

function getGlobalNpmRoot(): string | null {
  try {
    const out = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
    }).trim()
    return out || null
  } catch {
    return null
  }
}

function getGlobalClawprobePackageRoot(): string | null {
  const globalRoot = getGlobalNpmRoot()
  if (!globalRoot) {
    return null
  }
  const candidate = path.join(globalRoot, 'clawprobe')
  return existsSync(candidate) ? candidate : null
}

function getClawprobeEntryFromPackageRoot(root: string | null): string | null {
  if (!root) {
    return null
  }
  const entry = path.join(root, 'dist', 'index.js')
  return existsSync(entry) ? entry : null
}

function resolveBareClawprobeInLoginShell(): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('cmd', ['/c', 'where clawprobe'], {
        encoding: 'utf8',
        windowsHide: true,
      })
      const line = out.trim().split(/\r?\n/)[0]?.trim()
      return line && line.length > 0 ? line : null
    }
    if (process.platform === 'darwin') {
      let line: string | undefined
      try {
        const out = execFileSync('/bin/zsh', ['-ilc', 'whence -p clawprobe'], {
          encoding: 'utf8',
          env: process.env,
        })
        line = out.trim().split(/\r?\n/)[0]?.trim()
      } catch {
        /* fall through */
      }
      if (!line) {
        const out = execFileSync('/bin/zsh', ['-ilc', 'command -v clawprobe'], {
          encoding: 'utf8',
          env: process.env,
        })
        line =
          normalizeLoginShellWhichLine(out.trim().split(/\r?\n/)[0]) ??
          out.trim().split(/\r?\n/)[0]?.trim()
      }
      return line && line.length > 0 ? line : null
    }
    let line: string | undefined
    try {
      const out = execFileSync('/bin/bash', ['--login', '-c', 'type -P clawprobe'], {
        encoding: 'utf8',
        env: process.env,
      })
      line = out.trim().split(/\r?\n/)[0]?.trim()
    } catch {
      /* fall through */
    }
    if (!line) {
      const out = execFileSync('/bin/bash', ['--login', '-c', 'command -v clawprobe'], {
        encoding: 'utf8',
        env: process.env,
      })
      line =
        normalizeLoginShellWhichLine(out.trim().split(/\r?\n/)[0]) ??
        out.trim().split(/\r?\n/)[0]?.trim()
    }
    return line && line.length > 0 ? line : null
  } catch {
    return null
  }
}

export function resolveClawprobeCommandForTest(options: {
  localPackageRoot?: string | null
  globalPackageRoot?: string | null
  loginShellPath?: string | null
  processExecPath?: string
}): ClawprobeCommandResolution {
  const localEntry = getClawprobeEntryFromPackageRoot(options.localPackageRoot ?? null)
  if (localEntry) {
    return {
      cmd: options.processExecPath ?? process.execPath,
      argsPrefix: [localEntry],
      source: 'local-package',
      globalInstallDetected: Boolean(options.globalPackageRoot),
    }
  }

  const globalEntry = getClawprobeEntryFromPackageRoot(options.globalPackageRoot ?? null)
  if (globalEntry) {
    return {
      cmd: options.processExecPath ?? process.execPath,
      argsPrefix: [globalEntry],
      source: 'global-package',
      globalInstallDetected: true,
    }
  }

  const loginShellPath = options.loginShellPath?.trim()
  if (loginShellPath) {
    return {
      cmd: loginShellPath,
      argsPrefix: [],
      source: 'login-shell',
      globalInstallDetected: Boolean(options.globalPackageRoot),
    }
  }

  return {
    cmd: 'clawprobe',
    argsPrefix: [],
    source: 'bare',
    globalInstallDetected: Boolean(options.globalPackageRoot),
  }
}

function resolveClawprobeCommand(): ClawprobeCommandResolution {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    const distro = resolveSelectedWslDistroSync(runtimeSelection)
    if (distro) {
      return {
        cmd: 'wsl.exe',
        argsPrefix: ['-d', distro, '--', resolveCommandInWslSync(distro, 'clawprobe') ?? 'clawprobe'],
        source: 'bare',
        globalInstallDetected: false,
      }
    }
  }

  return resolveClawprobeCommandForTest({
    localPackageRoot: getClawprobePackageRoot(),
    globalPackageRoot: getGlobalClawprobePackageRoot(),
    loginShellPath: resolveBareClawprobeInLoginShell(),
    processExecPath: process.execPath,
  })
}

function isClawprobeUnavailableFailure(
  error: NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
): boolean {
  if (error.code === 'ENOENT') {
    return true
  }
  const combined = [
    error.message,
    error.stdout ? String(error.stdout) : '',
    error.stderr ? String(error.stderr) : '',
  ]
    .join('\n')
    .trim()
  return /command not found|cannot find module|not recognized as an internal or external command|spawn .* ENOENT/i.test(
    combined
  )
}

function getUnavailableReason(
  resolution: ClawprobeCommandResolution,
  error: NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
): ClawprobeUnavailableReason {
  if (resolution.globalInstallDetected) {
    return 'not-visible'
  }
  const combined = [
    error.message,
    error.stdout ? String(error.stdout) : '',
    error.stderr ? String(error.stderr) : '',
  ]
    .join('\n')
    .trim()
  if (/not available in path|command not found|spawn .* ENOENT/i.test(combined)) {
    return 'not-visible'
  }
  return 'not-installed'
}

function isClawprobeJsonError(v: unknown): v is { ok: false; error?: string; message?: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'ok' in v &&
    (v as { ok: unknown }).ok === false
  )
}

export async function runClawprobeJson(args: string[]): Promise<unknown> {
  const resolution = resolveClawprobeCommand()
  const cmdArgs = [...resolution.argsPrefix, ...args]

  let stdout = ''
  let stderr = ''
  let exitCode = 0
  try {
    const out = await execFileAsync(resolution.cmd, cmdArgs, {
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    })
    stdout = String(out.stdout ?? '').trim()
    stderr = String(out.stderr ?? '').trim()
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
    if (isClawprobeUnavailableFailure(err)) {
      throw new ClawprobeUnavailableError(getUnavailableReason(resolution, err))
    }
    stdout = err.stdout ? String(err.stdout).trim() : ''
    stderr = err.stderr ? String(err.stderr).trim() : ''
    exitCode = typeof err.code === 'number' ? err.code : 1
  }

  if (!stdout && exitCode !== 0) {
    throw new Error(stderr || `clawprobe exited with code ${exitCode}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout || '{}')
  } catch {
    throw new Error(
      stderr || stdout.slice(0, 400) || `clawprobe: expected JSON on stdout (exit ${exitCode})`
    )
  }

  if (isClawprobeJsonError(parsed)) {
    throw new Error(parsed.message ?? parsed.error ?? 'clawprobe failed')
  }

  if (exitCode !== 0) {
    throw new Error(stderr || `clawprobe exited with code ${exitCode}`)
  }

  return parsed
}

export async function runClawprobeCommand(args: string[]): Promise<ClawprobeCommandOutput> {
  const resolution = resolveClawprobeCommand()
  try {
    const out = await execFileAsync(resolution.cmd, [...resolution.argsPrefix, ...args], {
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    })
    return {
      ok: true,
      code: 0,
      stdout: String(out.stdout ?? '').trim(),
      stderr: String(out.stderr ?? '').trim(),
    }
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
    if (isClawprobeUnavailableFailure(err)) {
      const reason = getUnavailableReason(resolution, err)
      return {
        ok: false,
        code: 127,
        stdout: '',
        stderr:
          reason === 'not-visible'
            ? 'ClawProbe appears to be installed, but the backend cannot resolve its executable path'
            : 'ClawProbe is not installed',
      }
    }
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ? String(err.stdout).trim() : '',
      stderr: err.stderr ? String(err.stderr).trim() : '',
    }
  }
}
