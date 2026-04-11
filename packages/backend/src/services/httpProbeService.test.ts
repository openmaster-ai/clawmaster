import assert from 'node:assert/strict'
import test from 'node:test'

import { probeHttpStatus } from './httpProbeService.js'

test('probeHttpStatus rejects unsupported protocols', async () => {
  await assert.rejects(
    () => probeHttpStatus({ url: 'file:///tmp/test.txt' }),
    /Unsupported probe protocol/
  )
})

test('probeHttpStatus reports successful HTTP status codes', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch

  try {
    const result = await probeHttpStatus({ url: 'https://example.com/health', method: 'GET' })
    assert.deepEqual(result, { ok: true, status: 200 })
  } finally {
    globalThis.fetch = originalFetch
  }
})
