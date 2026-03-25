import { describe, it, expect, vi } from 'vitest'
import { listMemories, searchMemories, getMemoryHealth, getMemoryStats, getAgentIds } from '../powermem'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('powermem adapter', () => {
  async function mockExec(output: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(output)
  }

  async function mockExecFail(msg: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockRejectedValue(new Error(msg))
  }

  describe('listMemories', () => {
    it('parses array response', async () => {
      const entries = [
        { id: 'm1', content: 'user likes coffee', agent_id: 'main', created_at: '2026-03-25', importance: 'high' },
        { id: 'm2', content: 'project uses React', agent_id: 'main', created_at: '2026-03-24' },
      ]
      await mockExec(JSON.stringify(entries))
      const result = await listMemories()
      expect(result.success).toBe(true)
      expect(result.data?.entries).toHaveLength(2)
      expect(result.data?.entries[0].content).toBe('user likes coffee')
    })

    it('parses wrapped response', async () => {
      await mockExec(JSON.stringify({ entries: [{ id: 'm1', content: 'test', created_at: '2026-03-25' }], total: 42 }))
      const result = await listMemories()
      expect(result.success).toBe(true)
      expect(result.data?.total).toBe(42)
    })

    it('returns error when pmem not installed', async () => {
      await mockExecFail('command not found: pmem')
      const result = await listMemories()
      expect(result.success).toBe(false)
      expect(result.error).toContain('pmem')
    })
  })

  describe('searchMemories', () => {
    it('searches and returns results', async () => {
      const results = [{ id: 'm1', content: 'matching memory', created_at: '2026-03-25' }]
      await mockExec(JSON.stringify(results))
      const result = await searchMemories('matching')
      expect(result.success).toBe(true)
      expect(result.data?.entries).toHaveLength(1)
    })
  })

  describe('getMemoryHealth', () => {
    it('parses health status', async () => {
      await mockExec(JSON.stringify({ status: 'ok', total_memories: 156, storage: 'sqlite', agent_count: 3 }))
      const result = await getMemoryHealth()
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('ok')
      expect(result.data?.total_memories).toBe(156)
    })
  })

  describe('getMemoryStats', () => {
    it('parses stats with agent distribution', async () => {
      await mockExec(JSON.stringify({ total: 200, by_agent: { main: 120, cipher: 80 }, avg_retention: 0.72 }))
      const result = await getMemoryStats()
      expect(result.success).toBe(true)
      expect(result.data?.total).toBe(200)
      expect(result.data?.by_agent.main).toBe(120)
      expect(result.data?.avg_retention).toBe(0.72)
    })
  })

  describe('getAgentIds', () => {
    it('extracts agent ids from stats', async () => {
      await mockExec(JSON.stringify({ total: 100, by_agent: { main: 60, cipher: 30, anya: 10 } }))
      const result = await getAgentIds()
      expect(result.success).toBe(true)
      expect(result.data).toEqual(['main', 'cipher', 'anya'])
    })
  })
})
