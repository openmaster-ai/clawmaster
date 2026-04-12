import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveOpenclawMemorySearchCapability,
  resolveOpenclawMemorySearchOutput,
} from './memoryOpenclaw.js'

test('resolveOpenclawMemorySearchOutput accepts structured empty results even when exit code is non-zero', () => {
  const result = resolveOpenclawMemorySearchOutput({
    code: 1,
    stdout: '{"results":[]}',
    stderr: 'no memory hits',
  })
  assert.deepEqual(result, [])
})

test('resolveOpenclawMemorySearchCapability detects fallback mode when fts5 is unavailable', () => {
  const capability = resolveOpenclawMemorySearchCapability({
    code: 1,
    stdout: '',
    stderr: 'Memory search failed: no such module: fts5',
  })
  assert.deepEqual(capability, {
    mode: 'fallback',
    reason: 'fts5_unavailable',
    detail: 'Memory search failed: no such module: fts5',
  })
})
