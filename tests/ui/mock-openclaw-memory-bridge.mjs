import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function chmodExecutable(filePath) {
  await fs.chmod(filePath, 0o755)
}

async function ensureFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clawmaster-memory-bridge-'))
const homeDir = path.join(root, 'home')
const binDir = path.join(root, 'bin')
const statePath = path.join(root, 'mock-openclaw-state.json')
const openclawDir = path.join(homeDir, '.openclaw')
const memoryDir = path.join(openclawDir, 'memory')
const workspaceDir = path.join(openclawDir, 'workspace')
const configPath = path.join(openclawDir, 'openclaw.json')
const sqlitePath = path.join(memoryDir, 'main.sqlite')
const walPath = path.join(memoryDir, 'main.sqlite-wal')
const bridgeId = 'memory-clawmaster-powermem'

await fs.mkdir(binDir, { recursive: true })
await fs.mkdir(memoryDir, { recursive: true })
await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true })

await ensureFile(
  configPath,
  JSON.stringify(
    {
      plugins: {
        slots: {},
        entries: {},
      },
    },
    null,
    2,
  ),
)

await ensureFile(sqlitePath, 'sqlite-placeholder')
await ensureFile(walPath, 'journal-placeholder')
await ensureFile(
  path.join(workspaceDir, 'MEMORY.md'),
  [
    '# Team memory',
    '',
    '- The user prefers espresso without sugar.',
    '- Keep answers in English unless explicitly asked otherwise.',
  ].join('\n'),
)
await ensureFile(
  path.join(workspaceDir, 'memory', 'preferences.md'),
  [
    '# Preferences',
    '',
    'Espresso preference: double espresso, no sugar, ceramic cup.',
  ].join('\n'),
)

await ensureFile(
  statePath,
  JSON.stringify(
    {
      pluginInstalled: false,
      pluginEnabled: false,
      linkedPluginPath: null,
    },
    null,
    2,
  ),
)

const scriptPath = path.join(binDir, 'openclaw')
const script = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const statePath = ${JSON.stringify(statePath)}
const configPath = ${JSON.stringify(configPath)}
const sqlitePath = ${JSON.stringify(sqlitePath)}
const workspaceDir = ${JSON.stringify(workspaceDir)}
const bridgeId = ${JSON.stringify(bridgeId)}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'))
}

function writeState(next) {
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2))
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function writeConfig(next) {
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2))
}

function json(value) {
  process.stdout.write(JSON.stringify(value, null, 2))
}

const args = process.argv.slice(2)

if (args[0] === '--version') {
  process.stdout.write('openclaw 2026.4.0\\n')
  process.exit(0)
}

if (args[0] === 'plugins' && args[1] === 'list') {
  const state = readState()
  const rows = state.pluginInstalled
    ? [{
        id: bridgeId,
        name: 'Memory (ClawMaster PowerMem)',
        status: state.pluginEnabled ? 'enabled' : 'disabled',
        version: '0.1.0',
        description: state.linkedPluginPath || '',
      }]
    : []
  if (args.includes('--json')) {
    json(rows)
  } else if (rows.length > 0) {
    process.stdout.write('Name | ID | Status | Version\\n')
    process.stdout.write('Memory (ClawMaster PowerMem) | ' + bridgeId + ' | ' + (state.pluginEnabled ? 'enabled' : 'disabled') + ' | 0.1.0\\n')
  }
  process.exit(0)
}

if (args[0] === 'plugins' && args[1] === 'install') {
  const state = readState()
  const linkIndex = args.indexOf('-l')
  const pluginPath = linkIndex >= 0 ? args[linkIndex + 1] : args[2]
  state.pluginInstalled = true
  state.linkedPluginPath = pluginPath || null
  writeState(state)
  process.stdout.write('installed ' + bridgeId + '\\n')
  process.exit(0)
}

if (args[0] === 'plugins' && args[1] === 'enable' && args[2] === bridgeId) {
  const state = readState()
  state.pluginEnabled = true
  writeState(state)
  process.stdout.write('enabled ' + bridgeId + '\\n')
  process.exit(0)
}

if (args[0] === 'plugins' && args[1] === 'disable' && args[2] === bridgeId) {
  const state = readState()
  state.pluginEnabled = false
  writeState(state)
  process.stdout.write('disabled ' + bridgeId + '\\n')
  process.exit(0)
}

if (args[0] === 'memory' && args[1] === 'status' && args.includes('--json')) {
  json([
    {
      agentId: 'main',
      status: {
        backend: 'sqlite',
        dbPath: sqlitePath,
        workspaceDir,
        dirty: false,
      },
      scan: {
        totalFiles: 2,
      },
    },
  ])
  process.exit(0)
}

if (args[0] === 'memory' && args[1] === 'search' && args.includes('--json')) {
  const queryIndex = args.indexOf('--query')
  const query = queryIndex >= 0 ? String(args[queryIndex + 1] || '').toLowerCase() : ''
  const hits = query && query !== '__clawmaster_probe__' && query.includes('espresso')
    ? [
        {
          id: path.join(workspaceDir, 'memory', 'preferences.md'),
          content: 'Espresso preference: double espresso, no sugar, ceramic cup.',
          score: 0.98,
          path: path.join(workspaceDir, 'memory', 'preferences.md'),
        },
      ]
    : []
  json(hits)
  process.exit(0)
}

if (args[0] === 'memory' && args[1] === 'index') {
  process.stdout.write('reindexed memory\\n')
  process.exit(0)
}

process.stderr.write('unsupported mock openclaw command: ' + args.join(' ') + '\\n')
process.exit(1)
`

await ensureFile(scriptPath, script)
await chmodExecutable(scriptPath)

process.stdout.write(
  JSON.stringify(
    {
      root,
      homeDir,
      binDir,
      statePath,
      configPath,
      openclawBin: scriptPath,
      workspaceDir,
      memoryDir,
    },
    null,
    2,
  ),
)
