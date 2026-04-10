import assert from 'node:assert/strict'
import test from 'node:test'

import { setConfigAtPath } from './configJson.js'

test('setConfigAtPath rejects prototype pollution segments', () => {
  const root: Record<string, unknown> = {}

  assert.throws(
    () => setConfigAtPath(root, '__proto__.polluted', true),
    /Unsafe config path segment: __proto__/
  )
  assert.equal(({} as Record<string, unknown>).polluted, undefined)

  assert.throws(
    () => setConfigAtPath(root, 'safe.constructor.prototype', true),
    /Unsafe config path segment: constructor/
  )
})
