import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getOpenclawConfigPathCandidatesFor,
  getOpenclawConfigResolution,
  resolveOpenclawConfigPath,
} from './paths.js'

test('prefers ~/.openclaw/openclaw.json before the roaming config on Windows', () => {
  const homeDir = 'C:\\Users\\alice'
  const appDataBase = 'C:\\Users\\alice\\AppData\\Roaming'

  const candidates = getOpenclawConfigPathCandidatesFor({
    platform: 'win32',
    homeDir,
    appDataBase,
  })

  assert.deepEqual(candidates, [
    'C:\\Users\\alice\\.openclaw\\openclaw.json',
    'C:\\Users\\alice\\AppData\\Roaming\\openclaw\\openclaw.json',
  ])
})

test('falls back to the roaming config when the legacy home config is missing on Windows', () => {
  const candidates = [
    'C:\\Users\\alice\\.openclaw\\openclaw.json',
    'C:\\Users\\alice\\AppData\\Roaming\\openclaw\\openclaw.json',
  ]

  const resolved = resolveOpenclawConfigPath(
    candidates,
    (candidate) => candidate === candidates[1]
  )

  assert.equal(resolved, candidates[1])
})

test('defaults new Windows installs to ~/.openclaw/openclaw.json when no config exists yet', () => {
  const candidates = getOpenclawConfigPathCandidatesFor({
    platform: 'win32',
    homeDir: 'C:\\Users\\alice',
    appDataBase: 'C:\\Users\\alice\\AppData\\Roaming',
  })

  const resolved = resolveOpenclawConfigPath(candidates, () => false)

  assert.equal(resolved, candidates[0])
})

test('uses ~/.openclaw-dev when the dev profile override is active', () => {
  const resolution = getOpenclawConfigResolution({
    platform: 'darwin',
    homeDir: '/Users/alice',
    profileSelection: { kind: 'dev' },
  })

  assert.equal(resolution.dataDir, '/Users/alice/.openclaw-dev')
  assert.equal(resolution.configPath, '/Users/alice/.openclaw-dev/openclaw.json')
  assert.equal(resolution.source, 'profile-dev')
  assert.equal(resolution.overrideActive, true)
})

test('uses ~/.openclaw-<name> when a named profile override is active', () => {
  const resolution = getOpenclawConfigResolution({
    platform: 'linux',
    homeDir: '/home/alice',
    profileSelection: { kind: 'named', name: 'team-a' },
  })

  assert.equal(resolution.dataDir, '/home/alice/.openclaw-team-a')
  assert.equal(resolution.configPath, '/home/alice/.openclaw-team-a/openclaw.json')
  assert.equal(resolution.source, 'profile-named')
  assert.equal(resolution.overrideActive, true)
})

test('uses Windows path semantics for profile overrides when the target platform is win32', () => {
  const resolution = getOpenclawConfigResolution({
    platform: 'win32',
    homeDir: 'C:\\Users\\alice',
    profileSelection: { kind: 'named', name: 'team-a' },
  })

  assert.equal(resolution.dataDir, 'C:\\Users\\alice\\.openclaw-team-a')
  assert.equal(resolution.configPath, 'C:\\Users\\alice\\.openclaw-team-a\\openclaw.json')
})
