import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildAutoRecallContextForTest,
  buildWikiSourceMarkdownForTest,
  buildWikiLinkChoiceReplyForTest,
  defaultManagedEngineForTest,
  ensureMemoryIndexCompatibilityCommandForTest,
  extractStandaloneHttpUrlForTest,
  findWikiUrlMemoryHitsForTest,
  parseWikiLinkChoiceForTest,
  resolveWikiPageIdForUrlForTest,
  resolveWikiVaultRootForTest,
  writeWikiMetaFilesForTest,
} from './index.js'
import { addManagedMemory, closeManagedMemoryRuntimesForTests, type ManagedMemorySearchHit } from './runtime.js'

class FakeCommand {
  commands: FakeCommand[] = []
  constructor(private readonly commandName: string) {}

  name(): string {
    return this.commandName
  }

  command(name: string): FakeCommand {
    const child = new FakeCommand(name)
    this.commands.push(child)
    return child
  }

  description(_text: string): FakeCommand {
    return this
  }

  option(_flags: string, _description: string, _defaultValue?: string): FakeCommand {
    return this
  }

  action(_handler: (...args: unknown[]) => unknown): FakeCommand {
    return this
  }
}

test('defaultManagedEngineForTest only enables seekdb on supported Linux architectures', () => {
  assert.equal(defaultManagedEngineForTest('linux', 'x64'), 'powermem-seekdb')
  assert.equal(defaultManagedEngineForTest('linux', 'arm64'), 'powermem-seekdb')
  assert.equal(defaultManagedEngineForTest('linux', 'ia32'), 'powermem-sqlite')
  assert.equal(defaultManagedEngineForTest('linux', 'riscv64'), 'powermem-sqlite')
  assert.equal(defaultManagedEngineForTest('darwin', 'arm64'), 'powermem-sqlite')
  assert.equal(defaultManagedEngineForTest('win32', 'x64'), 'powermem-sqlite')
})

test('ensureMemoryIndexCompatibilityCommandForTest adds memory index to an existing top-level memory command', () => {
  const program = new FakeCommand('root')
  const memory = program.command('memory').description('native memory')
  memory.command('status').description('native status')

  ensureMemoryIndexCompatibilityCommandForTest(program, () => undefined)

  assert.deepEqual(
    memory.commands.map((command) => command.name()),
    ['status', 'index'],
  )
})

test('buildAutoRecallContextForTest injects wiki context only for wiki-relevant questions', () => {
  const wikiHit: ManagedMemorySearchHit = {
    memoryId: 'mem-wiki',
    content: 'AI agents need clear tools, feedback loops, and durable source citations.',
    score: 0.88,
    metadata: {
      scope: 'wiki',
      sourceType: 'synthesis',
      pageId: 'synthesis-ai-agents',
      freshnessStatus: 'aging',
      provenance: {
        sourceUrl: 'https://example.com/agents',
      },
    },
  }
  const plainHit: ManagedMemorySearchHit = {
    memoryId: 'mem-plain',
    content: 'User prefers concise status updates.',
    score: 0.91,
    metadata: {
      source: 'manual',
    },
  }

  const relevant = buildAutoRecallContextForTest('what do we know about AI agents?', [wikiHit, plainHit], 5)
  assert.equal(relevant.wikiCount, 1)
  assert.equal(relevant.memoryCount, 1)
  assert.match(relevant.prependContext ?? '', /<relevant-wiki>/)
  assert.match(relevant.prependContext ?? '', /Wiki signal: 1 page\(s\), 1 source\(s\), freshness aging/)
  assert.match(relevant.prependContext ?? '', /Local OpenClaw Wiki is the first-choice source/)
  assert.match(relevant.prependContext ?? '', /Wiki used: 2 pages, freshness aging/)
  assert.match(relevant.prependContext ?? '', /Wiki health signals/)
  assert.match(relevant.prependContext ?? '', /save\/update a Wiki synthesis/)
  assert.match(relevant.prependContext ?? '', /\[synthesis-ai-agents\]/)
  assert.match(relevant.prependContext ?? '', /freshness aging/)
  assert.match(relevant.prependContext ?? '', /https:\/\/example\.com\/agents/)
  assert.match(relevant.prependContext ?? '', /<relevant-memories>/)

  const ordinary = buildAutoRecallContextForTest('what is 2 plus 2?', [wikiHit, plainHit], 5)
  assert.equal(ordinary.wikiCount, 0)
  assert.equal(ordinary.memoryCount, 1)
  assert.doesNotMatch(ordinary.prependContext ?? '', /<relevant-wiki>/)
})

test('extractStandaloneHttpUrlForTest only accepts standalone HTTP links', () => {
  assert.equal(
    extractStandaloneHttpUrlForTest('https://blog.langchain.com/building-langgraph/'),
    'https://blog.langchain.com/building-langgraph/',
  )
  assert.equal(
    extractStandaloneHttpUrlForTest('<https://example.com/article?x=1>'),
    'https://example.com/article?x=1',
  )
  assert.equal(extractStandaloneHttpUrlForTest('summarize https://example.com'), undefined)
  assert.equal(extractStandaloneHttpUrlForTest('file:///tmp/test.md'), undefined)
  assert.equal(extractStandaloneHttpUrlForTest('not a link'), undefined)
})

