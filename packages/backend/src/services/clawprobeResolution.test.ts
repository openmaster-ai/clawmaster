import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import express from 'express'

import { resetClawprobeCommandCacheForTests } from '../execClawprobe.js'
import { registerExecRoutes } from '../routes/execRoutes.js'
import { clawprobeBootstrap } from './clawprobeService.js'

const originalPath = process.env.PATH

function makeTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clawmaster-${label}-`))
}

function writeExecutable(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
  fs.chmodSync(filePath, 0o755)
}

function createFakeNpm(filePath: string, prefixDir: string): void {
  writeExecutable(
    filePath,
    `#!/bin/sh
if [ "$1" = "config" ] && [ "$2" = "get" ] && [ "$3" = "prefix" ]; then
  printf '%s\\n' "${prefixDir}"
  exit 0
fi
printf 'unexpected npm args: %s\\n' "$*" >&2
exit 1
`
  )
}

function createVersionOnlyClawprobe(filePath: string, version: string): void {
  writeExecutable(
    filePath,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\\n' "${version}"
  exit 0
fi
printf 'unexpected clawprobe args: %s\\n' "$*" >&2
exit 1
`
  )
}

function createBootstrapClawprobe(filePath: string, stateFile: string): void {
  writeExecutable(
    filePath,
    `#!/bin/sh
if [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  if [ -f "${stateFile}" ]; then
    printf '{"ok":true,"daemonRunning":true}\\n'
  else
    printf '{"ok":true,"daemonRunning":false}\\n'
  fi
  exit 0
fi
if [ "$1" = "start" ]; then
  printf 'running\\n' > "${stateFile}"
  printf 'started\\n'
  exit 0
fi
printf 'unexpected clawprobe args: %s\\n' "$*" >&2
exit 1
`
  )
}

function setFakePath(binDir: string): void {
  process.env.PATH = binDir
}

test.beforeEach(() => {
  resetClawprobeCommandCacheForTests()
})

test.afterEach(() => {
  resetClawprobeCommandCacheForTests()
  if (originalPath === undefined) {
    delete process.env.PATH
  } else {
    process.env.PATH = originalPath
  }
})

test(
  'POST /api/exec resolves clawprobe from npm global prefix when it is missing from PATH',
  { skip: process.platform === 'win32' },
  async () => {
    const tempDir = makeTempDir('clawprobe-exec-route')
    const fakePathDir = path.join(tempDir, 'path-bin')
    const npmPrefixDir = path.join(tempDir, 'npm-prefix')
    const globalBinDir = path.join(npmPrefixDir, 'bin')

    createFakeNpm(path.join(fakePathDir, 'npm'), npmPrefixDir)
    createVersionOnlyClawprobe(path.join(globalBinDir, 'clawprobe'), '1.3.0')
    setFakePath(fakePathDir)

    const app = express()
    app.use(express.json())
    registerExecRoutes(app)

    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve())
      server.once('error', reject)
    })

    try {
      const address = server.address()
      assert.ok(address && typeof address !== 'string')

      const response = await fetch(`http://127.0.0.1:${address.port}/api/exec`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cmd: 'clawprobe', args: ['--version'] }),
      })

      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), {
        ok: true,
        stdout: '1.3.0',
        stderr: '',
        exitCode: 0,
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  }
)

test(
  'clawprobeBootstrap succeeds when clawprobe is only discoverable via npm global prefix',
  { skip: process.platform === 'win32' },
  async () => {
    const tempDir = makeTempDir('clawprobe-bootstrap')
    const fakePathDir = path.join(tempDir, 'path-bin')
    const npmPrefixDir = path.join(tempDir, 'npm-prefix')
    const globalBinDir = path.join(npmPrefixDir, 'bin')
    const stateFile = path.join(tempDir, 'clawprobe.state')

    createFakeNpm(path.join(fakePathDir, 'npm'), npmPrefixDir)
    createBootstrapClawprobe(path.join(globalBinDir, 'clawprobe'), stateFile)
    setFakePath(fakePathDir)

    const result = await clawprobeBootstrap()

    assert.equal(result.ok, true)
    assert.equal(result.alreadyRunning, false)
    assert.equal(result.daemonRunning, true)
    assert.equal(result.message, 'ClawProbe 已成功拉起')
    assert.equal(fs.existsSync(stateFile), true)
  }
)
