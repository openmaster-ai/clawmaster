import {
  exec,
  execFile,
  execFileSync,
  spawn,
  type ExecException,
  type ExecFileException,
  type ExecFileOptions,
  type StdioOptions,
} from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getClawmasterRuntimeSelection } from './clawmasterSettings.js'
import { getOpenclawProfileArgs } from './openclawProfile.js'
import {
  execWslCommand,
  getWslRuntimeUnavailableMessage,
  requireSelectedWslDistroSync,
  resolveCommandInWslSync,
  shouldUseWslRuntime,
} from './wslRuntime.js'

/** Node supports `stdio` on `execFile`; `@types/node` only lists it on spawn options */
type ExecOpenclawFileOpts = ExecFileOptions & { stdio?: StdioOptions }
import net from 'node:net'

/** GUI/backend child PATH may omit nvm global bin; resolve absolute path via login shell like Tauri `openclaw_cmd` */
let cachedOpenclawBin: string | null | undefined
let cachedDarwinCompatibleNodeBin: string | null | undefined

export function clearOpenclawBinCache(): void {
  cachedOpenclawBin = undefined
  cachedDarwinCompatibleNodeBin = undefined
}

type ResolvedOpenclawCommand = {
  bin: string
  argsPrefix: string[]
  env: NodeJS.ProcessEnv
}

type DarwinLaunchAgentPlist = {
  ProgramArguments?: unknown
  EnvironmentVariables?: unknown
}

function resolveOpenclawBin(): string {
  if (cachedOpenclawBin !== undefined) {
    return cachedOpenclawBin ?? 'openclaw'
  }
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('cmd', ['/c', 'where openclaw'], { encoding: 'utf8' })
      const line = out.trim().split(/\r?\n/)[0]?.trim()
      cachedOpenclawBin = line && line.length > 0 ? line : null
    } else if (process.platform === 'darwin') {
      const out = execFileSync('/bin/zsh', ['-ilc', 'command -v openclaw'], {
        encoding: 'utf8',
      })
      const line = out.trim().split('\n')[0]?.trim()
      cachedOpenclawBin = line && line.length > 0 ? line : null
    } else {
      const out = execFileSync('/bin/bash', ['--login', '-c', 'command -v openclaw'], {
        encoding: 'utf8',
      })
      const line = out.trim().split('\n')[0]?.trim()
      cachedOpenclawBin = line && line.length > 0 ? line : null
    }
  } catch {
    cachedOpenclawBin = null
  }
  // Fallback: login shell may not see npm global bin (CI runners, GUI apps).
  // Try resolving via the current process PATH directly.
  if (!cachedOpenclawBin && process.platform !== 'win32') {
    try {
      const out = execFileSync('which', ['openclaw'], { encoding: 'utf8' })
      const line = out.trim().split('\n')[0]?.trim()
      if (line && line.length > 0) cachedOpenclawBin = line
    } catch { /* ignore */ }
  }
  return cachedOpenclawBin ?? 'openclaw'
}

function parseNodeVersion(raw: string): { major: number; minor: number; patch: number } | null {
  const m = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  }
}

function compareNodeVersions(
  a: { major: number; minor: number; patch: number },
  b: { major: number; minor: number; patch: number }
): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function isSupportedOpenclawNodeVersion(v: { major: number; minor: number; patch: number }): boolean {
  return v.major > 22 || (v.major === 22 && v.minor >= 14)
}

function getNodeVersionForBin(nodeBin: string): { major: number; minor: number; patch: number } | null {
  try {
    const raw = execFileSync(nodeBin, ['-v'], { encoding: 'utf8' }).trim()
    return parseNodeVersion(raw)
  } catch {
    return null
  }
}

