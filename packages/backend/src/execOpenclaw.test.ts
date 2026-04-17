import assert from 'node:assert/strict'
import test from 'node:test'

import { execNpmInstallGlobalFile } from './execOpenclaw.js'

function withPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T> | T): Promise<T> {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
    })
}

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
