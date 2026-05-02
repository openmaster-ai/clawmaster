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
  evolveWikiDeep,
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

const originalFetch = globalThis.fetch

async function createContext(name: string): Promise<WikiServiceContext> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `clawmaster-wiki-${name}-`))
  return {
    homeDir: tempRoot,
    vaultRootOverride: path.join(tempRoot, 'wiki'),
    managedMemoryContext: {
      dataRootOverride: path.join(tempRoot, 'data'),
      profileSelection: { kind: 'default' },
      engineOverride: 'powermem-sqlite',
    },
  }
}

async function writeWikiConfig(context: WikiServiceContext, config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(context.homeDir!, '.openclaw')
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(path.join(configDir, 'openclaw.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

test.afterEach(async () => {
  await closeManagedMemoryRuntimesForTests()
  globalThis.fetch = originalFetch
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

test('query uses the gateway-backed wiki llm when enabled', async () => {
  const context = await createContext('query-llm')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
    gateway: { port: 19191, auth: { mode: 'token', token: 'secret-wiki-token' } },
  })
  await ingestWikiSource(
    {
      title: 'Gateway Runtime',
      content: 'The gateway runtime keeps provider auth and model routing centralized.',
      sourcePath: '/notes/gateway-runtime.md',
    },
    context,
  )

  let requestedAuthorization = ''
  let requestedUrl = ''
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input)
    requestedAuthorization = String(new Headers(init?.headers).get('Authorization') ?? '')
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Gateway answer with [[Gateway Runtime]] citations.' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const result = await queryWiki('what do we know about gateway runtime?', { limit: 5 }, context)
  assert.equal(result.answer, 'Gateway answer with [[Gateway Runtime]] citations.')
  assert.deepEqual(result.warnings, [])
  assert.equal(requestedAuthorization, 'Bearer secret-wiki-token')
  assert.equal(requestedUrl, 'http://127.0.0.1:19191/v1/chat/completions')
})

test('llm ingest creates derived pages and removes outdated generated pages on re-ingest', async () => {
  const context = await createContext('derived-ingest')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  let callCount = 0
  globalThis.fetch = (async () => {
    callCount += 1
    const content = callCount === 1
      ? JSON.stringify({
          items: [
            {
              name: 'SeekDB Runtime',
              kind: 'entity',
              summary: 'SeekDB Runtime is the durable retrieval layer described by this source.',
              confidence: 0.94,
            },
          ],
        })
      : JSON.stringify({ items: [] })
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  const first = await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem relies on SeekDB Runtime for durable retrieval.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )
  assert.equal(first.pagesCreated, 2)
  const derivedPage = await getWikiPage('entities-seekdb-runtime', context)
  assert.equal(derivedPage.type, 'entity')
  assert.equal(derivedPage.frontmatter.generatedFromSourceIds, first.page!.id)
  assert.match(derivedPage.content, /PowerMem Source/)

  const second = await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem no longer references a separate durable retrieval layer.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )
  assert.equal(second.state, 'updated')
  const pages = await listWikiPages(context)
  assert.ok(!pages.some((page) => page.id === 'entities-seekdb-runtime'))
})

test('re-ingest preserves generated derived pages when extraction is unavailable and cleans them after recovery', async () => {
  const context = await createContext('derived-ingest-disabled')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  let fetchMode: 'derived' | 'empty' = 'derived'
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: fetchMode === 'derived'
          ? JSON.stringify({
              items: [
                {
                  name: 'SeekDB Runtime',
                  kind: 'entity',
                  summary: 'SeekDB Runtime is the durable retrieval layer described by this source.',
                  confidence: 0.94,
                },
              ],
            })
          : JSON.stringify({ items: [] }),
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch

  await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem relies on SeekDB Runtime for durable retrieval.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )
  await writeWikiConfig(context, {})
  await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem still has updated source text while the gateway is unavailable.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )

  const preserved = await getWikiPage('entities-seekdb-runtime', context)
  assert.equal(preserved.type, 'entity')
  assert.match(preserved.content, /durable retrieval layer/)

  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  fetchMode = 'empty'
  await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem no longer references a separate durable retrieval layer.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )

  const pages = await listWikiPages(context)
  assert.ok(!pages.some((page) => page.id === 'entities-seekdb-runtime'))
})

test('re-ingest removes generated blocks without deleting an existing matched page', async () => {
  const context = await createContext('derived-existing-page')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  await ingestWikiSource(
    {
      title: 'SeekDB Runtime',
      pageType: 'entity',
      content: 'SeekDB Runtime already has manual notes that should survive source re-ingest cleanup.',
      sourcePath: '/notes/seekdb-runtime.md',
    },
    context,
  )

  let callCount = 0
  globalThis.fetch = (async () => {
    callCount += 1
    const content = callCount === 1
      ? JSON.stringify({
          items: [
            {
              name: 'SeekDB Runtime',
              kind: 'entity',
              summary: 'SeekDB Runtime is the durable retrieval layer described by this source.',
              confidence: 0.94,
            },
          ],
        })
      : JSON.stringify({ items: [] })
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem relies on SeekDB Runtime for durable retrieval.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )
  await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem no longer references a separate durable retrieval layer.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )

  const preserved = await getWikiPage('entities-seekdb-runtime', context)
  assert.match(preserved.content, /manual notes that should survive/)
  assert.doesNotMatch(preserved.content, /PowerMem Source/)
})

