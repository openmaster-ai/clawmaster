import fs from 'fs'
import path from 'path'
import { execShellCommand } from './execOpenclaw.js'

const ALLOWED = new Set(['openclaw', 'clawhub'])

function looksLikeNpmRenameIssue(combined: string): boolean {
  return /ENOTEMPTY|rename|EPERM|EACCES|EEXIST/i.test(combined)
}

/**
 * Global npm uninstall with ENOTEMPTY/rename workarounds:
 * 1) npm uninstall -g
 * 2) on failure npm uninstall -g --force
 * 3) else remove $(npm root -g)/<name> (only openclaw / clawhub allowed)
 */
export async function npmUninstallGlobalRobust(
  packageName: 'openclaw' | 'clawhub'
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (!ALLOWED.has(packageName)) {
    return { code: 1, stdout: '', stderr: 'unsupported package' }
  }

  let r = await execShellCommand(`npm uninstall -g ${packageName}`)
  if (r.code === 0) return r

  const combined = `${r.stderr}\n${r.stdout}`
  if (looksLikeNpmRenameIssue(combined)) {
    const f = await execShellCommand(`npm uninstall -g ${packageName} --force`)
    r = {
      code: f.code,
      stdout: [r.stdout, f.stdout].filter(Boolean).join('\n'),
      stderr: [r.stderr, f.stderr].filter(Boolean).join('\n'),
    }
    if (r.code === 0) return r
  }

  const rootRes = await execShellCommand('npm root -g')
  if (rootRes.code !== 0) {
    return {
      code: r.code,
      stdout: r.stdout,
      stderr: `${r.stderr}\n[npm root -g failed]\n${rootRes.stderr}`,
    }
  }

  const resolvedRoot = path.resolve(rootRes.stdout.trim())
  const pkgDir = path.join(resolvedRoot, packageName)
  const resolvedPkg = path.resolve(pkgDir)
  const rel = path.relative(resolvedRoot, resolvedPkg)
  if (rel !== packageName || rel.startsWith('..') || path.isAbsolute(rel)) {
    return r
  }

  if (!fs.existsSync(resolvedPkg)) {
    return {
      code: 0,
      stdout: `${r.stdout}\n(global package directory already absent)`.trim(),
      stderr: r.stderr,
    }
  }

  try {
    fs.rmSync(resolvedPkg, { recursive: true, force: true })
    return {
      code: 0,
      stdout: `${r.stdout}\nRemoved global dir: ${resolvedPkg}`.trim(),
      stderr: r.stderr,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      code: r.code,
      stdout: r.stdout,
      stderr: `${r.stderr}\n[rm fallback failed] ${msg}`,
    }
  }
}
