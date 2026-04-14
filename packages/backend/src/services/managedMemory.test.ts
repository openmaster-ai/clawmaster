import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SQLiteStore, type VectorStore } from 'powermem'

import {
  addManagedMemory,
  closeManagedMemoryRuntimesForTests,
  deleteManagedMemory,
  getManagedMemoryStatusPayload,
  getManagedMemoryStatsPayload,
  listManagedMemories,
  migrateLegacySqliteIfNeededForTest,
  resetManagedMemory,
  resolveManagedMemoryEngine,
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
    engineOverride: 'powermem-sqlite' as const,
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
    engineOverride: 'powermem-sqlite',
  })
  assert.equal(defaultStore.profileKey, 'default')
  assert.equal(defaultStore.runtimeRoot, path.join(homeDir, '.clawmaster', 'data', 'default', 'memory', 'powermem'))

  const namedStore = resolveManagedMemoryStoreContext({
    homeDir,
    profileSelection: { kind: 'named', name: 'research' },
    engineOverride: 'powermem-sqlite',
  })
  assert.equal(namedStore.profileKey, 'named:research')
  assert.equal(namedStore.dbPath, path.join(homeDir, '.clawmaster', 'data', 'named', 'research', 'memory', 'powermem', 'powermem.sqlite'))

  const devStore = resolveManagedMemoryStoreContext({
    homeDir,
    profileSelection: { kind: 'dev' },
    engineOverride: 'powermem-sqlite',
  })
  assert.equal(devStore.profileKey, 'dev')
  assert.equal(devStore.runtimeRoot, path.join(homeDir, '.clawmaster', 'data', 'dev', 'memory', 'powermem'))
})

test('resolveManagedMemoryEngine promotes supported hosts to seekdb and keeps Windows on sqlite', () => {
  assert.equal(resolveManagedMemoryEngine('linux', 'x64'), 'powermem-seekdb')
  assert.equal(resolveManagedMemoryEngine('linux', 'arm64'), 'powermem-seekdb')
  assert.equal(resolveManagedMemoryEngine('linux', 'ia32'), 'powermem-sqlite')
  assert.equal(resolveManagedMemoryEngine('linux', 'riscv64'), 'powermem-sqlite')
  assert.equal(resolveManagedMemoryEngine('darwin', 'arm64'), 'powermem-sqlite')
  assert.equal(resolveManagedMemoryEngine('darwin', 'x64'), 'powermem-sqlite')
  assert.equal(resolveManagedMemoryEngine('win32', 'x64'), 'powermem-sqlite')
})

test('managed powermem foundation supports add, list, search, delete, and reset', async () => {
  const dataRootOverride = path.join(os.tmpdir(), `clawmaster-managed-memory-${Date.now()}`)
  const context = {
    dataRootOverride,
    profileSelection: { kind: 'named', name: 'lab' } as const,
    engineOverride: 'powermem-sqlite' as const,
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
  assert.match(stats.storagePath, /powermem\.sqlite$/)

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
    engineOverride: 'powermem-sqlite' as const,
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

test('migrateLegacySqliteIfNeededForTest resumes interrupted sqlite-to-seekdb migrations', async () => {
  const dataRootOverride = path.join(os.tmpdir(), `clawmaster-managed-memory-seekdb-migrate-${Date.now()}`)
  const store = resolveManagedMemoryStoreContext({
    dataRootOverride,
    profileSelection: { kind: 'default' },
    engineOverride: 'powermem-seekdb',
  })
  await fs.mkdir(store.runtimeRoot, { recursive: true })

  const sqliteStore = new SQLiteStore(store.legacyDbPath)
  const embedding = new Array(128).fill(0.5)
  try {
    await sqliteStore.insert('legacy-1', embedding, {
      data: 'Alice prefers espresso after lunch.',
      agent_id: 'main',
      hash: 'legacy-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    })
    await sqliteStore.insert('legacy-2', embedding, {
      data: 'Alice keeps a paper notebook for meeting prep.',
      agent_id: 'main',
      hash: 'legacy-2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    })
  } finally {
    await sqliteStore.close()
  }

  const records = new Map<string, { id: string; payload: Record<string, unknown> }>()
  records.set('legacy-1', {
    id: 'legacy-1',
    payload: { data: 'stale partial migration row' },
  })
  const fakeSeekdbStore = {
    async count() {
      return records.size
    },
    async getById(id: string) {
      return records.get(id) ?? null
    },
    async insert(id: string, _vector: number[], payload: Record<string, unknown>) {
      records.set(id, { id, payload })
    },
    async update(id: string, _vector: number[], payload: Record<string, unknown>) {
      records.set(id, { id, payload })
    },
  } as unknown as VectorStore

  await migrateLegacySqliteIfNeededForTest(store, fakeSeekdbStore)

  assert.equal(records.size, 2)
  assert.match(String(records.get('legacy-1')?.payload.data ?? ''), /espresso/i)
  assert.match(String(records.get('legacy-2')?.payload.data ?? ''), /paper notebook/i)

  const markerPath = path.join(store.runtimeRoot, 'powermem-seekdb-migration.json')
  const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as Record<string, unknown>
  assert.equal(marker.mode, 'sqlite-to-seekdb')
  assert.equal(marker.migratedCount, 2)
  assert.equal(marker.updatedCount, 1)
  assert.equal(marker.insertedCount, 1)
  assert.equal(marker.existingCountAtStart, 1)
})