function collectDarwinNodeCandidates(): string[] {
  const out = new Set<string>()
  const maybeAdd = (candidate: string) => {
    if (!candidate) return
    if (!fs.existsSync(candidate)) return
    out.add(candidate)
  }

  maybeAdd(process.execPath)
  maybeAdd('/opt/homebrew/bin/node')
  maybeAdd('/usr/local/bin/node')
  maybeAdd('/usr/bin/node')

  const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node')
  try {
    const versions = fs.readdirSync(nvmDir)
    for (const version of versions) {
      maybeAdd(path.join(nvmDir, version, 'bin', 'node'))
    }
  } catch {
    /* ignore */
  }

  return Array.from(out)
}

function resolveDarwinCompatibleNodeBin(): string | null {
  if (cachedDarwinCompatibleNodeBin !== undefined) {
    return cachedDarwinCompatibleNodeBin
  }

  const supported: Array<{ bin: string; version: { major: number; minor: number; patch: number } }> = []
  for (const candidate of collectDarwinNodeCandidates()) {
    const version = getNodeVersionForBin(candidate)
    if (!version || !isSupportedOpenclawNodeVersion(version)) continue
    supported.push({ bin: candidate, version })
  }

  let best: { bin: string; version: { major: number; minor: number; patch: number } } | null = null
  if (supported.length > 0) {
    const preferredMajor = Math.min(...supported.map((entry) => entry.version.major))
    for (const entry of supported) {
      if (entry.version.major !== preferredMajor) continue
      if (!best || compareNodeVersions(entry.version, best.version) > 0) {
        best = entry
      }
    }
    if (!best) {
      for (const entry of supported) {
        if (!best || compareNodeVersions(entry.version, best.version) > 0) {
          best = entry
        }
      }
    }
  }

  cachedDarwinCompatibleNodeBin = best?.bin ?? null
  return cachedDarwinCompatibleNodeBin
}

function resolveOpenclawCommand(): ResolvedOpenclawCommand {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    const distro = requireSelectedWslDistroSync(runtimeSelection)
    const openclawBin = resolveCommandInWslSync(distro, 'openclaw') ?? 'openclaw'
    return {
      bin: 'wsl.exe',
      argsPrefix: ['-d', distro, '--', openclawBin, ...getOpenclawProfileArgs()],
      env: process.env,
    }
  }

  const openclawBin = resolveOpenclawBin()
  if (process.platform === 'darwin') {
    const nodeBin = resolveDarwinCompatibleNodeBin()
    if (nodeBin) {
      return {
        bin: nodeBin,
        argsPrefix: [openclawBin, ...getOpenclawProfileArgs()],
        env: {
          ...process.env,
          PATH: [path.dirname(nodeBin), process.env.PATH].filter(Boolean).join(':'),
        },
      }
    }
  }
  return {
    bin: openclawBin,
    argsPrefix: getOpenclawProfileArgs(),
    env: process.env,
  }
}

function getDarwinGatewayLaunchAgentPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist')
}

function readDarwinGatewayLaunchAgentPlist(): DarwinLaunchAgentPlist | null {
  const plistPath = getDarwinGatewayLaunchAgentPath()
  if (!fs.existsSync(plistPath)) return null
  try {
    const raw = execFileSync('plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
    })
    return JSON.parse(raw) as DarwinLaunchAgentPlist
  } catch {
    return null
  }
}

