import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWebdriverSessionWithRetry,
  isRetryableWebdriverSessionError,
} from './harness.mjs'

test('isRetryableWebdriverSessionError matches transient driver transport failures', () => {
  assert.equal(
    isRetryableWebdriverSessionError(new Error('ECONNRESET socket hang up while creating session')),
    true,
  )
  assert.equal(
    isRetryableWebdriverSessionError(new Error('Connection refused during webdriver bootstrap')),
    true,
  )
  assert.equal(
    isRetryableWebdriverSessionError(new Error('expected title to match gateway page')),
    false,
  )
})

test('buildWebdriverSessionWithRetry retries transient webdriver bootstrap errors', async () => {
  const events = []
  let attempts = 0

  const session = await buildWebdriverSessionWithRetry({
    retryDelayMs: 0,
    async build() {
      attempts += 1
      if (attempts < 3) {
        throw new Error(attempts === 1 ? 'ECONNRESET socket hang up' : 'Connection refused')
      }
      return { id: 'session-ok' }
    },
    async onRetry({ attempt }) {
      events.push(`retry-${attempt}`)
    },
    async reset({ attempt }) {
      events.push(`reset-${attempt}`)
    },
  })

  assert.deepEqual(session, { id: 'session-ok' })
  assert.equal(attempts, 3)
  assert.deepEqual(events, ['retry-1', 'reset-1', 'retry-2', 'reset-2'])
})

test('buildWebdriverSessionWithRetry does not retry non-retryable errors', async () => {
  let attempts = 0
  let resetCalls = 0

  await assert.rejects(
    buildWebdriverSessionWithRetry({
      retryDelayMs: 0,
      async build() {
        attempts += 1
        throw new Error('page title mismatch')
      },
      async reset() {
        resetCalls += 1
      },
    }),
    /page title mismatch/,
  )

  assert.equal(attempts, 1)
  assert.equal(resetCalls, 0)
})

test('buildWebdriverSessionWithRetry stops after the configured attempt limit', async () => {
  let attempts = 0
  let resetCalls = 0

  await assert.rejects(
    buildWebdriverSessionWithRetry({
      maxAttempts: 2,
      retryDelayMs: 0,
      async build() {
        attempts += 1
        throw new Error('ECONNREFUSED webdriver bootstrap failed')
      },
      async reset() {
        resetCalls += 1
      },
    }),
    /ECONNREFUSED webdriver bootstrap failed/,
  )

  assert.equal(attempts, 2)
  assert.equal(resetCalls, 1)
})
