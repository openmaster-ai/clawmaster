import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  closeManagedMemoryRuntimesForTests,
  searchManagedMemories,
} from './runtime.js'
import {
  importOpenclawWorkspaceMemories,
  resolveOpenclawWorkspaceDir,
} from './workspaceImport.js'

test.afterEach(async () => {
  await closeManagedMemoryRuntimesForTests()
})

function withOpenclawStateDir<T>(stateDir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env['OPENCLAW_STATE_DIR']
  process.env['OPENCLAW_STATE_DIR'] = stateDir
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete process.env['OPENCLAW_STATE_DIR']
      } else {
        process.env['OPENCLAW_STATE_DIR'] = previous
      }
    })
}

test('importOpenclawWorkspaceMemories refreshes managed memory from workspace markdown files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-import-'))
  const stateDir = path.join(root, 'openclaw-state')
  const workspaceDir = path.join(stateDir, 'workspace')
  const memoryDir = path.join(workspaceDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })
  fs.writeFileSync(path.join(workspaceDir, 'MEMORY.md'), '# Overview\nRemember the release checklist.\n', 'utf8')
  const coffeePath = path.join(memoryDir, 'coffee.md')
  fs.writeFileSync(coffeePath, '# Coffee\nAlice prefers espresso after lunch.\n', 'utf8')

  const context = {
    dataRootOverride: path.join(root, 'clawmaster-data'),
    engineOverride: 'powermem-sqlite' as const,
  }

  await withOpenclawStateDir(stateDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.availableSourceCount, 2)
    assert.equal(first.importedMemoryCount, 2)
    assert.equal(first.lastRun?.imported, 2)

    let hits = await searchManagedMemories('espresso lunch', { limit: 5 }, context)
    assert.ok(hits.some((item) => /espresso after lunch/i.test(item.content)))

    fs.writeFileSync(coffeePath, '# Coffee\nAlice switched to pour-over before lunch.\n', 'utf8')
    const second = await importOpenclawWorkspaceMemories(context)
    assert.equal(second.lastRun?.updated, 1)

    hits = await searchManagedMemories('pour-over', { limit: 5 }, context)
    assert.ok(hits.some((item) => /pour-over before lunch/i.test(item.content)))

    fs.unlinkSync(coffeePath)
    const third = await importOpenclawWorkspaceMemories(context)
    assert.equal(third.availableSourceCount, 1)
    assert.equal(third.importedMemoryCount, 1)

    hits = await searchManagedMemories('pour-over', { limit: 5 }, context)
    assert.ok(!hits.some((item) => /pour-over before lunch/i.test(item.content)))
  })
})

test('importOpenclawWorkspaceMemories marks identical workspace files as duplicates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-duplicate-'))
  const stateDir = path.join(root, 'openclaw-state')
  const workspaceDir = path.join(stateDir, 'workspace')
  const memoryDir = path.join(workspaceDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })

  const duplicated = '# Shared preference\nAlice prefers espresso after lunch.\n'
  fs.writeFileSync(path.join(memoryDir, 'coffee-a.md'), duplicated, 'utf8')
  fs.writeFileSync(path.join(memoryDir, 'coffee-b.md'), duplicated, 'utf8')

  const context = {
    dataRootOverride: path.join(root, 'clawmaster-data'),
    engineOverride: 'powermem-sqlite' as const,
  }

  await withOpenclawStateDir(stateDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.availableSourceCount, 2)
    assert.equal(first.importedMemoryCount, 1)
    assert.equal(first.lastRun?.imported, 1)
    assert.equal(first.lastRun?.duplicate, 1)

    const hits = await searchManagedMemories('espresso lunch', { limit: 10 }, context)
    const matchingHits = hits.filter((item) => /espresso after lunch/i.test(item.content))
    assert.equal(matchingHits.length, 1)
  })
})

