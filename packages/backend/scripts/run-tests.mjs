import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve('src')

function collectTests(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

if (!statSync(root).isDirectory()) {
  throw new Error(`Missing test root: ${root}`)
}

const testFiles = collectTests(root).sort()

if (testFiles.length === 0) {
  console.error('No backend test files found under src/')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [path.resolve('../../node_modules/tsx/dist/cli.mjs'), '--test', ...testFiles],
  { stdio: 'inherit' },
)

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
