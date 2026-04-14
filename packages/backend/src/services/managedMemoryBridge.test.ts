import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildManagedMemoryBridgeEntry,
  resolveManagedMemoryBridgeImportContextForTest,
  getManagedMemoryBridgePluginPathIssue,
  getManagedMemoryBridgeStatusPayload,
  getManagedMemoryBridgePluginIssue,
  isManagedMemoryBridgePluginReady,
  resolveManagedMemoryBridgeImportModeForTest,
  resolveInstalledPluginPath,
  resolveManagedMemoryPluginRootPath,
  shouldIgnoreManagedMemoryBridgeReindexErrorForTest,
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

test('buildManagedMemoryBridgeEntry returns null when WSL runtime is selected without a valid distro', () => {
  const entry = buildManagedMemoryBridgeEntry({
    platform: 'win32',
    homeDir: 'C:\\Users\\haili',
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
    profileSelection: { kind: 'named', name: 'lab' },
  })

  assert.equal(entry, null)
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

test('resolveManagedMemoryPluginRootPath keeps the packaged root when configured, even if files are missing', () => {
  const previous = process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT
  process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT = path.join(
    os.tmpdir(),
    'clawmaster-memory-plugin-missing',
  )
  try {
    assert.equal(
      resolveManagedMemoryPluginRootPath(),
      process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT,
    )
  } finally {
    if (previous === undefined) {
      delete process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT
    } else {
      process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT = previous
    }
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

test('bridge status reports unsupported when the packaged plugin files are missing', async () => {
  const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawmaster-memory-plugin-missing-status-'))
  const previous = process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT
  process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT = missingRoot
  try {
    const status = await getManagedMemoryBridgeStatusPayload({
      platform: 'linux',
      homeDir: path.join(os.tmpdir(), 'clawmaster-memory-plugin-status-missing'),
      runtimeSelection: { mode: 'native' },
      profileSelection: { kind: 'default' },
    })

    assert.equal(status.pluginPath, missingRoot)
    assert.equal(status.pluginPathExists, false)
    assert.equal(status.state, 'unsupported')
    assert.match(status.issues.join('\n'), /plugin files are missing/)
  } finally {
    if (previous === undefined) {
      delete process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT
    } else {
      process.env.CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT = previous
    }
    await fs.rm(missingRoot, { recursive: true, force: true })
  }
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

test('getManagedMemoryBridgePluginPathIssue detects stale linked plugin paths', () => {
  assert.equal(
    getManagedMemoryBridgePluginPathIssue(
      true,
      '/opt/clawmaster-old/plugins/memory-clawmaster-powermem',
      '/opt/clawmaster/plugins/memory-clawmaster-powermem',
    ),
    'memory-clawmaster-powermem is linked to /opt/clawmaster-old/plugins/memory-clawmaster-powermem instead of /opt/clawmaster/plugins/memory-clawmaster-powermem.',
  )
  assert.equal(
    getManagedMemoryBridgePluginPathIssue(
      true,
      'global:/opt/clawmaster/plugins/memory-clawmaster-powermem/index.ts',
      '/opt/clawmaster/plugins/memory-clawmaster-powermem',
    ),
    null,
  )
  assert.equal(
    getManagedMemoryBridgePluginPathIssue(
      true,
      null,
      '/opt/clawmaster/plugins/memory-clawmaster-powermem',
    ),
    'memory-clawmaster-powermem is installed but its linked source path is unknown.',
  )
  assert.equal(
    getManagedMemoryBridgePluginPathIssue(
      false,
      null,
      '/opt/clawmaster/plugins/memory-clawmaster-powermem',
    ),
    null,
  )
})

test('bridge status reports unsupported when WSL runtime is selected without a valid distro', async () => {
  const status = await getManagedMemoryBridgeStatusPayload({
    platform: 'win32',
    homeDir: 'C:\\Users\\haili',
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Missing-Ubuntu' },
    profileSelection: { kind: 'default' },
  })

  assert.equal(status.state, 'unsupported')
  assert.equal(status.runtimePluginPath, null)
  assert.match(status.issues.join('\n'), /WSL2 runtime is selected, but the configured distro is missing or unavailable/i)
})

test('resolveInstalledPluginPath only trusts explicit source paths', () => {
  assert.equal(
    resolveInstalledPluginPath({
      id: 'memory-clawmaster-powermem',
      name: 'memory-clawmaster-powermem',
      source: 'global:/opt/clawmaster/plugins/memory-clawmaster-powermem/index.ts',
      description: 'linked from /some/other/place',
    }),
    '/opt/clawmaster/plugins/memory-clawmaster-powermem',
  )

  assert.equal(
    resolveInstalledPluginPath({
      id: 'memory-clawmaster-powermem',
      name: 'memory-clawmaster-powermem',
      description: '/opt/clawmaster/plugins/memory-clawmaster-powermem',
    }),
    '/opt/clawmaster/plugins/memory-clawmaster-powermem',
  )
})

test('resolveManagedMemoryBridgeImportModeForTest uses OpenClaw reindex for WSL runtimes', () => {
  assert.equal(
    resolveManagedMemoryBridgeImportModeForTest({
      platform: 'linux',
      homeDir: '/tmp/clawmaster-native-bridge-import',
      runtimeSelection: { mode: 'native' },
      profileSelection: { kind: 'default' },
    }),
    'host-import',
  )

  assert.equal(
    resolveManagedMemoryBridgeImportModeForTest({
      platform: 'win32',
      homeDir: 'C:\\Users\\haili',
      runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
      profileSelection: { kind: 'default' },
    }),
    'openclaw-reindex',
  )
})

test('resolveManagedMemoryBridgeImportContextForTest maps WSL workspace imports to a host UNC path', () => {
  const context = resolveManagedMemoryBridgeImportContextForTest({
    platform: 'win32',
    homeDir: 'C:\\Users\\haili',
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
    profileSelection: { kind: 'named', name: 'lab' },
  })

  assert.equal(
    context.openclawDataRootOverride,
    '\\\\wsl.localhost\\Ubuntu-24.04\\home\\haili\\.openclaw-lab',
  )
})

test('shouldIgnoreManagedMemoryBridgeReindexErrorForTest tolerates legacy missing memory commands', () => {
  assert.equal(
    shouldIgnoreManagedMemoryBridgeReindexErrorForTest(new Error("error: unknown command 'memory'")),
    true,
  )
  assert.equal(
    shouldIgnoreManagedMemoryBridgeReindexErrorForTest(
      new Error('OpenClaw requires Node >= 20. Upgrade Node and re-run OpenClaw.'),
    ),
    true,
  )
  assert.equal(
    shouldIgnoreManagedMemoryBridgeReindexErrorForTest(new Error('permission denied')),
    false,
  )
})