function extractInstalledOpenclawVersion(): string | null {
  try {
    const { bin, argsPrefix, env } = resolveOpenclawCommand()
    const raw = execFileSync(bin, [...argsPrefix, '--version'], {
      encoding: 'utf8',
      env,
    }).trim()
    const match = raw.match(/\b(\d{4}\.\d+\.\d+)\b/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function shouldRepairDarwinGatewayLaunchAgent(): boolean {
  const compatibleNodeBin = resolveDarwinCompatibleNodeBin()
  if (!compatibleNodeBin) return false

  const plist = readDarwinGatewayLaunchAgentPlist()
  if (!plist) return true

  const args = Array.isArray(plist.ProgramArguments) ? plist.ProgramArguments : []
  const nodeBin = typeof args[0] === 'string' ? args[0] : ''
  const entryBin = typeof args[1] === 'string' ? args[1] : ''
  const env =
    plist.EnvironmentVariables && typeof plist.EnvironmentVariables === 'object'
      ? (plist.EnvironmentVariables as Record<string, unknown>)
      : {}

  if (!nodeBin || !fs.existsSync(nodeBin)) return true
  const nodeVersion = getNodeVersionForBin(nodeBin)
  if (!nodeVersion || !isSupportedOpenclawNodeVersion(nodeVersion)) return true
  if (!entryBin || !fs.existsSync(entryBin)) return true

  const installedVersion = typeof env.OPENCLAW_SERVICE_VERSION === 'string' ? env.OPENCLAW_SERVICE_VERSION : ''
  const currentVersion = extractInstalledOpenclawVersion()
  if (currentVersion && installedVersion && currentVersion !== installedVersion) return true

  return false
}

async function repairDarwinGatewayLaunchAgentIfNeeded(): Promise<void> {
  if (process.platform !== 'darwin') return
  if (!shouldRepairDarwinGatewayLaunchAgent()) return

  const { code, stdout, stderr } = await execOpenclaw(['gateway', 'install', '--force', '--json'], {
    timeoutMs: 20_000,
  })
  if (code !== 0) {
    throw new Error(stderr || stdout || 'Failed to repair OpenClaw gateway LaunchAgent')
  }
}

export type ExecOpenclawOptions = {
  /** Kill the child after this many ms (Node `execFile` `timeout`). Omit for no limit. */
  timeoutMs?: number
  /** Detach stdin so the CLI cannot block on interactive prompts (default inherits). */
  stdinIgnore?: boolean
  /**
   * Write to stdin then close (for `[y/N]` when the CLI has no `--yes`, e.g. OpenClaw 2026.3.x).
   * Takes precedence over `stdinIgnore`.
   */
  stdinInput?: string
}

function execOpenclawSpawnStdin(
  bin: string,
  args: string[],
  opts: ExecOpenclawOptions & { stdinInput: string }
): Promise<{ code: number; stdout: string; stderr: string }> {
  const maxBuffer = 20 * 1024 * 1024
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let killedByTimeout = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const accOut = { s: '' }
    const accErr = { s: '' }
    child.stdout?.on('data', (b) => {
      accOut.s += b.toString('utf8')
      if (accOut.s.length > maxBuffer) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }
    })
    child.stderr?.on('data', (b) => {
      accErr.s += b.toString('utf8')
      if (accErr.s.length > maxBuffer) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }
    })

    if (opts.timeoutMs != null && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        killedByTimeout = true
        try {
          child.kill('SIGTERM')
        } catch {
          /* ignore */
        }
        const killHard = setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }, 5000)
        killHard.unref()
      }, opts.timeoutMs)
    }

    child.once('error', (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.once('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      const out = accOut.s
      const err = accErr.s
      if (killedByTimeout) {
        resolve({
          code: 124,
          stdout: out.trim(),
          stderr: [err.trim(), `openclaw timed out after ${opts.timeoutMs}ms`].filter(Boolean).join('\n'),
        })
        return
      }
      const exitCode = code ?? (signal ? 1 : 0)
      resolve({
        code: exitCode,
        stdout: out.trim(),
        stderr: err.trim(),
      })
    })

    try {
      child.stdin?.write(opts.stdinInput, (wErr) => {
        if (wErr) {
          reject(wErr)
          return
        }
        child.stdin?.end()
      })
    } catch (e) {
      reject(e)
    }
  })
}

