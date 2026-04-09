import { execOpenclaw } from '../execOpenclaw.js'

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
  const out = await execOpenclaw(args, {
    timeoutMs: 30_000,
  })

  return {
    exitCode: out.code,
    stdout: out.stdout.trimEnd(),
    stderr: out.stderr.trimEnd(),
  }
}
