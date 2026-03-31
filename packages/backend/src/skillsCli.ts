import { runOpenclawChecked } from './execOpenclaw.js'

/**
 * Newer CLI uses `openclaw skills …`; older uses `clawhub`; some builds expose `clawbot`.
 * Order matches packages/web/src/shared/adapters/clawhub.ts.
 */
const SKILL_CLI_ROOTS = ['skills', 'clawbot', 'clawhub'] as const

export async function runOpenclawSkillsChecked(tail: string[]): Promise<string> {
  let last: Error | undefined
  for (const root of SKILL_CLI_ROOTS) {
    try {
      return await runOpenclawChecked([root, ...tail])
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      last = err
      if (/unknown command/i.test(err.message)) continue
      throw err
    }
  }
  throw last ?? new Error('openclaw: no matching skills CLI (tried skills, clawbot, clawhub)')
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
