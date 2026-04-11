import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeExecRequest } from './execRoutes.js'

test('rejects bash from the generic exec allowlist', () => {
  assert.throws(
    () => normalizeExecRequest('bash', ['-lc', 'echo hi']),
    /Command is not allowed: bash/
  )
})

test('rejects node from the generic exec allowlist', () => {
  assert.throws(
    () => normalizeExecRequest('node', ['-e', 'console.log("hi")']),
    /Command is not allowed: node/
  )
})

test('expands home-prefixed args for allowed native commands', () => {
  const normalized = normalizeExecRequest('npm', ['--prefix', '~/tmp/example'])
  assert.equal(normalized.cmd, 'npm')
  assert.match(normalized.args[1] ?? '', /tmp[\\/]example$/)
})