/** Run openclaw without throwing; use exit code like a shell */
export function execOpenclaw(
  args: string[],
  opts?: ExecOpenclawOptions
): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  let command: ResolvedOpenclawCommand
  try {
    command = resolveOpenclawCommand()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === getWslRuntimeUnavailableMessage()) {
      return Promise.resolve({ code: 1, stdout: '', stderr: error.message })
    }
    throw error
  }
  const bin = command.bin
  const allArgs = [...command.argsPrefix, ...args]
  if (opts?.stdinInput !== undefined) {
    return execOpenclawSpawnStdin(
      bin,
      allArgs,
      opts as ExecOpenclawOptions & { stdinInput: string }
    )
  }
  return new Promise((resolve, reject) => {
    const execOpts: ExecOpenclawFileOpts = {
      maxBuffer: 20 * 1024 * 1024,
      env: command.env,
    }
    if (opts?.timeoutMs != null && opts.timeoutMs > 0) {
      execOpts.timeout = opts.timeoutMs
    }
    if (opts?.stdinIgnore) {
      execOpts.stdio = ['ignore', 'pipe', 'pipe']
    }
    execFile(
      bin,
      allArgs,
      execOpts,
      (error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
        const out = typeof stdout === 'string' ? stdout : stdout.toString('utf8')
        const errOut = typeof stderr === 'string' ? stderr : stderr.toString('utf8')
        if (error && error.message?.includes('maxBuffer')) {
          reject(error)
          return
        }
        const errno =
          error && typeof error === 'object' && 'code' in error
            ? (error as NodeJS.ErrnoException).code
            : undefined
        if (error && errno === 'ETIMEDOUT') {
          const stderrStr = errOut.trim()
          const hint =
            opts?.timeoutMs != null
              ? `openclaw timed out after ${opts.timeoutMs}ms`
              : 'openclaw timed out'
          resolve({
            code: 124,
            stdout: out.trim(),
            stderr: [stderrStr, hint].filter(Boolean).join('\n').trim(),
          })
          return
        }
        const code =
          error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0
        resolve({
          code,
          stdout: out.trim(),
          stderr: errOut.trim(),
        })
      }
    )
  })
}

/** Run arbitrary shell command string without throwing; use exit code */
export function execShellCommand(command: string): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    try {
      const distro = requireSelectedWslDistroSync(runtimeSelection)
      return execWslCommand(distro, 'bash', ['-lc', command]).then((result) => ({
        code: result.code,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      }))
    } catch (error: unknown) {
      return Promise.resolve({
        code: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : getWslRuntimeUnavailableMessage(),
      })
    }
  }

  return new Promise((resolve, reject) => {
    exec(
      command,
      { maxBuffer: 10 * 1024 * 1024, env: process.env },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (error && error.message?.includes('maxBuffer')) {
          reject(error)
          return
        }
        const code =
          error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0
        resolve({
          code,
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
        })
      }
    )
  })
}

const NPM_INSTALLED_COMMANDS = new Set(['npm', 'clawhub'])

export function resolveExecFileCommand(cmd: string): string {
  if (process.platform === 'win32' && NPM_INSTALLED_COMMANDS.has(cmd)) {
    return cmd + '.cmd'
  }
  return cmd
}

export function needsShellOnWindows(cmd: string): boolean {
  return process.platform === 'win32' && NPM_INSTALLED_COMMANDS.has(cmd)
}

export function resolveNpmExecFileCommand(): string {
  return resolveExecFileCommand('npm')
}

/** `npm install -g <absolute path>` via execFile (no shell) to avoid special chars in path */
export function execNpmInstallGlobalFile(absolutePath: string): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    return Promise.resolve({
      code: 1,
      stdout: '',
      stderr: 'Installing a local npm tarball is not supported while the OpenClaw runtime is set to WSL2',
    })
  }

  return new Promise((resolve, reject) => {
    execFile(
      resolveNpmExecFileCommand(),
      ['install', '-g', absolutePath],
      { maxBuffer: 20 * 1024 * 1024, env: process.env, shell: process.platform === 'win32' },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (error && error.message?.includes('maxBuffer')) {
          reject(error)
          return
        }
        const code =
          error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0
        resolve({
          code,
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
        })
      }
    )
  })
}

