import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePluginsJsonString } from './openclawPlugins.js'

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

  assert.deepEqual(parsePluginsJsonString(raw), [
    {
      id: 'memory-clawmaster-powermem',
      name: 'memory-clawmaster-powermem',
      status: 'loaded',
      version: '0.1.0',
      description: 'ClawMaster-managed OpenClaw memory plugin powered by PowerMem.',
    },
  ])
})
