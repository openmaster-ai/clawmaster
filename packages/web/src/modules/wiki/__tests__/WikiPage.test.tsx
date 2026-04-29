import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import WikiPage from '../WikiPage'

const mockWikiStatus = vi.fn()
const mockWikiPages = vi.fn()
const mockWikiPage = vi.fn()
const mockWikiSearch = vi.fn()
const mockWikiIngest = vi.fn()
const mockWikiQuery = vi.fn()
const mockWikiSynthesize = vi.fn()
const mockWikiLint = vi.fn()
const mockWikiEvolve = vi.fn()

vi.mock('@/shared/adapters/wiki', () => ({
  wikiStatusResult: (...args: any[]) => mockWikiStatus(...args),
  wikiPagesResult: (...args: any[]) => mockWikiPages(...args),
  wikiPageResult: (...args: any[]) => mockWikiPage(...args),
  wikiSearchResult: (...args: any[]) => mockWikiSearch(...args),
  wikiIngestResult: (...args: any[]) => mockWikiIngest(...args),
  wikiQueryResult: (...args: any[]) => mockWikiQuery(...args),
  wikiSynthesizeResult: (...args: any[]) => mockWikiSynthesize(...args),
  wikiLintResult: (...args: any[]) => mockWikiLint(...args),
  wikiEvolveResult: (...args: any[]) => mockWikiEvolve(...args),
}))

const pageSummary = {
  id: 'sources-powermem-bridge',
  title: 'PowerMem Bridge',
  type: 'source' as const,
  path: '/tmp/wiki/pages/sources/powermem-bridge.md',
  relativePath: 'pages/sources/powermem-bridge.md',
  snippet: 'PowerMem is the managed runtime root.',
  sourceCount: 1,
  freshnessStatus: 'fresh' as const,
  freshnessScore: 1,
  lifecycleState: 'evolved' as const,
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
  evolvedAt: '2026-04-29T08:10:00.000Z',
  evolveCheckedAt: '2026-04-29T08:20:00.000Z',
  evolveChangedAt: '2026-04-29T08:10:00.000Z',
  evolveChangeSummary: 'Freshness initialized as fresh. Related pages updated: synthesis-powermem.',
  evolveSource: 'freshness-score, wiki-links, backlinks, lint-health',
  lastAccessedAt: '2026-04-29T08:10:00.000Z',
  links: ['SeekDB Runtime'],
  backlinks: [],
  memoryIds: ['mem-1'],
}

const synthesisSummary = {
  ...pageSummary,
  id: 'synthesis-powermem',
  title: 'Powermem Knowledge',
  type: 'synthesis' as const,
  path: '/tmp/wiki/pages/synthesis/powermem.md',
  relativePath: 'pages/synthesis/powermem.md',
  snippet: 'Synthesized answer surface generated from source pages.',
  sourceCount: 2,
  lifecycleState: 'just_ingested' as const,
  evolveChangeSummary: '',
  evolveChangedAt: '',
}

