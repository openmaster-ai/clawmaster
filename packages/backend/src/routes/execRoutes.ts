import type { Express } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import path from 'path'
import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import { execOpenclaw, resolveExecFileCommand, needsShellOnWindows, clearOpenclawBinCache } from '../execOpenclaw.js'
import { runClawprobeCommand } from '../execClawprobe.js'
import { execWslCommand, resolveSelectedWslDistroSync, shouldUseWslRuntime } from '../wslRuntime.js'

const execFileAsync = promisify(execFile)
const INVALID_REQUEST_RE = /Missing cmd parameter|Args must be an array of strings|Command (?:path is not allowed|is not allowed)/
const ALLOWED_COMMANDS = new Set([
  'clawhub',
  'clawprobe',
  'npm',
  'ollama',
  'openclaw',
])

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function expandHomeToken(token: string): string {
  if (token.startsWith('~/')) {
    return path.join(homedir(), token.slice(2))
  }
  return token
}

export function normalizeExecRequest(
  cmd: string,
  args: unknown,
  options: { useWslRuntime?: boolean } = {}
): { cmd: string; args: string[] } {
  const trimmedCmd = cmd.trim()
  if (!trimmedCmd) {
    throw new Error('Missing cmd parameter')
  }
  if (trimmedCmd.includes('/') || trimmedCmd.includes('\\')) {
    throw new Error(`Command path is not allowed: ${trimmedCmd}`)
  }
  if (!ALLOWED_COMMANDS.has(trimmedCmd)) {
    throw new Error(`Command is not allowed: ${trimmedCmd}`)
  }
  if (args !== undefined && !isStringArray(args)) {
    throw new Error('Args must be an array of strings')
  }
  const normalizedArgs = options.useWslRuntime ? (args ?? []) : (args ?? []).map((arg) => expandHomeToken(arg))
  return {
    cmd: trimmedCmd,
    args: normalizedArgs,
  }
}

/**
 * Generic exec endpoint — used as a fallback for CLI commands that don't yet
 * have dedicated backend routes.
 *
 * NOTE: On Windows without WSL2, npm-installed CLI tools (`npm`, `clawhub`)
 * are resolved to their `.cmd` shims and executed with `shell: true` to avoid
 * ENOENT errors. Native binaries (`ollama`) use `shell: false` as before.
 */
export function registerExecRoutes(app: Express): void {
  app.post('/api/exec', async (req, res) => {
    const body = req.body ?? {}
    const { cmd, args } = body
    if (!cmd || typeof cmd !== 'string') {
      res.status(400).json({ error: 'Missing cmd parameter' })
      return
    }
    try {
      const runtimeSelection = getClawmasterRuntimeSelection()
      const useWslRuntime = shouldUseWslRuntime(runtimeSelection)
      const normalized = normalizeExecRequest(cmd, args, { useWslRuntime })
      if (normalized.cmd === 'openclaw') {
        const result = await execOpenclaw(normalized.args)
        res.json({
          ok: result.code === 0,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
          exitCode: result.code,
          ...(result.code === 0 ? {} : { error: result.stderr.trim() || result.stdout.trim() }),
        })
        return
      }
      if (normalized.cmd === 'clawprobe') {
        const result = await runClawprobeCommand(normalized.args)
        res.json({
          ok: result.ok,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
          exitCode: result.code,
          ...(result.ok ? {} : { error: result.stderr.trim() || result.stdout.trim() }),
        })
        return
      }
      if (useWslRuntime) {
        const distro = resolveSelectedWslDistroSync(runtimeSelection)
        if (!distro) {
          res.json({
            ok: false,
            error: 'WSL2 runtime selected but no distro could be resolved',
            stdout: '',
            stderr: '',
            exitCode: 1,
          })
          return
        }
        const result = await execWslCommand(distro, normalized.cmd, normalized.args)
        res.json({
          ok: result.code === 0,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
          exitCode: result.code,
          ...(result.code === 0 ? {} : { error: result.stderr.trim() || result.stdout.trim() }),
        })
        return
      }
      const resolvedCmd = resolveExecFileCommand(normalized.cmd)
      const { stdout, stderr } = await execFileAsync(resolvedCmd, normalized.args, {
        shell: needsShellOnWindows(normalized.cmd),
      })
      if (normalized.cmd === 'npm' && normalized.args.some((a) => a === 'openclaw')) {
        clearOpenclawBinCache()
      }
      res.json({ ok: true, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 })
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err)
      if (INVALID_REQUEST_RE.test(message)) {
        res.status(400).json({ error: message, stdout: '', stderr: err?.stderr || '' })
        return
      }

      const exitCode = typeof err?.code === 'number' ? err.code : err?.code === 'ENOENT' ? 127 : 1
      res.json({
        ok: false,
        error: message,
        stdout: (err?.stdout || '').trim(),
        stderr: (err?.stderr || '').trim(),
        exitCode,
      })
    }
  })
}
