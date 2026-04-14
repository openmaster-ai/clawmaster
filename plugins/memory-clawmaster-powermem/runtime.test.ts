import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SQLiteStore, type VectorStore, type VectorStoreRecord, type VectorStoreSearchMatch } from 'powermem'

import {
  addManagedMemory,
  closeManagedMemoryRuntimesForTests,
  migrateLegacySqliteIfNeededForTest,
} from './runtime.js'

class FakeVectorStore implements VectorStore {
  #records = new Map<string, VectorStoreRecord>()

  constructor(seed: VectorStoreRecord[] = []) {
    for (const item of seed) {
      this.#records.set(this.#key(item.id, item.userId, item.agentId), { ...item })
    }
  }

  async insert(id: string, embedding: number[], data: Record<string, unknown>): Promise<void> {
    const record = this.#fromPayload(id, embedding, data)
    this.#records.set(this.#key(record.id, record.userId, record.agentId), record)
  }

  async search(): Promise<VectorStoreSearchMatch[]> {
    return []
  }

  async getById(id: string, userId?: string, agentId?: string): Promise<VectorStoreRecord | null> {
    return this.#records.get(this.#key(id, userId, agentId)) ?? null
  }

  async list(): Promise<{ records: VectorStoreRecord[], total: number }> {
    const records = Array.from(this.#records.values())
    return {
      records,
      total: records.length,
    }
  }

  async update(id: string, embedding: number[], data: Record<string, unknown>): Promise<void> {
    const record = this.#fromPayload(id, embedding, data)
    this.#records.set(this.#key(record.id, record.userId, record.agentId), record)
  }

  async remove(id: string): Promise<boolean> {
    for (const [key, record] of this.#records.entries()) {
      if (record.id === id) {
        this.#records.delete(key)
        return true
      }
    }
    return false
  }

  async removeAll(): Promise<void> {
    this.#records.clear()
  }

  async count(): Promise<number> {
    return this.#records.size
  }

  async incrementAccessCount(id: string): Promise<void> {
    for (const record of this.#records.values()) {
      if (record.id === id) {
        record.accessCount = (record.accessCount ?? 0) + 1
      }
    }
  }

  async incrementAccessCountBatch(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.incrementAccessCount(id)
    }
  }

  async close(): Promise<void> {}

  snapshot(): VectorStoreRecord[] {
    return Array.from(this.#records.values())
  }

  #key(id: string, userId?: string, agentId?: string): string {
    return `${id}:${userId ?? ''}:${agentId ?? ''}`
  }

  #fromPayload(id: string, embedding: number[], data: Record<string, unknown>): VectorStoreRecord {
    const metadata = (data.metadata ?? {}) as Record<string, unknown>
    return {
      id,
      content: String(data.data ?? ''),
      userId: typeof data.user_id === 'string' ? data.user_id : undefined,
      agentId: typeof data.agent_id === 'string' ? data.agent_id : undefined,
      runId: typeof data.run_id === 'string' ? data.run_id : undefined,
      actorId: typeof data.actor_id === 'string' ? data.actor_id : undefined,
      hash: typeof data.hash === 'string' ? data.hash : undefined,
      createdAt: typeof data.created_at === 'string' ? data.created_at : undefined,
      updatedAt: typeof data.updated_at === 'string' ? data.updated_at : undefined,
      category: typeof data.category === 'string' ? data.category : undefined,
      metadata,
      accessCount:
        typeof metadata.access_count === 'number' ? metadata.access_count : undefined,
      embedding,
    }
  }
}

test.afterEach(async () => {
  await closeManagedMemoryRuntimesForTests()
})

test('seekdb migration resumes from partially copied sqlite data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-runtime-migration-'))
  const dataRoot = path.join(root, 'clawmaster-data')
  const sqliteContext = {
    dataRootOverride: dataRoot,
    engineOverride: 'powermem-sqlite' as const,
  }
  const seekdbContext = {
    dataRootOverride: dataRoot,
    engineOverride: 'powermem-seekdb' as const,
  }

  try {
    const alpha = await addManagedMemory(
      {
        content: 'Alice prefers espresso after lunch.',
        agentId: 'main',
      },
      sqliteContext,
    )
    const beta = await addManagedMemory(
      {
        content: 'Bob prefers tea in the morning.',
        agentId: 'main',
      },
      sqliteContext,
    )

    await closeManagedMemoryRuntimesForTests()

    const runtimeRoot = path.join(dataRoot, 'memory', 'powermem')
    const sqliteStore = new SQLiteStore(path.join(runtimeRoot, 'powermem.sqlite'))
    const seedPage = await sqliteStore.list({}, 10, 0, {
      sortBy: 'created_at',
      order: 'asc',
    })
    await sqliteStore.close()

    assert.equal(seedPage.total, 2)
    const firstRecord = seedPage.records.find((item) => item.id === alpha.id)
    assert.ok(firstRecord, 'expected sqlite seed record')

    const fakeSeekdbStore = new FakeVectorStore([firstRecord])
    await migrateLegacySqliteIfNeededForTest(seekdbContext, fakeSeekdbStore)

    const records = fakeSeekdbStore.snapshot()
    assert.equal(records.length, 2)
    assert.ok(records.some((item) => item.id === alpha.id))
    assert.ok(records.some((item) => item.id === beta.id))

    const markerPath = path.join(runtimeRoot, 'powermem-seekdb-migration.json')
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as {
      insertedCount?: number
      updatedCount?: number
      existingCountAtStart?: number
    }
    assert.equal(marker.existingCountAtStart, 1)
    assert.equal(marker.updatedCount, 1)
    assert.equal(marker.insertedCount, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
