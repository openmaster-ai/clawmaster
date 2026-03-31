import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectOllama, isOllamaRunning, listModels, pullModel, deleteModel, getOllamaStatus, formatModelSize } from '../ollama'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('ollama adapter', () => {
  async function mockExec(output: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(output)
  }

  async function mockExecFail(msg: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockRejectedValue(new Error(msg))
  }

  async function mockExecSequence(...outputs: Array<string | Error>) {
    const { execCommand } = await import('../platform')
    const fn = vi.mocked(execCommand)
    fn.mockReset()
    for (const out of outputs) {
      if (out instanceof Error) {
        fn.mockRejectedValueOnce(out)
      } else {
        fn.mockResolvedValueOnce(out)
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detectOllama', () => {
    it('detects installed ollama', async () => {
      await mockExec('ollama version is 0.19.0')
      const result = await detectOllama()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(true)
      expect(result.data!.version).toContain('0.19.0')
    })

    it('returns not installed when command fails', async () => {
      await mockExecFail('command not found: ollama')
      const result = await detectOllama()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(false)
    })
  })

  describe('isOllamaRunning', () => {
    it('returns true when server responds', async () => {
      await mockExec('{"models":[]}')
      const result = await isOllamaRunning()
      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('returns false when server unreachable', async () => {
      await mockExecFail('connection refused')
      const result = await isOllamaRunning()
      expect(result.success).toBe(true)
      expect(result.data).toBe(false)
    })
  })

  describe('listModels', () => {
    it('parses model list from API', async () => {
      const response = {
        models: [
          { name: 'llama3.2:latest', size: 2000000000, modified_at: '2026-03-30T00:00:00Z', digest: 'abc123' },
          { name: 'qwen2.5:0.5b', size: 398000000, modified_at: '2026-03-30T00:00:00Z', digest: 'def456' },
        ],
      }
      await mockExec(JSON.stringify(response))
      const result = await listModels()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].name).toBe('llama3.2:latest')
      expect(result.data![1].size).toBe(398000000)
    })

    it('returns empty when no models', async () => {
      await mockExec(JSON.stringify({ models: [] }))
      const result = await listModels()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(0)
    })

    it('returns error when server not running', async () => {
      await mockExecFail('connection refused')
      const result = await listModels()
      expect(result.success).toBe(false)
    })
  })

  describe('pullModel', () => {
    it('pulls model successfully', async () => {
      // resolveOllamaBin needs ollama --version to succeed first
      await mockExecSequence('ollama version is 0.19.0', 'pulling manifest... success')
      const result = await pullModel('llama3.2')
      expect(result.success).toBe(true)
      expect(result.data).toContain('success')
    })
  })

  describe('deleteModel', () => {
    it('deletes model successfully', async () => {
      await mockExecSequence('ollama version is 0.19.0', 'deleted llama3.2')
      const result = await deleteModel('llama3.2')
      expect(result.success).toBe(true)
    })
  })

  describe('getOllamaStatus', () => {
    it('returns full status when running with models', async () => {
      const tagsResponse = JSON.stringify({
        models: [{ name: 'qwen2.5:0.5b', size: 398000000, modified_at: '2026-03-30', digest: 'abc' }],
      })
      // First call: resolveOllamaBin -> ollama --version
      // Second call: ollama --version (for status)
      // Third call: curl /api/tags
      await mockExecSequence(
        'ollama version is 0.19.0',
        'ollama version is 0.19.0',
        tagsResponse,
      )
      const result = await getOllamaStatus()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(true)
      expect(result.data!.running).toBe(true)
      expect(result.data!.models).toHaveLength(1)
      expect(result.data!.version).toContain('0.19.0')
    })

    it('returns installed but not running', async () => {
      await mockExecSequence(
        'ollama version is 0.19.0',
        'ollama version is 0.19.0',
        new Error('connection refused'),
      )
      const result = await getOllamaStatus()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(true)
      expect(result.data!.running).toBe(false)
      expect(result.data!.models).toHaveLength(0)
    })
  })

  describe('formatModelSize', () => {
    it('formats GB', () => {
      expect(formatModelSize(2_000_000_000)).toBe('2.0 GB')
    })

    it('formats MB', () => {
      expect(formatModelSize(398_000_000)).toBe('398 MB')
    })

    it('formats bytes', () => {
      expect(formatModelSize(1024)).toBe('1024 B')
    })
  })
})
