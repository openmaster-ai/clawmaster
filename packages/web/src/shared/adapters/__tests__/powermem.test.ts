import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getMemoryHealth,
  listMemories,
  searchMemories,
  getMemory,
  addMemory,
  updateMemory,
  deleteMemory,
  getMemoryStats,
  isPowerMemServerRunning,
} from '../powermem'

// Mock fetch globally for HTTP API tests
vi.stubGlobal('fetch', vi.fn())

// Mock platform for CLI fallback tests
vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

function mockFetchOk(data: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data }),
  } as Response)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mockFetchFail(status = 500, body = 'Internal Server Error') {
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
  } as unknown as Response)
}

function mockFetchThrow() {
  vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))
}

describe('powermem adapter (HTTP API)', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
  })

  describe('getMemoryHealth', () => {
    it('returns healthy when HTTP API responds', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'healthy' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { storage_type: 'sqlite', llm_provider: 'qwen', version: '1.0.2' } }) } as Response)

      const result = await getMemoryHealth()
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('healthy')
      expect(result.data?.storage_type).toBe('sqlite')
    })

    it('falls back to CLI when HTTP API unavailable', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))

      const { execCommand } = await import('../platform')
      vi.mocked(execCommand).mockResolvedValue('memory-powermem: healthy')

      const result = await getMemoryHealth()
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('healthy')
    })

    it('returns disconnected when both HTTP and CLI fail', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))

      const { execCommand } = await import('../platform')
      vi.mocked(execCommand).mockRejectedValue(new Error('not found'))

      const result = await getMemoryHealth()
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('disconnected')
    })
  })

  describe('listMemories', () => {
    it('returns paginated memory list', async () => {
      const memories = [
        { id: 'm1', memory: 'user likes coffee', agent_id: 'main', created_at: '2026-03-25', metadata: { intelligence: { importance_score: 0.8, memory_type: 'long_term', current_retention: 0.95 } } },
        { id: 'm2', memory: 'project uses React', agent_id: 'main', created_at: '2026-03-24' },
      ]
      mockFetchOk(memories)

      const result = await listMemories()
      expect(result.success).toBe(true)
      expect(result.data?.memories).toHaveLength(2)
      expect(result.data?.memories[0].memory).toBe('user likes coffee')
      expect(result.data?.memories[0].metadata?.intelligence?.importance_score).toBe(0.8)
    })

    it('handles wrapped response with total', async () => {
      mockFetchOk({ memories: [{ id: 'm1', memory: 'test', created_at: '2026-03-25' }], total: 42 })

      const result = await listMemories()
      expect(result.success).toBe(true)
      expect(result.data?.total).toBe(42)
    })

    it('passes agent_id filter', async () => {
      mockFetchOk([])
      await listMemories('cipher')

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('agent_id=cipher')
    })
  })

  describe('searchMemories', () => {
    it('returns search results with scores', async () => {
      mockFetchOk({
        results: [
          { memory_id: 'm1', memory: 'coffee preference', score: 0.92, metadata: { intelligence: { memory_type: 'long_term' } } },
        ],
      })

      const result = await searchMemories('coffee')
      expect(result.success).toBe(true)
      expect(result.data?.results).toHaveLength(1)
      expect(result.data?.results[0].score).toBe(0.92)
    })

    it('posts correct search body', async () => {
      mockFetchOk({ results: [] })
      await searchMemories('query', 'agent1', 'user1', 10)

      const call = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(call[1]?.body as string)
      expect(body.query).toBe('query')
      expect(body.agent_id).toBe('agent1')
      expect(body.user_id).toBe('user1')
      expect(body.limit).toBe(10)
    })
  })

  describe('getMemory', () => {
    it('returns single memory by ID', async () => {
      mockFetchOk({ id: 'm1', memory: 'full content', created_at: '2026-03-25' })

      const result = await getMemory('m1')
      expect(result.success).toBe(true)
      expect(result.data?.memory).toBe('full content')
    })
  })

  describe('addMemory', () => {
    it('creates memory with infer mode', async () => {
      mockFetchOk([{ id: 'new1', memory: 'extracted fact', created_at: '2026-03-26' }])

      const result = await addMemory('The user prefers dark mode and drinks coffee')
      expect(result.success).toBe(true)

      const call = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(call[1]?.body as string)
      expect(body.infer).toBe(true)
      expect(body.messages[0].content).toContain('dark mode')
    })

    it('passes agent_id and importance', async () => {
      mockFetchOk([])
      await addMemory('test', { agentId: 'cipher', importance: 0.9 })

      const call = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(call[1]?.body as string)
      expect(body.agent_id).toBe('cipher')
      expect(body.metadata.importance).toBe(0.9)
    })
  })

  describe('updateMemory', () => {
    it('updates memory content', async () => {
      mockFetchOk({ id: 'm1', memory: 'updated content' })

      const result = await updateMemory('m1', 'updated content')
      expect(result.success).toBe(true)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('/memories/m1')
      expect(call[1]?.method).toBe('PUT')
    })
  })

  describe('deleteMemory', () => {
    it('deletes memory by ID', async () => {
      mockFetchOk(null)

      const result = await deleteMemory('m1')
      expect(result.success).toBe(true)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('/memories/m1')
      expect(call[1]?.method).toBe('DELETE')
    })
  })

  describe('getMemoryStats', () => {
    it('aggregates stats from API', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { storage_type: 'sqlite' } }) } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { id: 'm1', agent_id: 'main', metadata: { intelligence: { memory_type: 'long_term', current_retention: 0.9 } } },
              { id: 'm2', agent_id: 'main', metadata: { intelligence: { memory_type: 'short_term', current_retention: 0.5 } } },
              { id: 'm3', agent_id: 'cipher', metadata: { intelligence: { memory_type: 'long_term', current_retention: 0.8 } } },
            ],
          }),
        } as Response)

      const result = await getMemoryStats()
      expect(result.success).toBe(true)
      expect(result.data?.total).toBe(3)
      expect(result.data?.by_agent.main).toBe(2)
      expect(result.data?.by_agent.cipher).toBe(1)
      expect(result.data?.by_type.long_term).toBe(2)
      expect(result.data?.by_type.short_term).toBe(1)
      expect(result.data?.avg_retention).toBeCloseTo(0.733, 2)
    })
  })

  describe('isPowerMemServerRunning', () => {
    it('returns true when server responds', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'healthy' }) } as Response)

      const result = await isPowerMemServerRunning()
      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('returns false when server unreachable', async () => {
      mockFetchThrow()

      const result = await isPowerMemServerRunning()
      expect(result.success).toBe(true)
      expect(result.data).toBe(false)
    })
  })
})