test('derived ingest does not reuse source pages with matching entity titles', async () => {
  const context = await createContext('derived-title-collision')
  await ingestWikiSource(
    {
      title: 'SeekDB Runtime',
      content: 'SeekDB Runtime source notes should stay a source page.',
      sourcePath: '/notes/seekdb-runtime-source.md',
    },
    context,
  )
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          items: [
            {
              name: 'SeekDB Runtime',
              kind: 'entity',
              summary: 'SeekDB Runtime is the durable retrieval layer described by this source.',
              confidence: 0.94,
            },
          ],
        }),
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch

  await ingestWikiSource(
    {
      title: 'PowerMem Source',
      content: 'PowerMem relies on SeekDB Runtime for durable retrieval.',
      sourcePath: '/notes/powermem-source.md',
    },
    context,
  )

  const source = await getWikiPage('sources-seekdb-runtime', context)
  const entity = await getWikiPage('entities-seekdb-runtime', context)
  assert.equal(source.type, 'source')
  assert.equal(entity.type, 'entity')
  assert.doesNotMatch(source.content, /Source Contributions/)
  assert.match(entity.content, /PowerMem Source/)
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

test('synthesis and snippets strip generated wiki blocks before rendering durable output', async () => {
  const context = await createContext('synthesis-sanitized')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          items: [
            {
              name: 'SeekDB Runtime',
              kind: 'entity',
              summary: 'SeekDB Runtime provides the durable retrieval layer for PowerMem.',
              confidence: 0.96,
            },
          ],
        }),
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch

  await ingestWikiSource(
    {
      title: 'PowerMem Durable Retrieval',
      content: 'PowerMem durable retrieval relies on SeekDB Runtime for persisted context and recall.',
      sourcePath: '/notes/powermem-durable-retrieval.md',
    },
    context,
  )

  const results = await searchWiki('powermem durable retrieval', { limit: 5 }, context)
  const sourceResult = results.find((result) => result.title === 'PowerMem Durable Retrieval')
  const derivedResult = results.find((result) => result.title === 'SeekDB Runtime')
  assert.ok(sourceResult)
  assert.ok(derivedResult)
  assert.doesNotMatch(sourceResult.snippet, /Extracted Wiki Links/)
  assert.doesNotMatch(sourceResult.snippet, /\[\[SeekDB Runtime\]\]/)
  assert.match(derivedResult.snippet, /durable retrieval layer/)

  const synthesized = await synthesizeWiki(
    { query: 'powermem durable retrieval', limit: 5 },
    context,
  )
  assert.equal(synthesized.title, 'Synthesis Powermem Durable Retrieval')
  const page = await getWikiPage(synthesized.page.id, context)
  assert.doesNotMatch(page.content, /CLAWMASTER-GENERATED/)
  assert.doesNotMatch(page.content, /## Extracted Wiki Links/)
  assert.ok(!page.links.includes('durable-re-seekdb-runtime'))

  const lint = await lintWiki(context)
  assert.deepEqual(lint.issues, [])
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
  assert.equal(evolved.mode, 'mechanical')
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

test('lint emits contradiction issues when llm contradiction checks find a conflict', async () => {
  const context = await createContext('contradiction')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  await ingestWikiSource(
    {
      title: 'Runtime Claim A',
      content: '[[Runtime Claim B]] says the runtime is local-only.',
      sourcePath: '/notes/runtime-a.md',
    },
    context,
  )
  await ingestWikiSource(
    {
      title: 'Runtime Claim B',
      content: 'Runtime Claim B says the runtime is remote-first.',
      sourcePath: '/notes/runtime-b.md',
    },
    context,
  )
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          contradictions: [
            {
              claim1: 'local-only',
              claim2: 'remote-first',
              explanation: 'One page says the runtime is local-only while the other says it is remote-first.',
            },
          ],
        }),
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch

  const lint = await lintWiki(context)
  assert.ok(lint.issues.some((issue) => issue.kind === 'contradiction'))
  const conflicts = JSON.parse(await fs.readFile(resolveWikiPaths(context).conflictsPath, 'utf8')) as Array<{ kind: string }>
  assert.ok(conflicts.some((issue) => issue.kind === 'contradiction'))
})

test('deep evolve revises stale pages through the wiki llm without changing the mechanical endpoint', async () => {
  const context = await createContext('deep-evolve')
  await writeWikiConfig(context, {
    agents: { defaults: { model: { primary: 'openai/gpt-4o-mini' } } },
  })
  const created = await ingestWikiSource(
    {
      title: 'Stale Runtime Notes',
      content: 'The runtime status is pending further verification.',
      sourcePath: '/notes/stale-runtime.md',
    },
    context,
  )
  const detail = await getWikiPage(created.page!.id, context)
  const raw = await fs.readFile(detail.path, 'utf8')
  await fs.writeFile(
    detail.path,
    raw.replace(/updatedAt: .+/, 'updatedAt: "2000-01-01T00:00:00.000Z"'),
    'utf8',
  )

  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: 'The runtime status is now verified and actively maintained.',
      },
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch

  const evolved = await evolveWikiDeep(context)
  assert.equal(evolved.mode, 'deep')
  assert.equal(evolved.staleCount, 0)
  assert.ok(evolved.changedPageIds.includes(created.page!.id))
  const revised = await getWikiPage(created.page!.id, context)
  assert.equal(revised.frontmatter.evolveSource, 'llm-deep-evolve')
  assert.equal(revised.freshnessStatus, 'fresh')
  assert.match(revised.content, /verified and actively maintained/)
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