export async function runOpenclawChecked(args: string[]): Promise<string> {
  const { code, stdout, stderr } = await execOpenclaw(args)
  if (code !== 0) {
    throw new Error(stderr || stdout || `openclaw exited with code ${code}`)
  }
  return stdout
}

/** Extract first JSON object from output that may include banners */
export function extractFirstJsonObject(s: string): string | null {
  const m = s.match(/\{[\s\S]*\}/)
  return m ? m[0] : null
}

/** Normalize `gateway status --json` across CLI versions */
export function parseGatewayStatusJsonPayload(s: string): {
  running: boolean
  port: number
} | null {
  const trimmed = s.trim()
  const candidate = trimmed.startsWith('{') ? trimmed : extractFirstJsonObject(trimmed)
  if (!candidate) return null
  try {
    const raw = JSON.parse(candidate) as Record<string, unknown>
    const stateStr =
      typeof raw.state === 'string' ? String(raw.state).toLowerCase() : ''
    const statusStr =
      typeof raw.status === 'string' ? String(raw.status).toLowerCase() : ''
    const running = Boolean(
      raw.running === true ||
      stateStr === 'running' ||
      statusStr === 'running' ||
      (typeof raw.active === 'boolean' && raw.active)
    )
    const port =
      typeof raw.port === 'number'
        ? raw.port
        : typeof raw.listenPort === 'number'
          ? raw.listenPort
          : 18789
    return { running, port }
  } catch {
    return null
  }
}

const GATEWAY_STATUS_TIMEOUT_MS = 3000

/** Treat TCP connect to local port as gateway up (CLI status can lag under LaunchAgent / PATH mismatch) */
export function probeGatewayTcpPort(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host, timeout: timeoutMs })
    const finish = (ok: boolean) => {
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
      resolve(ok)
    }
    sock.once('connect', () => finish(true))
    sock.once('error', () => finish(false))
    sock.once('timeout', () => finish(false))
  })
}

/** Query gateway status through the resolved OpenClaw runtime with a short timeout. */
export function execOpenclawGatewayStatusJson(): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  return execOpenclaw(['gateway', 'status', '--json'], { timeoutMs: GATEWAY_STATUS_TIMEOUT_MS })
}

export function execOpenclawGatewayStatusPlain(): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  return execOpenclaw(['gateway', 'status'], { timeoutMs: GATEWAY_STATUS_TIMEOUT_MS })
}

/**
 * On macOS, repair stale LaunchAgent wiring before starting so service control survives
 * Node/OpenClaw upgrades even if the backend itself was launched under an older Node.
 */
export function spawnOpenclawGatewayStart(): Promise<void> {
  return new Promise((resolve, reject) => {
    repairDarwinGatewayLaunchAgentIfNeeded()
      .then(() => {
        const command = resolveOpenclawCommand()
        const child = spawn(command.bin, [...command.argsPrefix, 'gateway', 'start'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: command.env,
        })
        let out = ''
        let err = ''
        child.stdout?.on('data', (c) => {
          out += String(c)
        })
        child.stderr?.on('data', (c) => {
          err += String(c)
        })
        child.once('error', reject)
        child.once('close', (code) => {
          if (code === 0) resolve()
          else {
            const msg = (err || out || `exit ${code ?? '?'}`).trim()
            reject(new Error(msg))
          }
        })
      })
      .catch(reject)
  })
}

export async function runOpenclawGatewayStop(): Promise<void> {
  const { code, stderr } = await execOpenclaw(['gateway', 'stop'])
  if (code !== 0) {
    throw new Error(stderr || `gateway stop exited with ${code}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function runOpenclawGatewayRestart(): Promise<void> {
  await runOpenclawGatewayStop().catch(() => {})
  await sleep(1000)
  await spawnOpenclawGatewayStart()
}
