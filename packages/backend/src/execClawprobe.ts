import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
let cachedClawprobeCommand: { cmd: string; argsPrefix: string[] } | undefined

export class ClawprobeUnavailableError extends Error {
  code = 'CLAWPROBE_UNAVAILABLE'

  constructor(message = 'ClawProbe is not installed or not available in PATH') {
    super(message)
    this.name = 'ClawprobeUnavailableError'
  }
}

export interface ClawprobeCommandOutput {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

function resolveLocalClawprobeEntry(): string | null {
  try {
    const pkgJson = require.resolve('clawprobe/package.json')
    const root = path.dirname(pkgJson)
    return path.join(root, 'dist', 'index.js')
  } catch {
    return null
  }
}

function resolveClawprobeCommand() {
  if (cachedClawprobeCommand) {
    return cachedClawprobeCommand
  }

  const localEntry = resolveLocalClawprobeEntry()
  if (localEntry) {
    cachedClawprobeCommand = {
      cmd: process.execPath,
      argsPrefix: [localEntry],
    }
    return cachedClawprobeCommand
  }

  try {
    const prefix = execFileSync('npm', ['config', 'get', 'prefix'], {
      encoding: 'utf8',
      env: process.env,
    }).trim()
    if (prefix) {
      const globalBin =
        process.platform === 'win32'
          ? path.join(prefix, 'clawprobe.cmd')
          : path.join(prefix, 'bin', 'clawprobe')
      if (existsSync(globalBin)) {
        cachedClawprobeCommand = {
          cmd: globalBin,
          argsPrefix: [],
        }
        return cachedClawprobeCommand
      }
    }
  } catch {
    // Fall through to PATH-based resolution.
  }

  cachedClawprobeCommand = {
    cmd: 'clawprobe',
    argsPrefix: [],
  }
  return cachedClawprobeCommand
}

export function resetClawprobeCommandCacheForTests(): void {
  cachedClawprobeCommand = undefined
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

function isClawprobeJsonError(v: unknown): v is { ok: false; error?: string; message?: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'ok' in v &&
    (v as { ok: unknown }).ok === false
  )
}

export async function runClawprobeJson(args: string[]): Promise<unknown> {
  const { cmd, argsPrefix } = resolveClawprobeCommand()
  const cmdArgs = [...argsPrefix, ...args]

  let stdout = ''
  let stderr = ''
  let exitCode = 0
  try {
    const out = await execFileAsync(cmd, cmdArgs, {
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    })
    stdout = String(out.stdout ?? '').trim()
    stderr = String(out.stderr ?? '').trim()
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
    if (isClawprobeUnavailableFailure(err)) {
      throw new ClawprobeUnavailableError()
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
  const { cmd, argsPrefix } = resolveClawprobeCommand()
  try {
    const out = await execFileAsync(cmd, [...argsPrefix, ...args], {
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
      return {
        ok: false,
        code: 127,
        stdout: '',
        stderr: 'ClawProbe is not installed or not available in PATH',
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
