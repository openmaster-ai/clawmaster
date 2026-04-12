import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  addManagedMemory,
  closeManagedMemoryRuntimesForTests,
  deleteManagedMemory,
  getManagedMemoryStatusPayload,
  getManagedMemoryStatsPayload,
  listManagedMemories,
  resetManagedMemory,
  resolveManagedMemoryStoreContext,
  searchManagedMemories,
} from './managedMemory.js'

test.afterEach(async () => {
  await closeManagedMemoryRuntimesForTests()
})

test('managed memory status and passive reads do not provision storage before first write', async () => {
  const dataRootOverride = path.join(os.tmpdir(), `clawmaster-managed-memory-passive-${Date.now()}`)
  const context = {
    dataRootOverride,
    profileSelection: { kind: 'default' } as const,
  }

  const status = await getManagedMemoryStatusPayload(context)
  assert.equal(status.provisioned, false)

  const stats = await getManagedMemoryStatsPayload(context)
  assert.equal(stats.totalMemories, 0)

  const listed = await listManagedMemories({ limit: 5 }, context)
  assert.equal(listed.total, 0)
  assert.equal(listed.memories.length, 0)

  await assert.rejects(fs.stat(status.dbPath))
})

test('resolveManagedMemoryStoreContext scopes storage by OpenClaw profile', () => {
  const homeDir = path.join(os.tmpdir(), 'clawmaster-managed-memory-home')

  const defaultStore = resolveManagedMemoryStoreContext({
    homeDir,
    profileSelection: { kind: 'default' },
  })
  assert.equal(defaultStore.profileKey, 'default')
  assert.equal(defaultStore.runtimeRoot, path.join(homeDir, '.clawmaster', 'data', 'default', 'memory', 'powermem'))

  const namedStore = resolveManagedMemoryStoreContext({
    homeDir,
    profileSelection: { kind: 'named', name: 'research' },
  })
  assert.equal(namedStore.profileKey, 'named:research')
  assert.equal(namedStore.dbPath, path.join(homeDir, '.clawmaster', 'data', 'named', 'research', 'memory', 'powermem', 'powermem.sqlite'))

  const devStore = resolveManagedMemoryStoreContext({
    homeDir,
    profileSelection: { kind: 'dev' },
  })
  assert.equal(devStore.profileKey, 'dev')
  assert.equal(devStore.runtimeRoot, path.join(homeDir, '.clawmaster', 'data', 'dev', 'memory', 'powermem'))
})

test('managed powermem foundation supports add, list, search, delete, and reset', async () => {
  const dataRootOverride = path.join(os.tmpdir(), `clawmaster-managed-memory-${Date.now()}`)
  const context = {
    dataRootOverride,
    profileSelection: { kind: 'named', name: 'lab' } as const,
  }

  const espresso = await addManagedMemory(
    {
      content: 'Alice prefers espresso after lunch and keeps oat milk in the office fridge.',
      userId: 'alice',
      agentId: 'planner',
      metadata: { source: 'test' },
    },
    context
  )
  assert.ok(espresso.memoryId)
  assert.equal(espresso.userId, 'alice')

  await addManagedMemory(
    {
      content: 'Alice books Friday focus blocks for design review follow-up.',
      userId: 'alice',
      agentId: 'planner',
      metadata: { source: 'test' },
    },
    context
  )

  const listed = await listManagedMemories({ limit: 10 }, context)
  assert.equal(listed.total, 2)
  assert.equal(listed.memories.length, 2)

  const searchHits = await searchManagedMemories(
    'espresso oat milk preference',
    {
      userId: 'alice',
      agentId: 'planner',
      limit: 5,
    },
    context
  )
  assert.ok(searchHits.length >= 1)
  assert.ok(searchHits.some((item) => /espresso/i.test(item.content)))

  const stats = await getManagedMemoryStatsPayload(context)
  assert.equal(stats.totalMemories, 2)
  assert.equal(stats.userCount, 1)
  assert.equal(stats.profileKey, 'named:lab')
  assert.match(stats.dbPath, /powermem\.sqlite$/)

  const deleted = await deleteManagedMemory(espresso.memoryId, context)
  assert.equal(deleted, true)

  const afterDelete = await listManagedMemories({ limit: 10 }, context)
  assert.equal(afterDelete.total, 1)

  const afterReset = await resetManagedMemory(context)
  assert.equal(afterReset.totalMemories, 0)
  assert.equal(afterReset.userCount, 0)
})

test('managed memory stats count distinct users across multiple pages', async () => {
  const dataRootOverride = path.join(os.tmpdir(), `clawmaster-managed-memory-users-${Date.now()}`)
  const context = {
    dataRootOverride,
    profileSelection: { kind: 'named', name: 'users' } as const,
  }

  for (let index = 0; index < 503; index += 1) {
    await addManagedMemory(
      {
        content: `Preference note ${index}`,
        userId: `user-${index}`,
        agentId: 'planner',
      },
      context
    )
  }

  const stats = await getManagedMemoryStatsPayload(context)
  assert.equal(stats.totalMemories, 503)
  assert.equal(stats.userCount, 503)
})