describe('WikiPage', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await changeLanguage('en')
    mockWikiStatus.mockResolvedValue({
      success: true,
      data: {
        profileKey: 'default',
        vaultRoot: '/tmp/wiki',
        rawRoot: '/tmp/wiki/raw',
        pagesRoot: '/tmp/wiki/pages',
        metaRoot: '/tmp/wiki/.meta',
        indexPath: '/tmp/wiki/index.md',
        logPath: '/tmp/wiki/log.md',
        schemaPath: '/tmp/wiki/SCHEMA.md',
        freshnessPath: '/tmp/wiki/.meta/freshness.json',
        conflictsPath: '/tmp/wiki/.meta/conflicts.json',
        pageCount: 2,
        sourceCount: 1,
        staleCount: 0,
        conflictCount: 0,
        memory: {
          engine: 'powermem-sqlite',
          storagePath: '/tmp/wiki/powermem.sqlite',
        },
      },
    })
    mockWikiPages.mockResolvedValue({ success: true, data: [pageSummary, synthesisSummary] })
    mockWikiPage.mockResolvedValue({
      success: true,
      data: {
        ...pageSummary,
        content: '# PowerMem Bridge\n\nPowerMem is the managed runtime root. [[SeekDB Runtime]] is preferred.',
        frontmatter: { id: pageSummary.id, title: pageSummary.title },
        citations: [{ title: 'PowerMem Bridge', sourcePath: '/notes/powermem.md' }],
      },
    })
    mockWikiSearch.mockResolvedValue({
      success: true,
      data: [{ ...pageSummary, score: 80, matchType: 'keyword' }],
    })
    mockWikiIngest.mockResolvedValue({
      success: true,
      data: {
        state: 'needs_confirmation',
        confirmationRequired: true,
        message: 'URL ingest requires explicit confirmation.',
        pagesCreated: 0,
        pagesUpdated: 0,
        warnings: ['url_ingest_requires_confirmation'],
      },
    })
    mockWikiQuery.mockResolvedValue({
      success: true,
      data: {
        query: 'what do we know about powermem?',
        usedWiki: true,
        answer: 'Wiki found 1 relevant article.\n1. [[PowerMem Bridge]] - PowerMem is the managed runtime root.',
        results: [{ ...pageSummary, score: 90, matchType: 'semantic' }],
        citations: [],
        offerToSave: true,
      },
    })
    mockWikiSynthesize.mockResolvedValue({
      success: true,
      data: {
        title: 'Powermem',
        query: 'what do we know about powermem?',
        page: {
          ...pageSummary,
          id: 'synthesis-powermem',
          title: 'Powermem',
          type: 'synthesis',
          relativePath: 'pages/synthesis/powermem.md',
        },
        memoryId: 'mem-synthesis',
        pagesCreated: 1,
        pagesUpdated: 0,
        sourcePageIds: [pageSummary.id],
        citations: [{ title: 'PowerMem Bridge', sourcePath: '/notes/powermem.md' }],
        warnings: [],
        evolve: {
          evolvedAt: '2026-04-29T08:00:00.000Z',
          pageCount: 2,
          staleCount: 0,
          conflictCount: 0,
          changedPageIds: ['synthesis-powermem'],
          related: { 'synthesis-powermem': [pageSummary.id] },
          warnings: [],
          freshness: {},
        },
      },
    })
    mockWikiLint.mockResolvedValue({
      success: true,
      data: {
        checkedAt: '2026-04-29T08:00:00.000Z',
        issueCount: 1,
        issues: [{
          id: 'orphan:sources-powermem-bridge',
          severity: 'warning',
          kind: 'orphan',
          pageId: pageSummary.id,
          title: 'Orphan page',
          detail: 'PowerMem Bridge has no backlinks.',
        }],
      },
    })
    mockWikiEvolve.mockResolvedValue({
      success: true,
      data: {
        evolvedAt: '2026-04-29T08:00:00.000Z',
        pageCount: 1,
        staleCount: 0,
        conflictCount: 0,
        changedPageIds: [pageSummary.id],
        related: { [pageSummary.id]: [] },
        warnings: ['wiki_conflicts_detected'],
        freshness: {},
      },
    })
  })

  it('renders status, article search results, and opens article details in a modal', async () => {
    render(<WikiPage />)

    expect(await screen.findByRole('heading', { name: 'Wiki' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stale means Wiki evolution/i })).toBeInTheDocument()
    const bonusSection = await screen.findByRole('heading', { name: 'What Wiki already did for you' })
    const bonusCard = bonusSection.closest('section') as HTMLElement
    expect(within(bonusCard).getByText('LLM synthesis pages')).toBeInTheDocument()
    expect(within(bonusCard).getByText('Searchable source pages')).toBeInTheDocument()
    expect(within(bonusCard).getByText('Auto-maintained pages')).toBeInTheDocument()
    expect(within(bonusCard).getByText('1 maintenance update(s); 1 true evolved article(s).')).toBeInTheDocument()
    expect(within(bonusCard).getByText('Health signals')).toBeInTheDocument()
    expect(await screen.findByText('PowerMem Bridge')).toBeInTheDocument()
    expect(await screen.findByText('Powermem Knowledge')).toBeInTheDocument()
    expect(await screen.findByText('LLM synthesis')).toBeInTheDocument()
    expect(await screen.findByText('Just ingested')).toBeInTheDocument()
    expect(await screen.findByText('Evolved')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/managed runtime root/i).length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: /PowerMem Bridge/i }))
    const detailDialog = await screen.findByRole('dialog', { name: 'PowerMem Bridge' })
    expect(within(detailDialog).getAllByText(/SeekDB Runtime/i).length).toBeGreaterThan(0)
    expect(within(detailDialog).getByText('Ingested source')).toBeInTheDocument()
    expect(within(detailDialog).getByText(/Captured from a URL, file, or note/i)).toBeInTheDocument()
    expect(within(detailDialog).getByText('Changed by evolve')).toBeInTheDocument()
    expect(within(detailDialog).getByText('Ingested')).toBeInTheDocument()
    expect(within(detailDialog).getByText('Evolve checked')).toBeInTheDocument()
    expect(within(detailDialog).getByText('Metadata changed by evolve')).toBeInTheDocument()
    expect(within(detailDialog).getAllByText(/Freshness initialized as fresh/i).length).toBeGreaterThan(0)
    fireEvent.click(within(detailDialog).getByRole('button', { name: /Close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'PowerMem Bridge' })).not.toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Search articles or ask what we know...'), {
      target: { value: 'PowerMem' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Search/i }))

    await waitFor(() => expect(mockWikiSearch).toHaveBeenCalledWith('PowerMem', { limit: 20 }))
    expect(await screen.findByText('Keyword')).toBeInTheDocument()
  })

  it('keeps an empty search result instead of falling back to all pages', async () => {
    mockWikiSearch.mockResolvedValueOnce({ success: true, data: [] })
    render(<WikiPage />)

    expect(await screen.findByText('PowerMem Bridge')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search articles or ask what we know...'), {
      target: { value: 'missing topic' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Search/i }))

    await waitFor(() => expect(mockWikiSearch).toHaveBeenCalledWith('missing topic', { limit: 20 }))
    const searchSection = screen.getByRole('heading', { name: 'Article Search' }).closest('section') as HTMLElement
    expect(within(searchSection).getByText('No wiki articles yet.')).toBeInTheDocument()
    expect(within(searchSection).queryByText('PowerMem Bridge')).not.toBeInTheDocument()
    fireEvent.click(within(searchSection).getByRole('button', { name: /Clear search/i }))
    expect(await within(searchSection).findByText('PowerMem Bridge')).toBeInTheDocument()
  })

  it('requires explicit confirmation for URL ingest and can query/lint/evolve', async () => {
    render(<WikiPage />)

    fireEvent.change(await screen.findByPlaceholderText('Source URL or file path'), {
      target: { value: 'https://example.com/research' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Ingest$/i }))
    expect(await screen.findByText(/URL ingest is explicit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Summarize once/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use once/i })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Ask a question against compiled knowledge'), {
      target: { value: 'what do we know about powermem?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Ask$/i }))
    expect(await screen.findByText(/Wiki found 1 relevant article/i)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Save synthesis/i }))
    await waitFor(() => expect(mockWikiSynthesize).toHaveBeenCalledWith({
      query: 'what do we know about powermem?',
      limit: 5,
    }))
    expect(await screen.findByText(/Saved synthesis: Powermem/i)).toBeInTheDocument()
    expect(await screen.findByText(/Updated freshness for 2 article/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Run Lint/i }))
    expect(await screen.findByText(/1 issue/i)).toBeInTheDocument()
    await waitFor(() => expect(mockWikiStatus.mock.calls.length).toBeGreaterThanOrEqual(3))

    fireEvent.click(screen.getByRole('button', { name: /Run Evolve/i }))
    await waitFor(() => expect(mockWikiEvolve).toHaveBeenCalled())
    expect(await screen.findByText(/Updated freshness for 1 article/i)).toBeInTheDocument()
    expect(await screen.findByText(/Wiki health found 0 conflict/i)).toBeInTheDocument()
  })
})
