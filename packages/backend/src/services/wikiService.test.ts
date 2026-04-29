import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { closeManagedMemoryRuntimesForTests } from './managedMemory.js'
import {
  assistWithWiki,
  classifyWikiQuestion,
  ensureWikiVault,
  evolveWiki,
  getWikiPage,
  getWikiStatus,
  ingestWikiSource,
  listWikiPages,
  lintWiki,
  planWikiLinkChoice,
  queryWiki,
  resolveWikiPaths,
  searchWiki,
  synthesizeWiki,
  type WikiServiceContext,
} from './wikiService.js'

async function createContext(name: string): Promise<WikiServiceContext> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `clawmaster-wiki-${name}-`))
  return {
    vaultRootOverride: path.join(tempRoot, 'wiki'),
    managedMemoryContext: {
      dataRootOverride: path.join(tempRoot, 'data'),
      profileSelection: { kind: 'default' },
      engineOverride: 'powermem-sqlite',
    },
  }
}

test.afterEach(async () => {
  await closeManagedMemoryRuntimesForTests()
})

test('ensureWikiVault creates the expected wiki structure', async () => {
  const context = await createContext('vault')
  const paths = await ensureWikiVault(context)

  await assert.doesNotReject(fs.stat(paths.rawRoot))
  await assert.doesNotReject(fs.stat(path.join(paths.pagesRoot, 'sources')))
  await assert.doesNotReject(fs.stat(path.join(paths.pagesRoot, 'entities')))
  await assert.doesNotReject(fs.stat(paths.indexPath))
  await assert.doesNotReject(fs.stat(paths.schemaPath))
  await assert.doesNotReject(fs.stat(paths.freshnessPath))
})

test('ingest creates a managed memory-backed markdown page and repeat ingest skips unchanged source', async () => {
  const context = await createContext('ingest')
  const first = await ingestWikiSource(
    {
      title: 'PowerMem Bridge',
      content: 'PowerMem is the managed runtime root. [[SeekDB Runtime]] is preferred when supported.',
      sourcePath: '/notes/powermem.md',
    },
    context,
  )

  assert.equal(first.state, 'ingested')
  assert.equal(first.pagesCreated, 1)
  assert.ok(first.memoryId)
  assert.ok(first.page?.id)

  const page = await getWikiPage(first.page!.id, context)
  assert.equal(page.title, 'PowerMem Bridge')
  assert.match(page.content, /managed runtime root/i)
  assert.equal(page.memoryIds[0], first.memoryId)
  assert.equal(page.sourceCount, 1)

  const repeat = await ingestWikiSource(
    {
      title: 'PowerMem Bridge',
      content: 'PowerMem is the managed runtime root. [[SeekDB Runtime]] is preferred when supported.',
      sourcePath: '/notes/powermem.md',
    },
    context,
  )
  assert.equal(repeat.state, 'skipped')
  assert.equal(repeat.pagesCreated, 0)

  const status = await getWikiStatus(context)
  assert.equal(status.pageCount, 1)
  assert.equal(status.sourceCount, 1)
})

test('repeat ingest with a changed title updates the existing source page', async () => {
  const context = await createContext('rename')
  const first = await ingestWikiSource(
    {
      title: 'Original Source Title',
      content: 'The source records reusable agent runtime context.',
      sourcePath: '/notes/same-source.md',
    },
    context,
  )
  assert.ok(first.page)

  const updated = await ingestWikiSource(
    {
      title: 'Renamed Source Title',
      content: 'The source records reusable agent runtime context with a new title.',
      sourcePath: '/notes/same-source.md',
    },
    context,
  )

  assert.equal(updated.state, 'updated')
  assert.equal(updated.pagesCreated, 0)
  assert.equal(updated.pagesUpdated, 1)
  assert.equal(updated.page?.id, first.page.id)

  const initialDetail = await getWikiPage(first.page.id, context)
  await fs.writeFile(
    initialDetail.path,
    (await fs.readFile(initialDetail.path, 'utf8')).replace(/createdAt: .+/, 'createdAt: "2000-01-01T00:00:00.000Z"'),
    'utf8',
  )
  const secondUpdate = await ingestWikiSource(
    {
      title: 'Retitled Source Title',
      content: 'The source records reusable agent runtime context with a second new title.',
      sourcePath: '/notes/same-source.md',
    },
    context,
  )
  assert.equal(secondUpdate.state, 'updated')

  const pages = await listWikiPages(context)
  assert.equal(pages.length, 1)
  assert.equal(pages[0]!.id, first.page.id)
  assert.equal(pages[0]!.title, 'Retitled Source Title')

  const detail = await getWikiPage(first.page.id, context)
  assert.equal(detail.title, 'Retitled Source Title')
  assert.equal(detail.createdAt, '2000-01-01T00:00:00.000Z')
  assert.match(detail.content, /second new title/)
})

