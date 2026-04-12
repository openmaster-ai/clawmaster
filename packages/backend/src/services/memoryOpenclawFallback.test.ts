import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { searchWorkspaceMemoryFiles } from './memoryOpenclaw.js'

test('searchOpenclawMemoryFallback finds markdown matches from workspace memory files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-memory-fallback-'))
  const workspaceDir = path.join(root, 'workspace')
  const memoryDir = path.join(workspaceDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })
  fs.writeFileSync(
    path.join(memoryDir, 'deepwiki-note.md'),
    '# DeepWiki\nThe DeepWiki tool was used to inspect repository structure.\n',
    'utf8'
  )

  try {
    const hits = await searchWorkspaceMemoryFiles('deepwiki', [workspaceDir], 10)
    assert.equal(hits.length, 1)
    assert.match(hits[0]!.path ?? '', /deepwiki-note\.md$/)
    assert.match(hits[0]!.content, /DeepWiki tool/i)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
