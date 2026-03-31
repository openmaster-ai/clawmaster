import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)

function resolveClawprobeEntry(): string {
  const pkgJson = require.resolve('clawprobe/package.json')
  const root = path.dirname(pkgJson)
  return path.join(root, 'dist', 'index.js')
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
  const entry = resolveClawprobeEntry()
  const node = process.execPath

  let stdout = ''
  let stderr = ''
  let exitCode = 0
  try {
    const out = await execFileAsync(node, [entry, ...args], {
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    })
    stdout = String(out.stdout ?? '').trim()
    stderr = String(out.stderr ?? '').trim()
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
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