test('search and query combine wiki articles with managed PowerMem results', async () => {
  const context = await createContext('search')
  await ingestWikiSource(
    {
      title: 'SeekDB Runtime',
      content: 'SeekDB provides semantic retrieval for durable wiki knowledge.',
      sourcePath: '/notes/seekdb.md',
    },
    context,
  )

  const hits = await searchWiki('semantic retrieval', { limit: 5 }, context)
  assert.ok(hits.some((hit) => hit.title === 'SeekDB Runtime'))
  assert.ok(hits.some((hit) => hit.matchType === 'keyword' || hit.matchType === 'semantic'))

  const answer = await queryWiki('what do we know about semantic retrieval?', { limit: 5 }, context)
  assert.equal(answer.usedWiki, true)
  assert.match(answer.answer, /\[\[SeekDB Runtime\]\]/)
  assert.equal(answer.offerToSave, true)
})

test('assist classifies ordinary questions before using wiki context', async () => {
  const context = await createContext('assist')
  await ingestWikiSource(
    {
      title: 'Agent Decisions',
      content: 'The team decided that AI agent answers should cite durable wiki pages when using prior research.',
      sourcePath: '/notes/agent-decisions.md',
    },
    context,
  )

  assert.deepEqual(classifyWikiQuestion('what is 2 + 2?'), { useWiki: false, reason: 'not_relevant' })
  assert.equal(classifyWikiQuestion('what do we know about AI agent decisions?').useWiki, true)

  const ignored = await assistWithWiki('what is 2 + 2?', { limit: 5 }, context)
  assert.equal(ignored.usedWiki, false)
  assert.equal(ignored.reason, 'not_relevant')
  assert.equal(ignored.results.length, 0)

  const assisted = await assistWithWiki('what do we know about AI agent decisions?', { limit: 5 }, context)
  assert.equal(assisted.usedWiki, true)
  assert.equal(assisted.reason, 'explicit_wiki')
  assert.ok(assisted.results.some((hit) => hit.title === 'Agent Decisions'))
})

test('link choice planning requires explicit action before URL ingestion', () => {
  const choice = planWikiLinkChoice('Please use https://blog.langchain.com/building-langgraph/ for this.')
  assert.equal(choice.requiresChoice, true)
  assert.deepEqual(choice.urls, ['https://blog.langchain.com/building-langgraph/'])
  assert.deepEqual(choice.actions.map((action) => action.id), [
    'ingest',
    'summarize_once',
    'current_conversation_only',
  ])
  assert.equal(choice.defaultAction, 'current_conversation_only')
})

