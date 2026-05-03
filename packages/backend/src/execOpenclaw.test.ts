import assert from 'node:assert/strict'
import os from 'node:os'
import test from 'node:test'

import {
  execNpmInstallGlobalFile,
  getDarwinNodeCandidatePathsForTests,
  getDarwinNodeHomeRootsForTests,
  needsShellOnWindows,
  resolveExecFileCommand,
  resolveNpmExecFileCommand,
} from './execOpenclaw.js'

function withPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T> | T): Promise<T> {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
    })
}

// --- resolveExecFileCommand ---

test('resolveExecFileCommand resolves npm to npm.cmd on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(resolveExecFileCommand('npm'), 'npm.cmd')
  })
})

test('resolveExecFileCommand resolves clawhub to clawhub.cmd on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(resolveExecFileCommand('clawhub'), 'clawhub.cmd')
  })
})

test('resolveExecFileCommand resolves openclaw to openclaw.cmd on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(resolveExecFileCommand('openclaw'), 'openclaw.cmd')
  })
})

test('resolveExecFileCommand resolves clawprobe to clawprobe.cmd on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(resolveExecFileCommand('clawprobe'), 'clawprobe.cmd')
  })
})

test('resolveExecFileCommand keeps ollama bare on Windows (native binary)', async () => {
  await withPlatform('win32', () => {
    assert.equal(resolveExecFileCommand('ollama'), 'ollama')
  })
})

test('resolveExecFileCommand returns bare command on non-Windows for all commands', async () => {
  await withPlatform('linux', () => {
    assert.equal(resolveExecFileCommand('npm'), 'npm')
    assert.equal(resolveExecFileCommand('clawhub'), 'clawhub')
    assert.equal(resolveExecFileCommand('ollama'), 'ollama')
    assert.equal(resolveExecFileCommand('openclaw'), 'openclaw')
    assert.equal(resolveExecFileCommand('clawprobe'), 'clawprobe')
  })
})

// --- needsShellOnWindows ---

test('needsShellOnWindows returns true for npm-installed commands on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(needsShellOnWindows('npm'), true)
    assert.equal(needsShellOnWindows('clawhub'), true)
    assert.equal(needsShellOnWindows('openclaw'), true)
    assert.equal(needsShellOnWindows('clawprobe'), true)
  })
})

test('needsShellOnWindows returns false for native binaries on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(needsShellOnWindows('ollama'), false)
  })
})

test('needsShellOnWindows returns false for everything on non-Windows', async () => {
  await withPlatform('linux', () => {
    assert.equal(needsShellOnWindows('npm'), false)
    assert.equal(needsShellOnWindows('clawhub'), false)
    assert.equal(needsShellOnWindows('ollama'), false)
    assert.equal(needsShellOnWindows('openclaw'), false)
    assert.equal(needsShellOnWindows('clawprobe'), false)
  })
})

// --- resolveNpmExecFileCommand (backward compat) ---

test('resolveNpmExecFileCommand returns npm.cmd on Windows', async () => {
  await withPlatform('win32', () => {
    assert.equal(resolveNpmExecFileCommand(), 'npm.cmd')
  })
})

test('resolveNpmExecFileCommand returns npm on non-Windows', async () => {
  await withPlatform('linux', () => {
    assert.equal(resolveNpmExecFileCommand(), 'npm')
  })
})

// --- execNpmInstallGlobalFile ---

test('execNpmInstallGlobalFile switches to Windows npm.cmd resolution path', async () => {
  await withPlatform('win32', async () => {
    const result = await execNpmInstallGlobalFile('C:/tmp/openclaw.tgz')
    assert.notEqual(result.code, 0)
  })
})

test('execNpmInstallGlobalFile keeps non-Windows npm resolution path', async () => {
  await withPlatform('linux', async () => {
    const result = await execNpmInstallGlobalFile('/tmp/openclaw-does-not-exist.tgz')
    assert.notEqual(result.code, 0)
  })
})

test('Darwin node candidate discovery keeps the real user home when HOME points at an isolated profile', async () => {
  await withPlatform('darwin', () => {
    const originalHome = process.env.HOME
    const actualUserHome = os.userInfo().homedir
    process.env.HOME = '/tmp/clawmaster-proof-home'
    try {
      const homeRoots = getDarwinNodeHomeRootsForTests()
      assert.ok(homeRoots.includes('/tmp/clawmaster-proof-home'))
      assert.ok(homeRoots.includes(actualUserHome))
      assert.ok(getDarwinNodeCandidatePathsForTests().includes(process.execPath))
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
    }
  })
})
