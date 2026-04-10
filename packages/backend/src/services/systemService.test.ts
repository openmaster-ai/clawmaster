import assert from 'node:assert/strict'
import test from 'node:test'

import { getLocalDataBackendNodeRuntime, resolveBackendLocalDataStatus } from './systemService.js'

test('Local Data status in web mode is derived from the backend Node runtime', () => {
  const runtime = getLocalDataBackendNodeRuntime()
  assert.equal(runtime.installed, true)
  assert.equal(runtime.version, process.version)
})

test('backend Local Data status stays ready for WSL web mode when the backend Node meets the requirement', () => {
  const status = resolveBackendLocalDataStatus({
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
    profileSelection: { kind: 'default' },
    hostPlatform: 'win32',
    hostArch: 'x64',
    selectedWslDistro: 'Ubuntu-24.04',
    wslHomeDir: '/home/alice',
  })

  assert.equal(status.runtimeTarget, 'wsl2')
  assert.equal(status.targetPlatform, 'linux')
  assert.equal(status.state, 'ready')
  assert.equal(status.engine, 'fallback')
  assert.equal(status.reasonCode, null)
  assert.equal(status.dataRoot, '/home/alice/.clawmaster/data/default')
  assert.equal(status.engineRoot, '/home/alice/.clawmaster/data/default/fallback')
})
