import {
  exec,
  execFile,
  execFileSync,
  spawn,
  type ExecException,
  type ExecFileException,
} from 'child_process'
import net from 'node:net'

/** GUI/backend child PATH may omit nvm global bin; resolve absolute path via login shell like Tauri `openclaw_cmd` */
let cachedOpenclawBin: string | null | undefined

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
  return cachedOpenclawBin ?? 'openclaw'
}

/** Run openclaw without throwing; use exit code like a shell */
export function execOpenclaw(args: string[]): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  const bin = resolveOpenclawBin()
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: 20 * 1024 * 1024, env: process.env },
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

/** Run arbitrary shell command string without throwing; use exit code */
export function execShellCommand(command: string): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
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

/** `npm install -g <absolute path>` via execFile (no shell) to avoid special chars in path */
export function execNpmInstallGlobalFile(absolutePath: string): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    execFile(
      'npm',
      ['install', '-g', absolutePath],
      { maxBuffer: 20 * 1024 * 1024, env: process.env },
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

/** macOS: query status through login shell like Terminal (direct openclaw exec often misses JSON under LaunchAgent) */
export function execOpenclawGatewayStatusJson(): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  if (process.platform === 'darwin') {
    return new Promise((resolve, reject) => {
      execFile(
        '/bin/zsh',
        ['-ilc', 'openclaw gateway status --json'],
        { maxBuffer: 20 * 1024 * 1024, env: process.env },
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
  return execOpenclaw(['gateway', 'status', '--json'])
}

export function execOpenclawGatewayStatusPlain(): Promise<{
  code: number
  stdout: string
  stderr: string
}> {
  if (process.platform === 'darwin') {
    return new Promise((resolve, reject) => {
      execFile(
        '/bin/zsh',
        ['-ilc', 'openclaw gateway status'],
        { maxBuffer: 20 * 1024 * 1024, env: process.env },
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
  return execOpenclaw(['gateway', 'status'])
}

/**
 * On macOS `gateway start` uses LaunchAgent and must run to completion inside a login shell
 * (same as Terminal). Previously detached + immediate unref broke launchctl.
 */
export function spawnOpenclawGatewayStart(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isMac = process.platform === 'darwin'
    const child = isMac
      ? spawn('/bin/zsh', ['-ilc', 'openclaw gateway start'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        })
      : spawn(resolveOpenclawBin(), ['gateway', 'start'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
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