test('buildWikiLinkChoiceReplyForTest asks for explicit link handling choice', () => {
  const reply = buildWikiLinkChoiceReplyForTest('https://blog.langchain.com/building-langgraph/')
  assert.match(reply, /Ingest into Wiki/)
  assert.match(reply, /Summarize once/)
  assert.match(reply, /Use only in this conversation/)
  assert.match(reply, /Reply with 1, 2, or 3/)
})

test('parseWikiLinkChoiceForTest accepts numeric and named choices', () => {
  assert.equal(parseWikiLinkChoiceForTest('1'), 'ingest')
  assert.equal(parseWikiLinkChoiceForTest('ingest into wiki'), 'ingest')
  assert.equal(parseWikiLinkChoiceForTest('2'), 'summarize_once')
  assert.equal(parseWikiLinkChoiceForTest('summarize once'), 'summarize_once')
  assert.equal(parseWikiLinkChoiceForTest('3'), 'current_conversation_only')
  assert.equal(parseWikiLinkChoiceForTest('use only in this conversation'), 'current_conversation_only')
  assert.equal(parseWikiLinkChoiceForTest('please ingest it'), undefined)
})

test('buildWikiSourceMarkdownForTest writes source provenance and memory metadata', () => {
  const markdown = buildWikiSourceMarkdownForTest({
    pageId: 'sources-building-langgraph',
    title: 'Building LangGraph: Agents',
    sourceUrl: 'https://blog.langchain.com/building-langgraph/',
    content: 'LangGraph supports durable execution. It also supports streaming for production agents.',
    memoryId: 'mem-123',
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  })

  assert.match(markdown, /id: "sources-building-langgraph"/)
  assert.match(markdown, /title: "Building LangGraph: Agents"/)
  assert.match(markdown, /sourceUrl: "https:\/\/blog\.langchain\.com\/building-langgraph\/"/)
  assert.match(markdown, /createdAt: "2000-01-01T00:00:00.000Z"/)
  assert.match(markdown, /updatedAt: "2026-04-29T00:00:00.000Z"/)
  assert.match(markdown, /memoryId: "mem-123"/)
  assert.match(markdown, /## Key Extract/)
  assert.match(markdown, /## Raw Text/)
})

test('resolveWikiPageIdForUrlForTest keeps an existing page id for repeat URL ingest', () => {
  assert.equal(
    resolveWikiPageIdForUrlForTest(
      'https://example.com/article',
      'New Article Title',
      [{
        memoryId: 'mem-existing',
        content: 'Existing article content',
        score: 0.9,
        metadata: {
          pageId: 'sources-old-article-title',
          provenance: {
            sourceUrl: 'https://example.com/article',
          },
        },
      }],
    ),
    'sources-old-article-title',
  )
})

test('findWikiUrlMemoryHitsForTest finds URL provenance outside indexed content', async () => {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'openclaw-wiki-url-lookup-'))
  const managedContext = {
    dataRootOverride: join(root, '.clawmaster', 'data', 'default'),
    engineOverride: 'powermem-sqlite' as const,
  }
  await addManagedMemory(
    {
      content: 'This article body intentionally omits the source address.',
      metadata: {
        scope: 'wiki',
        pageId: 'sources-old-title',
        provenance: {
          sourceUrl: 'https://example.com/article',
        },
      },
    },
    managedContext,
  )
  for (let index = 0; index < 120; index += 1) {
    await addManagedMemory(
      {
        content: `Filler memory ${index} with unrelated content.`,
        metadata: {
          source: 'test-filler',
        },
      },
      managedContext,
    )
  }

  const hits = await findWikiUrlMemoryHitsForTest({
    url: 'https://example.com/article',
    scope: {},
    managedContext,
  })

  assert.equal(hits[0]?.metadata.pageId, 'sources-old-title')
  await closeManagedMemoryRuntimesForTests()
})

test('resolveWikiVaultRootForTest follows the active managed profile data root', () => {
  const root = join(os.tmpdir(), 'openclaw-wiki-profile-root')

  assert.equal(
    resolveWikiVaultRootForTest({
      dataRootOverride: join(root, '.clawmaster', 'data', 'default'),
    }),
    join(root, '.openclaw', 'wiki'),
  )
  assert.equal(
    resolveWikiVaultRootForTest({
      dataRootOverride: join(root, '.clawmaster', 'data', 'dev'),
    }),
    join(root, '.openclaw-dev', 'wiki'),
  )
  assert.equal(
    resolveWikiVaultRootForTest({
      dataRootOverride: join(root, '.clawmaster', 'data', 'named', 'research'),
    }),
    join(root, '.openclaw-research', 'wiki'),
  )
})

test('writeWikiMetaFilesForTest preserves conflicts as an array', async () => {
  const vaultRoot = await fs.mkdtemp(join(os.tmpdir(), 'openclaw-wiki-meta-'))
  const metaRoot = join(vaultRoot, '.meta')
  await fs.mkdir(metaRoot, { recursive: true })
  await fs.writeFile(
    join(metaRoot, 'conflicts.json'),
    `${JSON.stringify([{ id: 'missing:source', kind: 'missing-link' }], null, 2)}\n`,
    'utf8',
  )

  await writeWikiMetaFilesForTest(vaultRoot, 'sources-example', '2026-04-29T00:00:00.000Z')

  const conflicts = JSON.parse(await fs.readFile(join(metaRoot, 'conflicts.json'), 'utf8')) as unknown
  assert.ok(Array.isArray(conflicts))
  assert.deepEqual(conflicts, [{ id: 'missing:source', kind: 'missing-link' }])
})
