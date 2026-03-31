import { describe, it, expect, vi } from 'vitest'
import { getChannelStatus, probeChannels, getFullStatus } from '../channel-status'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('channel-status adapter', () => {
  async function mockExec(output: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(output)
  }

  async function mockExecFail(msg: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockRejectedValue(new Error(msg))
  }

  describe('getChannelStatus', () => {
    it('parses channel status', async () => {
      const response = {
        channels: {
          telegram: { status: 'connected', accounts: ['@mybot'] },
          discord: { status: 'disconnected', accounts: [] },
        },
      }
      await mockExec(JSON.stringify(response))
      const result = await getChannelStatus()
      expect(result.success).toBe(true)
      expect(result.data!.channelOrder).toEqual(['telegram', 'discord'])
      expect(result.data!.channels.telegram.status).toBe('connected')
      expect(result.data!.channels.telegram.accounts).toEqual(['@mybot'])
      expect(result.data!.channels.discord.status).toBe('disconnected')
    })

    it('handles empty channels', async () => {
      await mockExec(JSON.stringify({ channels: {} }))
      const result = await getChannelStatus()
      expect(result.success).toBe(true)
      expect(result.data!.channelOrder).toHaveLength(0)
    })

    it('returns error when command fails', async () => {
      await mockExecFail('openclaw not found')
      const result = await getChannelStatus()
      expect(result.success).toBe(false)
    })
  })

  describe('probeChannels', () => {
    it('probes and returns health', async () => {
      const response = {
        channels: {
          telegram: { status: 'connected', accounts: ['@mybot'] },
        },
      }
      await mockExec(JSON.stringify(response))
      const result = await probeChannels()
      expect(result.success).toBe(true)
      expect(result.data!.channels.telegram.status).toBe('connected')
    })
  })

  describe('getFullStatus', () => {
    it('parses full system status', async () => {
      const response = {
        runtimeVersion: '2026.3.28',
        channelSummary: [
          { channel: 'telegram', status: 'connected', accounts: 1 },
          { channel: 'discord', status: 'idle', accounts: 0 },
        ],
        sessions: {
          count: 3,
          recent: [
            { agentId: 'main', key: 'agent:main:main', model: 'qwen2.5:0.5b', updatedAt: 1774912749 },
          ],
        },
      }
      await mockExec(JSON.stringify(response))
      const result = await getFullStatus()
      expect(result.success).toBe(true)
      expect(result.data!.runtimeVersion).toBe('2026.3.28')
      expect(result.data!.channelSummary).toHaveLength(2)
      expect(result.data!.sessions.count).toBe(3)
      expect(result.data!.sessions.recent[0].model).toBe('qwen2.5:0.5b')
    })

    it('handles snake_case fields', async () => {
      const response = {
        version: '2026.3.28',
        channels: [
          { name: 'telegram', status: 'connected', accountCount: 1 },
        ],
        sessions: {
          count: 1,
          recent: [
            { agent_id: 'main', key: 'test', model: 'gpt-4', updated_at: 1774900000 },
          ],
        },
      }
      await mockExec(JSON.stringify(response))
      const result = await getFullStatus()
      expect(result.success).toBe(true)
      expect(result.data!.runtimeVersion).toBe('2026.3.28')
      expect(result.data!.channelSummary[0].accounts).toBe(1)
      expect(result.data!.sessions.recent[0].agentId).toBe('main')
    })

    it('returns error when command fails', async () => {
      await mockExecFail('not running')
      const result = await getFullStatus()
      expect(result.success).toBe(false)
    })
  })
})
