import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  FallbackFileStore,
  getClawmasterDataRootForProfile,
  resolveLocalDataHostEngineRoot,
  resolveLocalDataStatus,
} from './storage.js'

function tempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clawmaster-${label}-`))
}

test('uses a profile-scoped clawmaster data root for the default profile', () => {
  assert.equal(
    getClawmasterDataRootForProfile({ kind: 'default' }, { homeDir: '/home/alice', platform: 'linux' }),
    '/home/alice/.clawmaster/data/default',
  )
})

test('uses a named clawmaster data root with target platform semantics', () => {
  assert.equal(
    getClawmasterDataRootForProfile({ kind: 'named', name: 'team-a' }, { homeDir: 'C:\\Users\\alice', platform: 'win32' }),
    'C:\\Users\\alice\\.clawmaster\\data\\named\\team-a',
  )
})

test('uses the file fallback store while marking supported linux targets seekdb-ready', () => {
  const status = resolveLocalDataStatus({
    hostPlatform: 'linux',
    hostArch: 'x64',
    homeDir: '/home/alice',
    profileSelection: { kind: 'default' },
    runtimeSelection: { mode: 'native' },
    nodeInstalled: true,
    nodeVersion: 'v20.11.1',
  })

  assert.equal(status.state, 'ready')
  assert.equal(status.engine, 'fallback')
  assert.equal(status.supportsEmbedded, true)
  assert.equal(status.dataRoot, '/home/alice/.clawmaster/data/default')
  assert.equal(status.engineRoot, '/home/alice/.clawmaster/data/default/fallback')
  assert.equal(status.reasonCode, null)
})

test('uses the file fallback store on unsupported native Windows targets', () => {
  const status = resolveLocalDataStatus({
    hostPlatform: 'win32',
    hostArch: 'x64',
    homeDir: 'C:\\Users\\alice',
    profileSelection: { kind: 'named', name: 'team-a' },
    runtimeSelection: { mode: 'native' },
    nodeInstalled: true,
    nodeVersion: 'v20.11.1',
  })

  assert.equal(status.state, 'ready')
  assert.equal(status.engine, 'fallback')
  assert.equal(status.supportsEmbedded, false)
  assert.equal(status.reasonCode, null)
  assert.equal(status.dataRoot, 'C:\\Users\\alice\\.clawmaster\\data\\named\\team-a')
  assert.equal(status.engineRoot, 'C:\\Users\\alice\\.clawmaster\\data\\named\\team-a\\fallback')
})

test('blocks local data when WSL2 mode is selected but the distro is missing', () => {
  const status = resolveLocalDataStatus({
    hostPlatform: 'win32',
    hostArch: 'x64',
    homeDir: 'C:\\Users\\alice',
    profileSelection: { kind: 'default' },
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
    selectedWslDistro: null,
    nodeInstalled: true,
    nodeVersion: 'v20.11.1',
  })

  assert.equal(status.state, 'blocked')
  assert.equal(status.engine, 'unavailable')
  assert.equal(status.reasonCode, 'wsl_distro_missing')
  assert.equal(status.dataRoot, null)
  assert.equal(status.engineRoot, null)
})

test('maps WSL2 local data roots to a host-accessible UNC path on Windows', () => {
  const status = resolveLocalDataStatus({
    hostPlatform: 'win32',
    hostArch: 'x64',
    homeDir: 'C:\\Users\\alice',
    profileSelection: { kind: 'default' },
    runtimeSelection: { mode: 'wsl2', wslDistro: 'Ubuntu-24.04' },
    selectedWslDistro: 'Ubuntu-24.04',
    wslHomeDir: '/home/alice',
    nodeInstalled: true,
    nodeVersion: 'v20.11.1',
  })

  assert.equal(status.engineRoot, '/home/alice/.clawmaster/data/default/fallback')
  assert.equal(
    resolveLocalDataHostEngineRoot(status, {
      platform: 'win32',
      wslDistro: 'Ubuntu-24.04',
    }),
    '\\\\wsl.localhost\\Ubuntu-24.04\\home\\alice\\.clawmaster\\data\\default\\fallback',
  )
})

test('keeps native local data roots unchanged for host file IO', () => {
  const status = resolveLocalDataStatus({
    hostPlatform: 'darwin',
    hostArch: 'arm64',
    homeDir: '/Users/alice',
    profileSelection: { kind: 'default' },
    runtimeSelection: { mode: 'native' },
    nodeInstalled: true,
    nodeVersion: 'v20.11.1',
  })

  assert.equal(
    resolveLocalDataHostEngineRoot(status, { platform: 'darwin' }),
    '/Users/alice/.clawmaster/data/default/fallback',
  )
})

test('falls back when the runtime node version is below the seekdb requirement', () => {
  const status = resolveLocalDataStatus({
    hostPlatform: 'darwin',
    hostArch: 'arm64',
    homeDir: '/Users/alice',
    profileSelection: { kind: 'dev' },
    runtimeSelection: { mode: 'native' },
    nodeInstalled: true,
    nodeVersion: 'v18.19.1',
  })

  assert.equal(status.state, 'degraded')
  assert.equal(status.engine, 'fallback')
  assert.equal(status.reasonCode, 'node_too_old')
  assert.equal(status.engineRoot, '/Users/alice/.clawmaster/data/dev/fallback')
})

test('FallbackFileStore persists documents and returns ranked keyword results', () => {
  const root = tempDir('filestore-search')
  const store = new FallbackFileStore({
    state: 'ready',
    engine: 'fallback',
    runtimeTarget: 'native',
    profileKey: 'default',
    dataRoot: root,
    engineRoot: path.join(root, 'fallback'),
    nodeRequirement: '>=20',
    supportsEmbedded: true,
    targetPlatform: 'darwin',
    targetArch: 'arm64',
    reasonCode: null,
  })

  store.upsertDocuments([
    {
      id: 'docs:gateway',
      module: 'docs',
      sourceType: 'guide',
      title: 'Gateway authentication',
      content: 'Configure token auth, loopback bind, and gateway startup.',
      tags: ['gateway', 'auth'],
    },
    {
      id: 'docs:channels',
      module: 'docs',
      sourceType: 'guide',
      title: 'Channel setup',
      content: 'Connect Feishu, Slack, Discord, and webhook accounts.',
      tags: ['channels'],
    },
  ])

  const results = store.search({ query: 'gateway auth', module: 'docs' })
  assert.equal(results[0]?.id, 'docs:gateway')
  assert.match(results[0]?.snippet ?? '', /gateway/i)

  const restored = new FallbackFileStore(store.status)
  assert.equal(restored.stats().documentCount, 2)
  assert.equal(restored.search({ query: 'discord', module: 'docs' })[0]?.id, 'docs:channels')

  fs.rmSync(root, { recursive: true, force: true })
})

test('FallbackFileStore can rebuild and reset without corrupting schema state', () => {
  const root = tempDir('filestore-reset')
  const store = new FallbackFileStore({
    state: 'ready',
    engine: 'fallback',
    runtimeTarget: 'native',
    profileKey: 'dev',
    dataRoot: root,
    engineRoot: path.join(root, 'fallback'),
    nodeRequirement: '>=20',
    supportsEmbedded: false,
    targetPlatform: 'win32',
    targetArch: 'x64',
    reasonCode: null,
  })

  store.upsertDocuments([
    {
      id: 'docs:runtime',
      module: 'docs',
      sourceType: 'troubleshooting',
      title: 'Runtime troubleshooting',
      content: 'Check profile isolation, WSL2 mode, plugins, skills, and MCP.',
    },
  ])

  const rebuilt = store.rebuild()
  assert.equal(rebuilt.documentCount, 1)
  assert.equal(rebuilt.schemaVersion, 1)

  const reset = store.reset()
  assert.equal(reset.documentCount, 0)
  assert.equal(reset.schemaVersion, 1)
  assert.deepEqual(store.search({ query: 'runtime', module: 'docs' }), [])

  fs.rmSync(root, { recursive: true, force: true })
})

test('FallbackFileStore can replace generated module documents without keeping stale entries', () => {
  const root = tempDir('filestore-replace')
  const store = new FallbackFileStore({
    state: 'ready',
    engine: 'fallback',
    runtimeTarget: 'native',
    profileKey: 'default',
    dataRoot: root,
    engineRoot: path.join(root, 'fallback'),
    nodeRequirement: '>=20',
    supportsEmbedded: true,
    targetPlatform: 'darwin',
    targetArch: 'arm64',
    reasonCode: null,
  })

  store.upsertDocuments([
    {
      id: 'docs:old',
      module: 'docs',
      sourceType: 'guide',
      title: 'Old docs entry',
      content: 'This retired-only document should not remain searchable.',
    },
    {
      id: 'memory:keep',
      module: 'memory',
      sourceType: 'note',
      title: 'Memory entry',
      content: 'Keep this unrelated module document.',
    },
  ])

  const stats = store.replaceDocuments([
    {
      id: 'docs:new',
      module: 'docs',
      sourceType: 'guide',
      title: 'New docs entry',
      content: 'Fresh gateway setup document.',
    },
  ], { module: 'docs' })

  assert.equal(stats.documentCount, 2)
  assert.equal(store.search({ query: 'retired-only', module: 'docs' }).length, 0)
  assert.equal(store.search({ query: 'fresh gateway', module: 'docs' })[0]?.id, 'docs:new')
  assert.equal(store.search({ query: 'unrelated', module: 'memory' })[0]?.id, 'memory:keep')

  fs.rmSync(root, { recursive: true, force: true })
})