test('importOpenclawWorkspaceMemories preserves a memory when the source file is renamed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-rename-'))
  const stateDir = path.join(root, 'openclaw-state')
  const workspaceDir = path.join(stateDir, 'workspace')
  const memoryDir = path.join(workspaceDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })

  const originalPath = path.join(memoryDir, 'coffee.md')
  const renamedPath = path.join(memoryDir, 'coffee-renamed.md')
  fs.writeFileSync(originalPath, '# Coffee\nAlice prefers espresso after lunch.\n', 'utf8')

  const context = {
    dataRootOverride: path.join(root, 'clawmaster-data'),
    engineOverride: 'powermem-sqlite' as const,
  }

  await withOpenclawStateDir(stateDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.importedMemoryCount, 1)

    fs.renameSync(originalPath, renamedPath)
    const second = await importOpenclawWorkspaceMemories(context)
    assert.equal(second.availableSourceCount, 1)
    assert.equal(second.importedMemoryCount, 1)
    assert.equal(second.lastRun?.imported, 1)

    const hits = await searchManagedMemories('espresso lunch', { limit: 10 }, context)
    const matchingHits = hits.filter((item) => /espresso after lunch/i.test(item.content))
    assert.equal(matchingHits.length, 1)
  })
})

test('importOpenclawWorkspaceMemories removes stale content when a tracked source becomes a duplicate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-duplicate-transition-'))
  const stateDir = path.join(root, 'openclaw-state')
  const workspaceDir = path.join(stateDir, 'workspace')
  const memoryDir = path.join(workspaceDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })

  const alphaPath = path.join(memoryDir, 'alpha.md')
  const betaPath = path.join(memoryDir, 'beta.md')
  fs.writeFileSync(alphaPath, '# Alpha\nAlice prefers espresso after lunch.\n', 'utf8')
  fs.writeFileSync(betaPath, '# Beta\nBob prefers tea in the morning.\n', 'utf8')

  const context = {
    dataRootOverride: path.join(root, 'clawmaster-data'),
    engineOverride: 'powermem-sqlite' as const,
  }

  await withOpenclawStateDir(stateDir, async () => {
    const first = await importOpenclawWorkspaceMemories(context)
    assert.equal(first.importedMemoryCount, 2)

    fs.writeFileSync(betaPath, '# Alpha\nAlice prefers espresso after lunch.\n', 'utf8')
    const second = await importOpenclawWorkspaceMemories(context)
    assert.equal(second.importedMemoryCount, 1)
    assert.equal(second.lastRun?.duplicate, 1)

    const hits = await searchManagedMemories('tea morning', { limit: 10 }, context)
    assert.ok(!hits.some((item) => /Bob prefers tea in the morning/i.test(item.content)))

    const espressoHits = await searchManagedMemories('espresso lunch', { limit: 10 }, context)
    const matchingHits = espressoHits.filter((item) => /espresso after lunch/i.test(item.content))
    assert.equal(matchingHits.length, 1)
  })
})

test('resolveOpenclawWorkspaceDir derives the named profile workspace from the managed data root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-profile-'))
  const workspaceDir = resolveOpenclawWorkspaceDir({
    dataRootOverride: path.join(root, '.clawmaster', 'data', 'named', 'team-a'),
    engineOverride: 'powermem-sqlite',
  })

  assert.equal(workspaceDir, path.join(root, '.openclaw-team-a', 'workspace'))
})

test('resolveOpenclawWorkspaceDir prefers WSL HOME when the managed data root is a mounted Windows path', () => {
  const previousHome = process.env['HOME']
  delete process.env['OPENCLAW_STATE_DIR']
  process.env['HOME'] = '/home/wsluser'

  try {
    const workspaceDir = resolveOpenclawWorkspaceDir({
      dataRootOverride: '/mnt/c/Users/alice/.clawmaster/data/named/team-a',
      engineOverride: 'powermem-sqlite',
    })

    assert.equal(workspaceDir, '/home/wsluser/.openclaw-team-a/workspace')
  } finally {
    if (previousHome === undefined) {
      delete process.env['HOME']
    } else {
      process.env['HOME'] = previousHome
    }
  }
})