test('synthesize creates a generated citation-backed wiki page from matching sources', async () => {
  const context = await createContext('synthesis')
  await ingestWikiSource(
    {
      title: 'Agent Patterns',
      content: 'AI agents use tools, memory, and feedback loops to complete open-ended tasks. Workflows are better when paths are predefined.',
      sourceUrl: 'https://example.com/agent-patterns',
      confirmUrlIngest: true,
    },
    context,
  )
  await ingestWikiSource(
    {
      title: 'Agent Runtime',
      content: 'Reliable AI agents need clear tool contracts, environmental feedback, and checkpoints for human review.',
      sourceUrl: 'https://example.com/agent-runtime',
      confirmUrlIngest: true,
    },
    context,
  )

  const synthesized = await synthesizeWiki(
    { query: 'what do we know about AI agents?', limit: 5 },
    context,
  )

  assert.equal(synthesized.title, 'AI Agents')
  assert.equal(synthesized.pagesCreated, 1)
  assert.equal(synthesized.sourcePageIds.length, 2)
  assert.equal(synthesized.citations.length, 2)
  assert.ok(synthesized.memoryId)

  const page = await getWikiPage(synthesized.page.id, context)
  assert.equal(page.type, 'synthesis')
  assert.match(page.content, /Generated Synthesis/)
  assert.match(page.content, /\[\[Agent Patterns\]\]/)
  assert.match(page.content, /\[\[Agent Runtime\]\]/)
  assert.deepEqual(page.backlinks, [])
  assert.deepEqual(
    page.citations
      .map((citation) => [citation.title, citation.sourceUrl])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ['Agent Patterns', 'https://example.com/agent-patterns'],
      ['Agent Runtime', 'https://example.com/agent-runtime'],
    ],
  )

  const source = await getWikiPage('sources-agent-patterns', context)
  assert.ok(source.backlinks.includes(synthesized.page.id))

  const regenerated = await synthesizeWiki(
    { query: 'what do we know about AI agents?', limit: 5 },
    context,
  )
  assert.equal(regenerated.pagesUpdated, 1)
  assert.ok(!regenerated.sourcePageIds.includes(synthesized.page.id))
  const regeneratedPage = await getWikiPage(regenerated.page.id, context)
  assert.doesNotMatch(regeneratedPage.content, /\[\[AI Agents\]\]/)
})

test('url ingest requires explicit confirmation', async () => {
  const context = await createContext('url')
  const pending = await ingestWikiSource(
    {
      title: 'Example Source',
      sourceUrl: 'https://example.com/source',
    },
    context,
  )

  assert.equal(pending.state, 'needs_confirmation')
  assert.equal(pending.confirmationRequired, true)

  const confirmed = await ingestWikiSource(
    {
      title: 'Example Source',
      sourceUrl: 'https://example.com/source',
      content: 'Fetched example source body.',
      confirmUrlIngest: true,
    },
    context,
  )
  assert.equal(confirmed.state, 'ingested')

  const contentOnlyUrl = await ingestWikiSource(
    {
      content: 'https://example.com/other-source',
    },
    context,
  )
  assert.equal(contentOnlyUrl.state, 'needs_confirmation')
})

test('write contexts automatically evolve wiki metadata after ingest and synthesis', async () => {
  const context = await createContext('auto-evolve')
  const writeContext = { ...context, autoEvolveOnWrite: true }
  const created = await ingestWikiSource(
    {
      title: 'Auto Evolution Source',
      content: 'Auto evolution keeps wiki health and related-page metadata current for agent evaluation notes.',
      sourcePath: '/notes/auto-evolution.md',
    },
    writeContext,
  )

  assert.equal(created.state, 'ingested')
  assert.ok(created.evolve)
  assert.ok(created.evolve.changedPageIds.includes(created.page!.id))
  const createdPage = await getWikiPage(created.page!.id, context)
  assert.equal(createdPage.lifecycleState, 'evolved')
  assert.equal(createdPage.evolveCheckedAt, created.evolve.evolvedAt)
  assert.match(createdPage.frontmatter.evolveChangeSummary, /Evolution evidence initialized/)

  const synthesized = await synthesizeWiki(
    { query: 'what do we know about auto evolution?', limit: 3 },
    writeContext,
  )

  assert.ok(synthesized.evolve)
  assert.ok(synthesized.evolve.changedPageIds.includes(synthesized.page.id))
  const synthesisPage = await getWikiPage(synthesized.page.id, context)
  assert.equal(synthesisPage.evolveCheckedAt, synthesized.evolve.evolvedAt)
})

