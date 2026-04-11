import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectOllama, isOllamaRunning, listModels, pullModel, deleteModel, getOllamaStatus, formatModelSize } from '../ollama'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
}))

describe('ollama adapter', () => {
  async function mockWebFetch<T>(payload: T) {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: payload, error: null })
  }

  async function platformMocks() {
    const { execCommand, getIsTauri } = await import('../platform')
    return {
      execCommand: vi.mocked(execCommand),
      getIsTauri: vi.mocked(getIsTauri),
    }
  }

  async function mockWebFetchFail(msg: string) {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({ success: false, data: undefined, error: msg })
  }

  async function mockWebFetchSequence(...outputs: Array<unknown | Error>) {
    const { webFetchJson } = await import('../webHttp')
    const fn = vi.mocked(webFetchJson)
    fn.mockReset()
    for (const out of outputs) {
      if (out instanceof Error) {
        fn.mockResolvedValueOnce({ success: false, data: undefined, error: out.message })
      } else {
        fn.mockResolvedValueOnce({ success: true, data: out, error: null })
      }
    }
  }

  beforeEach(async () => {
    vi.resetAllMocks()
    const { getIsTauri } = await import('../platform')
    vi.mocked(getIsTauri).mockReturnValue(false)
  })

  describe('detectOllama', () => {
    it('detects installed ollama', async () => {
      await mockWebFetch({ installed: true, version: '0.19.0' })
      const result = await detectOllama()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(true)
      expect(result.data!.version).toContain('0.19.0')
    })

    it('returns not installed when command fails', async () => {
      await mockWebFetchFail('command not found: ollama')
      const result = await detectOllama()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(false)
    })

    it('uses tauri-safe system commands instead of node helpers', async () => {
      const { execCommand, getIsTauri } = await platformMocks()
      getIsTauri.mockReturnValue(true)
      execCommand.mockResolvedValue('ollama version 0.19.0')

      const result = await detectOllama()

      expect(result.success).toBe(true)
      expect(result.data?.installed).toBe(true)
      expect(execCommand).toHaveBeenCalledWith('ollama', ['--version'])
      expect(execCommand).not.toHaveBeenCalledWith('node', expect.anything())
    })
  })

  describe('isOllamaRunning', () => {
    it('returns true when server responds', async () => {
      await mockWebFetch({ running: true })
      const result = await isOllamaRunning()
      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('returns false when server unreachable', async () => {
      await mockWebFetchFail('connection refused')
      const result = await isOllamaRunning()
      expect(result.success).toBe(false)
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
      await mockWebFetch([
        { name: 'llama3.2:latest', size: 2000000000, modifiedAt: '2026-03-30T00:00:00Z', digest: 'abc123' },
        { name: 'qwen2.5:0.5b', size: 398000000, modifiedAt: '2026-03-30T00:00:00Z', digest: 'def456' },
      ])
      const result = await listModels()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].name).toBe('llama3.2:latest')
      expect(result.data![1].size).toBe(398000000)
    })

    it('returns empty when no models', async () => {
      await mockWebFetch([])
      const result = await listModels()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(0)
    })

    it('returns error when server not running', async () => {
      await mockWebFetchFail('connection refused')
      const result = await listModels()
      expect(result.success).toBe(false)
    })
  })

  describe('pullModel', () => {
    it('pulls model successfully', async () => {
      await mockWebFetchSequence(
        { installed: true, version: '0.19.0' },
        { status: 'pulling manifest... success' }
      )
      const result = await pullModel('llama3.2')
      expect(result.success).toBe(true)
      expect(result.data).toContain('success')
    })

    it('pulls models through tauri-safe ollama commands', async () => {
      const { execCommand, getIsTauri } = await platformMocks()
      getIsTauri.mockReturnValue(true)
      execCommand
        .mockResolvedValueOnce('ollama version 0.19.0')
        .mockResolvedValueOnce('ollama version 0.19.0')
        .mockResolvedValueOnce('pulling manifest... success')

      const result = await pullModel('llama3.2')

      expect(result.success).toBe(true)
      expect(execCommand).toHaveBeenLastCalledWith('ollama', ['pull', 'llama3.2'])
      expect(execCommand).not.toHaveBeenCalledWith('node', expect.anything())
    })
  })

  describe('deleteModel', () => {
    it('deletes model successfully', async () => {
      await mockWebFetchSequence(
        { installed: true, version: '0.19.0' },
        { status: 'deleted llama3.2' }
      )
      const result = await deleteModel('llama3.2')
      expect(result.success).toBe(true)
    })
  })

  describe('getOllamaStatus', () => {
    it('returns full status when running with models', async () => {
      await mockWebFetch({
        installed: true,
        version: '0.19.0',
        running: true,
        models: [{ name: 'qwen2.5:0.5b', size: 398000000, modifiedAt: '2026-03-30', digest: 'abc' }],
      })
      const result = await getOllamaStatus()
      expect(result.success).toBe(true)
      expect(result.data!.installed).toBe(true)
      expect(result.data!.running).toBe(true)
      expect(result.data!.models).toHaveLength(1)
      expect(result.data!.version).toContain('0.19.0')
    })

    it('returns installed but not running', async () => {
      await mockWebFetch({
        installed: true,
        version: '0.19.0',
        running: false,
        models: [],
      })
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
