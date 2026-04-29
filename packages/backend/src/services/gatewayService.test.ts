import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getGatewayWatchdogStatus,
  isGatewayWatchdogEnabledByEnv,
  startGatewayWatchdog,
  stopGatewayWatchdog,
} from './gatewayService.js'

test.afterEach(() => {
  stopGatewayWatchdog()
})

test('gateway watchdog is opt-in for backend processes and enabled by CLI env', () => {
  assert.equal(isGatewayWatchdogEnabledByEnv({}), false)
  assert.equal(isGatewayWatchdogEnabledByEnv({ CLAWMASTER_GATEWAY_WATCHDOG: '1' }), true)
  assert.equal(isGatewayWatchdogEnabledByEnv({ CLAWMASTER_GATEWAY_WATCHDOG: 'true' }), true)
  assert.equal(isGatewayWatchdogEnabledByEnv({ CLAWMASTER_GATEWAY_WATCHDOG: '0' }), false)
  assert.equal(isGatewayWatchdogEnabledByEnv({ CLAWMASTER_GATEWAY_WATCHDOG: 'off' }), false)
})

test('gateway watchdog publishes lifecycle status without running an immediate probe', () => {
  const started = startGatewayWatchdog({
    intervalMs: 60 * 60 * 1000,
    runImmediately: false,
  })

  assert.equal(started.enabled, true)
  assert.equal(started.state, 'idle')
  assert.equal(started.intervalMs, 60 * 60 * 1000)
  assert.equal(started.restartCount, 0)
  assert.deepEqual(getGatewayWatchdogStatus(), started)

  const stopped = stopGatewayWatchdog()
  assert.equal(stopped.enabled, false)
  assert.equal(stopped.state, 'disabled')
})