test('lint flags orphan and missing linked pages, evolve records freshness', async () => {
  const context = await createContext('lint')
  const created = await ingestWikiSource(
    {
      title: 'Isolated Page',
      content: 'This article references [[Missing Concept]] and has no backlinks.',
      sourcePath: '/notes/isolated.md',
    },
    context,
  )
  assert.ok(created.page)
  const current = await ingestWikiSource(
    {
      title: 'Standalone Page',
      content: 'This article has no links.',
      sourcePath: '/notes/standalone.md',
    },
    context,
  )

  const lint = await lintWiki(context)
  assert.ok(lint.issues.some((issue) => issue.kind === 'missing-link'))
  assert.ok(lint.issues.some((issue) => issue.kind === 'orphan'))
  const paths = resolveWikiPaths(context)
  const lintConflicts = JSON.parse(await fs.readFile(paths.conflictsPath, 'utf8')) as Array<{ kind: string }>
  assert.ok(lintConflicts.some((issue) => issue.kind === 'missing-link'))
  assert.ok(!lintConflicts.some((issue) => issue.kind === 'orphan'))
  assert.equal((await getWikiStatus(context)).conflictCount, 1)

  const detailBeforeEvolve = await getWikiPage(created.page!.id, context)
  const rawBeforeEvolve = await fs.readFile(detailBeforeEvolve.path, 'utf8')
  await fs.writeFile(
    detailBeforeEvolve.path,
    rawBeforeEvolve
      .replace(/updatedAt: .+/, 'updatedAt: "2000-01-01T00:00:00.000Z"')
      .replace(/memoryId: .+/, 'memoryId: 704468483663986688'),
    'utf8',
  )

  const evolved = await evolveWiki(context)
  assert.equal(evolved.pageCount, 2)
  assert.equal(evolved.staleCount, 1)
  assert.equal(evolved.conflictCount, 2)
  assert.deepEqual(evolved.related[created.page!.id], [])
  assert.ok(evolved.changedPageIds.includes(created.page!.id))
  assert.ok(evolved.freshness[created.page!.id])
  assert.equal(evolved.freshness[current.page!.id].status, 'fresh')

  const evolvedPage = await getWikiPage(created.page!.id, context)
  assert.equal(evolvedPage.freshnessStatus, 'stale')
  assert.equal(evolvedPage.frontmatter.evolveChangedAt, evolved.evolvedAt)
  assert.match(evolvedPage.frontmatter.evolveChangeSummary, /Freshness changed from fresh to stale/)
  assert.equal(evolvedPage.evolveCheckedAt, evolved.evolvedAt)
  assert.equal(evolvedPage.frontmatter.memoryId, '704468483663986688')

  const conflicts = JSON.parse(await fs.readFile(paths.conflictsPath, 'utf8')) as Array<{ kind: string }>
  assert.ok(conflicts.some((issue) => issue.kind === 'missing-link'))
  assert.ok(conflicts.some((issue) => issue.kind === 'stale'))
  const related = JSON.parse(await fs.readFile(path.join(paths.metaRoot, 'related.json'), 'utf8')) as Record<string, string[]>
  assert.deepEqual(related[created.page!.id], [])
})

test('updated pages with evolve evidence keep the evolved lifecycle state', async () => {
  const context = await createContext('lifecycle')
  const created = await ingestWikiSource(
    {
      title: 'Updated Agent Page',
      content: 'This updated page has enough content to be useful later.',
      sourcePath: '/notes/updated-agent.md',
    },
    context,
  )
  assert.ok(created.page)

  const detail = await getWikiPage(created.page!.id, context)
  const raw = await fs.readFile(detail.path, 'utf8')
  await fs.writeFile(
    detail.path,
    raw
      .replace(/createdAt: .+/, 'createdAt: "2026-01-01T00:00:00.000Z"')
      .replace(/updatedAt: .+/, 'updatedAt: "2026-01-02T00:00:00.000Z"')
      .replace(/freshnessScore: .+/, 'freshnessScore: 1')
      .replace(/freshnessStatus: .+/, 'freshnessStatus: "fresh"')
      .replace(/\n---\n/, '\nevolveChangedAt: "2026-01-03T00:00:00.000Z"\nevolveChangeSummary: "Related pages updated."\n---\n'),
    'utf8',
  )

  const evolved = await getWikiPage(created.page!.id, context)
  assert.equal(evolved.lifecycleState, 'evolved')
})
