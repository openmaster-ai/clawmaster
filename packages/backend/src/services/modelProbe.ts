import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Safe subset for provider keys in openclaw.json (avoid shell / arg injection). */
const PROVIDER_ID_RE = /^[a-zA-Z0-9._-]+$/

export type ModelProbeRun = {
  exitCode: number
  stdout: string
  stderr: string
}

export function assertSafeProviderId(providerId: string): string {
  const id = providerId.trim()
  if (!id) throw new Error('Missing providerId')
  if (!PROVIDER_ID_RE.test(id)) throw new Error('Invalid providerId')
  return id
}

/**
 * Runs `openclaw models status --json --probe --probe-provider <id>` (see OpenClaw CLI docs).
 * Real network requests; may consume tokens / hit rate limits.
 */
export async function probeOpenclawModelProvider(providerId: string): Promise<ModelProbeRun> {
  const id = assertSafeProviderId(providerId)
  const args = ['models', 'status', '--json', '--probe', '--probe-provider', id]
  try {
    const out = await execFileAsync('openclaw', args, {
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    })
    return {
      exitCode: 0,
      stdout: String(out.stdout ?? '').trimEnd(),
      stderr: String(out.stderr ?? '').trimEnd(),
    }
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
    if (err.code === 'ENOENT') {
      return {
        exitCode: 127,
        stdout: '',
        stderr: '未找到 openclaw 可执行文件。请安装 OpenClaw CLI 并确保其在运行后端的 shell PATH 中。',
      }
    }
    const exitCode = typeof err.code === 'number' ? err.code : 1
    return {
      exitCode,
      stdout: err.stdout ? String(err.stdout).trimEnd() : '',
      stderr: err.stderr ? String(err.stderr).trimEnd() : (err.message ?? '').trimEnd(),
    }
  }
}
