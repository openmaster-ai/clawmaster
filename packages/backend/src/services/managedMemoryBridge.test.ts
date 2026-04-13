import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildManagedMemoryBridgeEntry,
  getManagedMemoryBridgeStatusPayload,
  getManagedMemoryBridgePluginIssue,
  isManagedMemoryBridgePluginReady,
  resolveManagedMemoryPluginRootPath,
  windowsPathToWslPath,
} from './managedMemoryBridge.js'

test('windowsPathToWslPath converts drive paths into /mnt mounts', () => {
  assert.equal(
    windowsPathToWslPath('C:\\Users\\haili\\workspace\\clawmaster\\plugins\\memory-clawmaster-powermem'),
    '/mnt/c/Users/haili/workspace/clawmaster/plugins/memory-clawmaster-powermem'
  )
  assert.equal(windowsPathToWslPath('/already/posix'), null)
})

test('buildManagedMemoryBridgeEntry points native runtimes at the managed data root', () => {
  const homeDir = '/tmp/clawmaster-memory-plugin-linux'
  const entry = buildManagedMemoryBridgeEntry({
    platform: 'linux',
    homeDir,
    runtimeSelection: { mode: 'native' },
    profileSelection: { kind: 'default' },
  })

  assert.deepEqual(entry, {
    enabled: true,
    config: {
      dataRoot: path.posix.join(homeDir, '.clawmaster', 'data', 'default'),
      engine: 'powermem-seekdb',
      autoCapture: true,
      autoRecall: true,
      inferOnAdd: false,
      recallLimit: 5,
      recallScoreThreshold: 0,
    },
  })
})

test('buildManagedMemoryBridgeEntry converts the data root for WSL runtimes', () => {
  const entry = buildManagedMemoryBridgeEntry({
    platform: 'win32',
    homeDir: 'C:\\Users\\haili',
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
    profileSelection: { kind: 'named', name: 'lab' },
  })

  assert.deepEqual(entry, {
    enabled: true,
    config: {
      dataRoot: '/mnt/c/Users/haili/.clawmaster/data/named/lab',
      engine: 'powermem-sqlite',
      autoCapture: true,
      autoRecall: true,
      inferOnAdd: false,
      recallLimit: 5,
      recallScoreThreshold: 0,
    },
  })
})

test('resolveManagedMemoryPluginRootPath prefers packaged plugin resources when present', async () => {
  const resourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawmaster-memory-plugin-resource-'))
  const pluginRoot = path.join(resourceRoot, 'memory-clawmaster-powermem')
  await fs.mkdir(pluginRoot, { recursive: true })
  await fs.writeFile(path.join(pluginRoot, 'openclaw.plugin.json'), '{"id":"memory-clawmaster-powermem"}')

  const previous = process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT
  process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT = pluginRoot
  try {
    assert.equal(resolveManagedMemoryPluginRootPath(), pluginRoot)
  } finally {
    if (previous === undefined) {
      delete process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT
    } else {
      process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT = previous
    }
    await fs.rm(resourceRoot, { recursive: true, force: true })
  }
})

test('bridge status stays non-ready until the managed bridge config is synced', async () => {
  const status = await getManagedMemoryBridgeStatusPayload({
    platform: 'linux',
    homeDir: path.join(os.tmpdir(), 'clawmaster-memory-plugin-status'),
    runtimeSelection: { mode: 'native' },
    profileSelection: { kind: 'default' },
  })

  assert.equal(status.pluginId, 'memory-clawmaster-powermem')
  assert.equal(status.desired.slotValue, 'memory-clawmaster-powermem')
  assert.equal(status.pluginPathExists, true)
  assert.notEqual(status.state, 'ready')
  assert.ok(status.issues.length > 0)
  assert.match(
    status.issues.join('\n'),
    /not installed in OpenClaw yet|plugins\.slots\.memory is not set|plugins\.entries\.memory-clawmaster-powermem/
  )
})

test('isManagedMemoryBridgePluginReady only treats active plugin states as ready', () => {
  assert.equal(isManagedMemoryBridgePluginReady('loaded'), true)
  assert.equal(isManagedMemoryBridgePluginReady(' enabled '), true)
  assert.equal(isManagedMemoryBridgePluginReady('disabled'), false)
  assert.equal(isManagedMemoryBridgePluginReady('error'), false)
  assert.equal(isManagedMemoryBridgePluginReady(null), false)
})

test('getManagedMemoryBridgePluginIssue flags disabled installed plugins as drifted input', () => {
  assert.equal(
    getManagedMemoryBridgePluginIssue(true, 'disabled'),
    'memory-clawmaster-powermem is installed but currently disabled.',
  )
  assert.equal(
    getManagedMemoryBridgePluginIssue(true, null),
    'memory-clawmaster-powermem is installed but its runtime status is unknown.',
  )
  assert.equal(
    getManagedMemoryBridgePluginIssue(false, null),
    'memory-clawmaster-powermem is not installed in OpenClaw yet.',
  )
  assert.equal(getManagedMemoryBridgePluginIssue(true, 'loaded'), null)
})
