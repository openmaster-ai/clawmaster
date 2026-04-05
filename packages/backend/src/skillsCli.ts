import { execOpenclaw } from './execOpenclaw.js'

function firstJsonPayloadCandidate(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const starts = [trimmed.indexOf('{'), trimmed.indexOf('[')]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)
  for (const start of starts) {
    const candidate = trimmed.slice(start)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // Keep scanning; OpenClaw may print warning prefixes before the JSON payload.
    }
  }
  return null
}

async function runOpenclawSkillsRootChecked(
  root: (typeof SKILL_CLI_ROOTS)[number],
  tail: string[],
): Promise<string> {
  const { code, stdout, stderr } = await execOpenclaw([root, ...tail])
  if (code !== 0) {
    throw new Error(stderr || stdout || `openclaw exited with code ${code}`)
  }

  const stdoutTrimmed = stdout.trim()
  if (stdoutTrimmed) return stdoutTrimmed

  const stderrJson = firstJsonPayloadCandidate(stderr)
  if (stderrJson) return stderrJson

  return stderr.trim()
}

/**
 * Newer CLI uses `openclaw skills …`; older uses `clawhub`; some builds expose `clawbot`.
 * Order matches packages/web/src/shared/adapters/clawhub.ts.
 */
const SKILL_CLI_ROOTS = ['skills', 'clawbot', 'clawhub'] as const

let skillsCliRootCache: (typeof SKILL_CLI_ROOTS)[number] | null = null

/**
 * Try cached subcommand root first, then run all candidates in parallel on cold start
 * (wall time ≈ one CLI spawn instead of up to three sequential attempts).
 */
async function runOpenclawWithSkillsRootPick<T>(
  fn: (root: (typeof SKILL_CLI_ROOTS)[number]) => Promise<T>
): Promise<T> {
  if (skillsCliRootCache) {
    try {
      return await fn(skillsCliRootCache)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      if (/unknown command/i.test(err.message)) {
        skillsCliRootCache = null
      } else {
        throw err
      }
    }
  }

  const settled = await Promise.allSettled(SKILL_CLI_ROOTS.map((root) => fn(root)))
  const errors: Error[] = []
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status === 'fulfilled') {
      skillsCliRootCache = SKILL_CLI_ROOTS[i]
      return r.value
    }
    errors.push(r.reason instanceof Error ? r.reason : new Error(String(r.reason)))
  }
  const serious = errors.find((e) => !/unknown command/i.test(e.message))
  if (serious) throw serious
  throw (
    errors[errors.length - 1] ??
    new Error('openclaw: no matching skills CLI (tried skills, clawbot, clawhub)')
  )
}

export async function runOpenclawSkillsChecked(tail: string[]): Promise<string> {
  return runOpenclawWithSkillsRootPick((root) => runOpenclawSkillsRootChecked(root, tail))
}

export async function runOpenclawSkillsUninstall(slug: string): Promise<void> {
  try {
    await runOpenclawSkillsChecked(['uninstall', slug])
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first)
    if (!/unknown command/i.test(msg)) throw first
    await runOpenclawSkillsChecked(['remove', slug])
  }
}
