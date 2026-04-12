import test from 'node:test'
import assert from 'node:assert/strict'
import { runDesktopSmoke } from './harness.mjs'

test('desktop shell smoke', { timeout: 15 * 60_000 }, async () => {
  const result = await runDesktopSmoke()
  assert.ok(result.details)
  console.log(`[desktop-smoke] mode=${result.mode} ${result.details}`)
})
