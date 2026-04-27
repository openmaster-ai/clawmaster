import { describe, it, expect, vi } from 'vitest'
import { getSessions, getSessionDetail, cleanupSessions } from '../sessions'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('sessions adapter', () => {
  async function mockExec(output: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(output)
  }

  async function mockExecFail(msg: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockRejectedValue(new Error(msg))
  }

  describe('getSessions', () => {
    it('parses sessions list', async () => {
      const response = {
        path: '/home/user/.openclaw/sessions',
        count: 2,
        sessions: [
          {
            key: 'agent:main:main',
            sessionId: 'abc-123',
            agentId: 'main',
            model: 'qwen2.5:0.5b',
            modelProvider: 'ollama',
            kind: 'direct',
            inputTokens: 15000,
            outputTokens: 500,
            totalTokens: 15500,
            contextTokens: 200000,
            updatedAt: 1774912749000,
            ageMs: 60000,
          },
          {
            key: 'agent:main:telegram',
            sessionId: 'def-456',
            agentId: 'main',
            model: 'deepseek-ai/DeepSeek-V3',
            modelProvider: 'openrouter',
            kind: 'channel',
            inputTokens: 8000,
            outputTokens: 200,
            totalTokens: 8200,
            contextTokens: 200000,
            updatedAt: 1774900000000,
            ageMs: 3600000,
          },
        ],
      }
      await mockExec(JSON.stringify(response))
      const result = await getSessions()
      expect(result.success).toBe(true)
      expect(result.data!.count).toBe(2)
      expect(result.data!.sessions).toHaveLength(2)
      expect(result.data!.sessions[0].key).toBe('agent:main:main')
      expect(result.data!.sessions[0].kind).toBe('direct')
      expect(result.data!.sessions[1].kind).toBe('channel')
    })

    it('handles empty sessions', async () => {
      await mockExec(JSON.stringify({ path: '', count: 0, sessions: [] }))
      const result = await getSessions()
      expect(result.success).toBe(true)
      expect(result.data!.sessions).toHaveLength(0)
    })

    it('handles snake_case fields', async () => {
      const response = {
        count: 1,
        sessions: [
          {
            key: 'test',
            session_id: 'id-1',
            agent_id: 'main',
            model: 'gpt-4',
            model_provider: 'openai',
            kind: 'direct',
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            context_tokens: 128000,
            updated_at: 1774900000000,
            age_ms: 1000,
          },
        ],
      }
      await mockExec(JSON.stringify(response))
      const result = await getSessions()
      expect(result.success).toBe(true)
      expect(result.data!.sessions[0].sessionId).toBe('id-1')
      expect(result.data!.sessions[0].agentId).toBe('main')
      expect(result.data!.sessions[0].inputTokens).toBe(100)
    })

    it('returns error when command fails', async () => {
      await mockExecFail('openclaw not found')
      const result = await getSessions()
      expect(result.success).toBe(false)
    })
  })

  describe('getSessionDetail', () => {
    it('parses turn-by-turn detail', async () => {
      const response = {
        sessionKey: 'agent:main:main',
        model: 'qwen2.5:0.5b',
        provider: 'ollama',
        inputTokens: 59202,
        outputTokens: 101,
        totalTokens: 59303,
        estimatedUsd: 0,
        startedAt: 1774902458,
        lastActiveAt: 1774912749,
        durationMin: 172,
        compactionCount: 0,
        turns: [
          { turnIndex: 1, timestamp: 1774902458, inputTokensDelta: 15779, outputTokensDelta: 5, estimatedUsd: 0, compactOccurred: false, tools: [] },
          { turnIndex: 2, timestamp: 1774912710, inputTokensDelta: 15676, outputTokensDelta: 13, estimatedUsd: 0, compactOccurred: false, tools: ['web_search'] },
        ],
      }
      await mockExec(JSON.stringify(response))
      const result = await getSessionDetail('agent:main:main')
      expect(result.success).toBe(true)
      expect(result.data!.turns).toHaveLength(2)
      expect(result.data!.turns[0].turnIndex).toBe(1)
      expect(result.data!.turns[1].tools).toEqual(['web_search'])
      expect(result.data!.durationMin).toBe(172)
    })

    it('passes agent id when loading a session from a non-default agent', async () => {
      const { execCommand } = await import('../platform')
      await mockExec(JSON.stringify({ sessionKey: 'agent:review:latest' }))

      const result = await getSessionDetail('agent:review:latest', { agentId: 'review' })

      expect(result.success).toBe(true)
      expect(execCommand).toHaveBeenCalledWith('clawprobe', [
        'session',
        'agent:review:latest',
        '--json',
        '--agent',
        'review',
      ])
    })

    it('parses current context tokens separately from cumulative billed tokens', async () => {
      await mockExec(JSON.stringify({
        sessionKey: 'agent:main:main',
        inputTokens: 150000,
        outputTokens: 20000,
        totalTokens: 170000,
        contextTokens: 32000,
        windowSize: 128000,
      }))

      const result = await getSessionDetail('agent:main:main')

      expect(result.success).toBe(true)
      expect(result.data!.totalTokens).toBe(170000)
      expect(result.data!.contextTokens).toBe(32000)
      expect(result.data!.windowSize).toBe(128000)
    })

    it('returns error when session not found', async () => {
      await mockExecFail('session not found')
      const result = await getSessionDetail('nonexistent')
      expect(result.success).toBe(false)
    })
  })

  describe('cleanupSessions', () => {
    it('cleans up successfully', async () => {
      await mockExec('Cleaned up 3 sessions')
      const result = await cleanupSessions()
      expect(result.success).toBe(true)
      expect(result.data).toContain('Cleaned up')
    })
  })
})
