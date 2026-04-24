import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import ContentDraftsPage from '../ContentDraftsPage'

const mockGetContentDraftVariantsResult = vi.fn()
const mockReadContentDraftTextResult = vi.fn()
const mockReadContentDraftImageResult = vi.fn()
const mockDeleteContentDraftVariantResult = vi.fn()

vi.mock('@/shared/adapters/contentDrafts', () => ({
  getContentDraftVariantsResult: (...args: any[]) => mockGetContentDraftVariantsResult(...args),
  readContentDraftTextResult: (...args: any[]) => mockReadContentDraftTextResult(...args),
  readContentDraftImageResult: (...args: any[]) => mockReadContentDraftImageResult(...args),
  deleteContentDraftVariantResult: (...args: any[]) => mockDeleteContentDraftVariantResult(...args),
}))

describe('ContentDraftsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-image'),
      revokeObjectURL: vi.fn(),
    })

    mockGetContentDraftVariantsResult.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'run-200:wechat',
          runId: 'run-200',
          platform: 'wechat',
          title: 'Weekly digest',
          slug: 'weekly-digest',
          sourceUrl: 'https://example.com/weekly',
          savedAt: '2026-04-19T08:00:00.000Z',
          draftPath: '/tmp/content-drafts/run-200/wechat/draft.md',
          manifestPath: '/tmp/content-drafts/run-200/wechat/manifest.json',
          imagesDir: '/tmp/content-drafts/run-200/wechat/images',
          imageFiles: ['cover.png'],
        },
        {
          id: 'run-199:xhs',
          runId: 'run-199',
          platform: 'xhs',
          title: 'XHS recap',
          slug: 'xhs-recap',
          sourceUrl: 'https://example.com/xhs',
          savedAt: '2026-04-18T08:00:00.000Z',
          draftPath: '/tmp/content-drafts/run-199/xhs/draft.md',
          manifestPath: '/tmp/content-drafts/run-199/xhs/manifest.json',
          imagesDir: '/tmp/content-drafts/run-199/xhs/images',
          imageFiles: ['card-1.webp', 'card-2.webp'],
        },
      ],
    })

    mockReadContentDraftTextResult.mockImplementation(async (targetPath: string) => ({
      success: true,
      data: {
        path: targetPath,
        content:
          targetPath === '/tmp/content-drafts/run-200/wechat/draft.md'
            ? '# Weekly digest\n\nIntro paragraph.\n\n| Capability | Note |\n|------|------|\n| Streaming | Built in |\n\n![Cover](images/cover.png)'
            : '# XHS recap\n\n- Card one\n- Card two',
      },
    }))

    mockReadContentDraftImageResult.mockImplementation(async (targetPath: string) => ({
      success: true,
      data: {
        path: targetPath,
        mimeType: targetPath.endsWith('.png') ? 'image/png' : 'image/webp',
        base64: Buffer.from([1, 2, 3, 4]).toString('base64'),
      },
    }))

    mockDeleteContentDraftVariantResult.mockResolvedValue({
      success: true,
      data: {
        removedPath: '/tmp/content-drafts/run-200/wechat',
      },
    })
  })

  it('loads draft details only after a row is expanded and switches when another row is expanded', async () => {
    render(
      <MemoryRouter>
        <ContentDraftsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Content Drafts' })).toBeInTheDocument()
    // listHint renders only after variants load; use findBy to wait for async fetch
    expect(await screen.findByText('Each row shows draft metadata first. Expand a row to read the rendered draft with inline images, then inspect artifact paths only if needed.')).toBeInTheDocument()
    expect(mockReadContentDraftTextResult).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Weekly digest/i }))
    await waitFor(() => {
      expect(mockReadContentDraftTextResult).toHaveBeenCalledWith('/tmp/content-drafts/run-200/wechat/draft.md')
    })
    expect(await screen.findByText('Rendered draft')).toBeInTheDocument()
    expect(await screen.findByText('Intro paragraph.')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Cover' })).toBeInTheDocument()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Capability' })).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'Built in' })).toBeInTheDocument()
    expect(screen.queryByText('Saved images not referenced in markdown')).not.toBeInTheDocument()
    expect(mockReadContentDraftImageResult).toHaveBeenCalledWith('/tmp/content-drafts/run-200/wechat/images/cover.png')

    fireEvent.click(screen.getByRole('button', { name: /XHS recap/i }))

    await waitFor(() => {
      expect(mockReadContentDraftTextResult).toHaveBeenCalledWith('/tmp/content-drafts/run-199/xhs/draft.md')
    })
    expect(await screen.findByText('Card one')).toBeInTheDocument()
    expect(await screen.findByText('Card two')).toBeInTheDocument()
    expect(mockReadContentDraftImageResult).toHaveBeenCalledWith('/tmp/content-drafts/run-199/xhs/images/card-1.webp')
    expect(mockReadContentDraftImageResult).toHaveBeenCalledWith('/tmp/content-drafts/run-199/xhs/images/card-2.webp')
    expect(await screen.findByText('Saved images not referenced in markdown')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /card-1\.webp/i }))

    const imageDialog = await screen.findByRole('dialog', { name: 'Saved image details: card-1.webp' })
    expect(within(imageDialog).getByText('This saved image belongs to XHS recap but is not embedded directly in the article body.')).toBeInTheDocument()
    expect(within(imageDialog).getByText('File Name')).toBeInTheDocument()
    expect(within(imageDialog).getByText('MIME Type')).toBeInTheDocument()
    expect(within(imageDialog).getByRole('button', { name: 'Close image' })).toBeInTheDocument()

    fireEvent.click(within(imageDialog).getByRole('button', { name: 'Close image' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Saved image details: card-1.webp' })).not.toBeInTheDocument()
    })
  })

  it('removes a draft variant after delete confirmation', async () => {
    render(
      <MemoryRouter>
        <ContentDraftsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Content Drafts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Weekly digest/i }))
    expect(await screen.findByRole('button', { name: 'Delete draft' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete draft' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete draft' }))

    await waitFor(() => {
      expect(mockDeleteContentDraftVariantResult).toHaveBeenCalledWith('/tmp/content-drafts/run-200/wechat/manifest.json')
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Weekly digest/i })).not.toBeInTheDocument()
    })
  })

  it('renders the empty state when no draft variants are available', async () => {
    mockGetContentDraftVariantsResult.mockResolvedValueOnce({
      success: true,
      data: [],
    })

    render(
      <MemoryRouter>
        <ContentDraftsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('No matching drafts')).toBeInTheDocument()
    expect(screen.getByText('Run the Content Draft skill, then come back here to inspect the saved artifacts.')).toBeInTheDocument()
  })

  it('surfaces list load failures instead of rendering the empty-library state', async () => {
    mockGetContentDraftVariantsResult.mockResolvedValueOnce({
      success: false,
      error: 'Draft root unavailable',
    })

    render(
      <MemoryRouter>
        <ContentDraftsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Failed to load drafts: Draft root unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No matching drafts')).not.toBeInTheDocument()
  })
})
