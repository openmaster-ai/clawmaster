import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { closeManagedMemoryRuntimesForTests, listManagedMemories } from './managedMemory.js'
import {
  getManagedMemoryImportStatus,
  importOpenclawWorkspaceMemories,
} from './managedMemoryImport.js'

function withHomeDir<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const previousHome = process.env['HOME']
  const previousUserProfile = process.env['USERPROFILE']
  const previousAppData = process.env['APPDATA']
  process.env['HOME'] = homeDir
  process.env['USERPROFILE'] = homeDir
  process.env['APPDATA'] = path.join(homeDir, 'AppData', 'Roaming')
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previousHome === undefined) {
        delete process.env['HOME']
      } else {
        process.env['HOME'] = previousHome
      }
      if (previousUserProfile === undefined) {
        delete process.env['USERPROFILE']
      } else {
        process.env['USERPROFILE'] = previousUserProfile
      }
      if (previousAppData === undefined) {
        delete process.env['APPDATA']
      } else {
        process.env['APPDATA'] = previousAppData
      }
    })
}

test.afterEach(async () => {
  await closeManagedMemoryRuntimesForTests()
})

test('importOpenclawWorkspaceMemories imports workspace markdown files idempotently', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-managed-memory-import-'))
  const workspaceDir = path.join(homeDir, '.openclaw', 'workspace')
  const memoryDir = path.join(workspaceDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })
  fs.writeFileSync(path.join(workspaceDir, 'MEMORY.md'), '# Overview\nUser prefers concise updates.\n', 'utf8')
  fs.writeFileSync(
    path.join(memoryDir, 'coffee.md'),
    '# Coffee preference\nAlice prefers espresso after lunch.\n',
    'utf8'
  )

  const context = {
    dataRootOverride: path.join(homeDir, '.clawmaster', 'data', 'default'),
    openclawDataRootOverride: path.join(homeDir, '.openclaw'),
    profileSelection: { kind: 'default' } as const,
    engineOverride: 'powermem-sqlite' as const,
  }

  await withHomeDir(homeDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.availableSourceCount, 2)
    assert.equal(first.importedMemoryCount, 2)
    assert.equal(first.lastRun?.imported, 2)
    assert.equal(first.lastRun?.skipped, 0)

    const listed = await listManagedMemories({ limit: 10 }, context)
    assert.equal(listed.total, 2)

    const second = await importOpenclawWorkspaceMemories(context)
    assert.equal(second.lastRun?.imported, 0)
    assert.equal(second.lastRun?.updated, 0)
    assert.equal(second.lastRun?.skipped, 2)

    const status = await getManagedMemoryImportStatus(context)
    assert.equal(status.trackedSources, 2)
    assert.equal(status.importedMemoryCount, 2)
  })
})

test('importOpenclawWorkspaceMemories updates changed source content without duplicating memories', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-managed-memory-import-update-'))
  const memoryDir = path.join(homeDir, '.openclaw', 'workspace', 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })
  const sourcePath = path.join(memoryDir, 'weekly.md')
  fs.writeFileSync(sourcePath, '# Weekly note\nShip the memory dashboard.\n', 'utf8')

  const context = {
    dataRootOverride: path.join(homeDir, '.clawmaster', 'data', 'default'),
    openclawDataRootOverride: path.join(homeDir, '.openclaw'),
    profileSelection: { kind: 'default' } as const,
    engineOverride: 'powermem-sqlite' as const,
  }

  await withHomeDir(homeDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.lastRun?.imported, 1)

    fs.writeFileSync(sourcePath, '# Weekly note\nShip the memory dashboard with import proof.\n', 'utf8')

    const second = await importOpenclawWorkspaceMemories(context)
    assert.equal(second.lastRun?.updated, 1)
    assert.equal(second.importedMemoryCount, 1)

    const listed = await listManagedMemories({ limit: 10 }, context)
    assert.equal(listed.total, 1)
    assert.match(listed.memories[0]!.content, /import proof/i)
  })
})

test('importOpenclawWorkspaceMemories removes stale imported memories when source files disappear', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-managed-memory-import-delete-'))
  const memoryDir = path.join(homeDir, '.openclaw', 'workspace', 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })
  const keepPath = path.join(memoryDir, 'keep.md')
  const dropPath = path.join(memoryDir, 'drop.md')
  fs.writeFileSync(keepPath, '# Keep\nKeep this imported memory.\n', 'utf8')
  fs.writeFileSync(dropPath, '# Drop\nDelete this imported memory on rerun.\n', 'utf8')

  const context = {
    dataRootOverride: path.join(homeDir, '.clawmaster', 'data', 'default'),
    openclawDataRootOverride: path.join(homeDir, '.openclaw'),
    profileSelection: { kind: 'default' } as const,
    engineOverride: 'powermem-sqlite' as const,
  }

  await withHomeDir(homeDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.importedMemoryCount, 2)

    fs.unlinkSync(dropPath)

    const second = await importOpenclawWorkspaceMemories(context)
    assert.equal(second.availableSourceCount, 1)
    assert.equal(second.trackedSources, 1)
    assert.equal(second.importedMemoryCount, 1)

    const listed = await listManagedMemories({ limit: 10 }, context)
    assert.equal(listed.total, 1)
    assert.match(listed.memories[0]!.content, /keep this imported memory/i)
  })
})
