import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLocalDataStatsResult,
  rebuildLocalDataResult,
  resetLocalDataResult,
  searchLocalDataResult,
  upsertLocalDataDocumentsResult,
} from '../storage'

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
}))

describe('storage adapter', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getIsTauri } = await import('../platform')
    vi.mocked(getIsTauri).mockReturnValue(false)
  })

  it('loads local data stats through the web backend', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({
      success: true,
      data: { documentCount: 2, moduleCounts: { docs: 2 } },
      error: null,
    })

    const result = await getLocalDataStatsResult()

    expect(result.success).toBe(true)
    expect(webFetchJson).toHaveBeenCalledWith('/api/storage/stats')
  })

  it('upserts documents through the web backend', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: { documentCount: 1 }, error: null })

    await upsertLocalDataDocumentsResult([
      {
        id: 'docs:quickstart',
        module: 'docs',
        sourceType: 'guide',
        title: 'Quick Start',
        content: 'Install OpenClaw and start the gateway.',
      },
    ])

    expect(webFetchJson).toHaveBeenCalledWith('/api/storage/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: [
          {
            id: 'docs:quickstart',
            module: 'docs',
            sourceType: 'guide',
            title: 'Quick Start',
            content: 'Install OpenClaw and start the gateway.',
          },
        ],
        replace: undefined,
      }),
    })
  })

  it('can request replace semantics for generated document sources', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: { documentCount: 1 }, error: null })

    await upsertLocalDataDocumentsResult([
      {
        id: 'docs:quickstart',
        module: 'docs',
        sourceType: 'guide',
        title: 'Quick Start',
        content: 'Install OpenClaw and start the gateway.',
      },
    ], { replace: { module: 'docs' } })

    expect(webFetchJson).toHaveBeenCalledWith('/api/storage/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: [
          {
            id: 'docs:quickstart',
            module: 'docs',
            sourceType: 'guide',
            title: 'Quick Start',
            content: 'Install OpenClaw and start the gateway.',
          },
        ],
        replace: { module: 'docs' },
      }),
    })
  })

  it('searches, rebuilds, and resets through the web backend', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: [], error: null })

    await searchLocalDataResult({ query: 'gateway setup', module: 'docs', limit: 8 })
    await rebuildLocalDataResult()
    await resetLocalDataResult()

    expect(webFetchJson).toHaveBeenNthCalledWith(1, '/api/storage/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'gateway setup', module: 'docs', limit: 8 }),
    })
    expect(webFetchJson).toHaveBeenNthCalledWith(2, '/api/storage/rebuild', { method: 'POST' })
    expect(webFetchJson).toHaveBeenNthCalledWith(3, '/api/storage/reset', { method: 'POST' })
  })

  it('returns a clear desktop limitation while the Node storage worker is pending', async () => {
    const { getIsTauri } = await import('../platform')
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(getIsTauri).mockReturnValue(true)

    const result = await getLocalDataStatsResult()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Desktop write actions/)
    expect(webFetchJson).not.toHaveBeenCalled()
  })
})
