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

test('resolveOpenclawMemorySearchCapability detects unsupported mode when legacy memory commands are unavailable', () => {
  const capability = resolveOpenclawMemorySearchCapability({
    code: 1,
    stdout: '[plugins] memory-clawmaster-powermem: plugin registered',
    stderr: "error: unknown command 'memory'",
  })
  assert.deepEqual(capability, {
    mode: 'unsupported',
    reason: 'command_unavailable',
    detail: "error: unknown command 'memory'",
  })
})

test('resolveOpenclawMemorySearchOutput accepts structured results from stderr when stdout only has plugin logs', () => {
  const result = resolveOpenclawMemorySearchOutput({
    code: 0,
    stdout: '[plugins] memory-clawmaster-powermem: plugin registered',
    stderr: '[{"id":"managed-1","content":"Remember espresso","score":0.9}]',
  })
  assert.deepEqual(result, [
    {
      id: 'managed-1',
      content: 'Remember espresso',
      score: 0.9,
      path: undefined,
      metadata: undefined,
    },
  ])
})