test('importOpenclawWorkspaceMemories reads named-profile workspace files from dataRootOverride without OPENCLAW_STATE_DIR', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-import-named-'))
  const previousStateDir = process.env['OPENCLAW_STATE_DIR']
  delete process.env['OPENCLAW_STATE_DIR']

  try {
    const workspaceDir = path.join(root, '.openclaw-team-a', 'workspace')
    const memoryDir = path.join(workspaceDir, 'memory')
    fs.mkdirSync(memoryDir, { recursive: true })
    fs.writeFileSync(path.join(memoryDir, 'coffee.md'), '# Coffee\nAlice prefers espresso after lunch.\n', 'utf8')

    const context = {
      dataRootOverride: path.join(root, '.clawmaster', 'data', 'named', 'team-a'),
      engineOverride: 'powermem-sqlite' as const,
    }

    const imported = await importOpenclawWorkspaceMemories(context)
    assert.equal(imported.availableSourceCount, 1)
    assert.equal(imported.importedMemoryCount, 1)

    const hits = await searchManagedMemories('espresso lunch', { limit: 5 }, context)
    assert.ok(hits.some((item) => /espresso after lunch/i.test(item.content)))
  } finally {
    if (previousStateDir === undefined) {
      delete process.env['OPENCLAW_STATE_DIR']
    } else {
      process.env['OPENCLAW_STATE_DIR'] = previousStateDir
    }
  }
})

test('importOpenclawWorkspaceMemories preserves per-agent workspace scope from memory status entries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-plugin-workspace-agents-'))
  const dataRoot = path.join(root, '.clawmaster', 'data', 'default')
  const mainWorkspaceDir = path.join(root, '.openclaw', 'workspace')
  const writerWorkspaceDir = path.join(root, '.openclaw-agents', 'writer', 'workspace')
  fs.mkdirSync(path.join(mainWorkspaceDir, 'memory'), { recursive: true })
  fs.mkdirSync(path.join(writerWorkspaceDir, 'memory'), { recursive: true })
  fs.writeFileSync(path.join(mainWorkspaceDir, 'memory', 'release.md'), '# Release\nRemember the release checklist.\n', 'utf8')
  fs.writeFileSync(path.join(writerWorkspaceDir, 'memory', 'drafts.md'), '# Drafts\nWriter agent owns the draft outlines.\n', 'utf8')

  const previousStatus = process.env['OPENCLAW_MEMORY_STATUS_JSON']
  process.env['OPENCLAW_MEMORY_STATUS_JSON'] = JSON.stringify([
    {
      agentId: 'main',
      status: {
        workspaceDir: mainWorkspaceDir,
      },
    },
    {
      agentId: 'writer',
      status: {
        workspaceDir: writerWorkspaceDir,
      },
    },
  ])

  try {
    const context = {
      dataRootOverride: dataRoot,
      engineOverride: 'powermem-sqlite' as const,
    }

    const imported = await importOpenclawWorkspaceMemories(context)
    assert.equal(imported.availableSourceCount, 2)
    assert.equal(imported.importedMemoryCount, 2)

    const mainHits = await searchManagedMemories('release checklist', { limit: 5, agentId: 'main' }, context)
    assert.ok(mainHits.some((item) => /release checklist/i.test(item.content)))

    const writerHits = await searchManagedMemories('draft outlines', { limit: 5, agentId: 'writer' }, context)
    assert.ok(writerHits.some((item) => /draft outlines/i.test(item.content)))

    const crossAgentHits = await searchManagedMemories('draft outlines', { limit: 5, agentId: 'main' }, context)
    assert.ok(!crossAgentHits.some((item) => /draft outlines/i.test(item.content)))
  } finally {
    if (previousStatus === undefined) {
      delete process.env['OPENCLAW_MEMORY_STATUS_JSON']
    } else {
      process.env['OPENCLAW_MEMORY_STATUS_JSON'] = previousStatus
    }
  }
})
