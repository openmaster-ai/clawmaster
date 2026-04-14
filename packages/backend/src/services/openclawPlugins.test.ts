import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePluginsJsonString, parsePluginsPlainText } from './openclawPlugins.js'

test('parsePluginsJsonString tolerates plugin log preambles before the JSON payload', () => {
  const raw = `[plugins] memory-clawmaster-powermem: plugin registered (dataRoot: /Users/haili/.clawmaster/data/default, user: openclaw-user, agent: openclaw-agent)
{
  "workspaceDir": "/Users/haili/.openclaw/workspace",
  "plugins": [
    {
      "id": "memory-clawmaster-powermem",
      "name": "memory-clawmaster-powermem",
      "status": "loaded",
      "version": "0.1.0",
      "description": "ClawMaster-managed OpenClaw memory plugin powered by PowerMem."
    }
  ]
}`

  const rows = parsePluginsJsonString(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.name, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.status, 'loaded')
  assert.equal(rows[0]?.version, '0.1.0')
  assert.equal(rows[0]?.description, 'ClawMaster-managed OpenClaw memory plugin powered by PowerMem.')
})

test('parsePluginsJsonString keeps plugin source paths when the CLI reports them', () => {
  const raw = `[
    {
      "id": "memory-clawmaster-powermem",
      "name": "memory-clawmaster-powermem",
      "status": "loaded",
      "source": "global:/tmp/clawmaster/plugins/memory-clawmaster-powermem/index.ts"
    }
  ]`

  const rows = parsePluginsJsonString(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.name, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.status, 'loaded')
  assert.equal(rows[0]?.source, 'global:/tmp/clawmaster/plugins/memory-clawmaster-powermem/index.ts')
})

test('parsePluginsPlainText reads status from four-column plugin tables', () => {
  const raw = `
  | Name | ID | Status | Version |
  | ClawMaster PowerMem | memory-clawmaster-powermem | loaded | 0.1.0 |
  `

  const rows = parsePluginsPlainText(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.status, 'loaded')
  assert.equal(rows[0]?.version, '0.1.0')
})

test('parsePluginsPlainText preserves wrapped source paths across continuation rows', () => {
  const raw = `
  | Name | ID | Status | Source | Version |
  | ClawMaster PowerMem | memory-clawmaster-powermem | loaded | global:/tmp/clawmaster/plugins/memory-clawmaster- | |
  | | | | powermem/index.ts | 0.1.0 |
  `

  const rows = parsePluginsPlainText(raw)
  assert.equal(rows.length, 1)
  assert.equal(
    rows[0]?.source,
    'global:/tmp/clawmaster/plugins/memory-clawmaster-powermem/index.ts',
  )
  assert.equal(rows[0]?.status, 'loaded')
  assert.equal(rows[0]?.version, '0.1.0')
})

test('parsePluginsPlainText reads unfenced four-column plugin tables', () => {
  const raw = `
  Name | ID | Status | Version
  ClawMaster PowerMem | memory-clawmaster-powermem | loaded | 0.1.0
  `

  const rows = parsePluginsPlainText(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.status, 'loaded')
  assert.equal(rows[0]?.version, '0.1.0')
})

test('parsePluginsPlainText reads unfenced five-column plugin tables', () => {
  const raw = `
  Name | ID | Status | Source | Version
  ClawMaster PowerMem | memory-clawmaster-powermem | loaded | global:/tmp/clawmaster/plugins/memory-clawmaster-powermem/index.ts | 0.1.0
  `

  const rows = parsePluginsPlainText(raw)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 'memory-clawmaster-powermem')
  assert.equal(rows[0]?.status, 'loaded')
  assert.equal(
    rows[0]?.source,
    'global:/tmp/clawmaster/plugins/memory-clawmaster-powermem/index.ts',
  )
  assert.equal(rows[0]?.version, '0.1.0')
})
