import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getOpenclawProfileSelection } from '../openclawProfile.js'
import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import { saveClawmasterRuntime, saveOpenclawProfile } from './settingsService.js'

function makeTempHome(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clawmaster-${label}-`))
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

test('saveOpenclawProfile can clone the current config into a new named profile', () => {
  const homeDir = makeTempHome('profile-clone')
  const context = {
    homeDir,
    settingsPath: path.join(homeDir, '.clawmaster', 'settings.json'),
  }

  const currentConfigPath = path.join(homeDir, '.openclaw', 'openclaw.json')
  writeJson(currentConfigPath, {
    gateway: { port: 4100 },
    models: { providers: { openai: { baseUrl: 'https://api.example.com/v1' } } },
  })

  const selection = saveOpenclawProfile(
    { kind: 'named', name: 'sandbox' },
    { mode: 'clone-current' },
    context
  )

  const targetConfigPath = path.join(homeDir, '.openclaw-sandbox', 'openclaw.json')
  assert.equal(selection.kind, 'named')
  assert.equal(selection.name, 'sandbox')
  assert.deepEqual(JSON.parse(fs.readFileSync(targetConfigPath, 'utf8')), JSON.parse(fs.readFileSync(currentConfigPath, 'utf8')))
  assert.deepEqual(getOpenclawProfileSelection(context), { kind: 'named', name: 'sandbox' })
})

test('saveOpenclawProfile can import an external openclaw.json into a new named profile', () => {
  const homeDir = makeTempHome('profile-import')
  const context = {
    homeDir,
    settingsPath: path.join(homeDir, '.clawmaster', 'settings.json'),
  }

  const sourceConfigPath = path.join(homeDir, 'imports', 'openclaw.json')
  writeJson(sourceConfigPath, {
    agents: { defaults: { workspace: '~/workspace' } },
    channels: { discord: { enabled: true } },
  })

  saveOpenclawProfile(
    { kind: 'named', name: 'team-a' },
    { mode: 'import-config', sourcePath: sourceConfigPath },
    context
  )

  const targetConfigPath = path.join(homeDir, '.openclaw-team-a', 'openclaw.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(targetConfigPath, 'utf8')), JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8')))
})

test('saveOpenclawProfile rejects seeding into an existing named profile config', () => {
  const homeDir = makeTempHome('profile-existing')
  const context = {
    homeDir,
    settingsPath: path.join(homeDir, '.clawmaster', 'settings.json'),
  }

  const existingConfigPath = path.join(homeDir, '.openclaw-existing', 'openclaw.json')
  writeJson(existingConfigPath, { gateway: { port: 3001 } })

  assert.throws(
    () =>
      saveOpenclawProfile(
        { kind: 'named', name: 'existing' },
        { mode: 'import-config', sourcePath: existingConfigPath },
        context
      ),
    /already has an OpenClaw config/
  )
})

test('saveClawmasterRuntime persists WSL2 runtime selection', () => {
  const homeDir = makeTempHome('runtime-wsl')
  const context = {
    homeDir,
    settingsPath: path.join(homeDir, '.clawmaster', 'settings.json'),
  }

  saveClawmasterRuntime({
    mode: 'wsl2',
    wslDistro: 'Ubuntu-24.04',
    backendPort: 3101,
    autoStartBackend: true,
  }, context)

  assert.deepEqual(getClawmasterRuntimeSelection(context), {
    mode: 'wsl2',
    wslDistro: 'Ubuntu-24.04',
    backendPort: 3101,
    autoStartBackend: true,
  })
})
