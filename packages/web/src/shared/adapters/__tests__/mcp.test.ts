import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMcpServers, addMcpServer, removeMcpServer, toggleMcpServer, installMcpPackage, checkMcpPackage } from '../mcp'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('mcp adapter', () => {
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

  describe('getMcpServers', () => {
    it('parses config file with servers', async () => {
      const config = {
        mcpServers: {
          context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: {}, enabled: true },
          github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test' }, enabled: false },
        },
      }
      await mockExec(JSON.stringify(config))
      const result = await getMcpServers()
      expect(result.success).toBe(true)
      expect(Object.keys(result.data!)).toHaveLength(2)
      expect(result.data!.context7.enabled).toBe(true)
      expect(result.data!.github.enabled).toBe(false)
      expect(result.data!.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_test')
    })

    it('returns empty when file not found', async () => {
      await mockExecFail('No such file')
      const result = await getMcpServers()
      expect(result.success).toBe(true)
      expect(result.data).toEqual({})
    })
  })

  describe('addMcpServer', () => {
    it('installs package and writes config', async () => {
      const config = { command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: {}, enabled: true }
      // npm install, cat config (fails = empty), write config
      await mockExecSequence(
        'added 1 package',
        new Error('No such file'),
        'ok',
      )
      const result = await addMcpServer('context7', config, '@upstash/context7-mcp')
      expect(result.success).toBe(true)
      expect(result.data).toBe('installed')
    })

    it('returns error when npm install fails', async () => {
      const config = { command: 'npx', args: ['-y', 'bad-pkg'], env: {}, enabled: true }
      await mockExecFail('npm ERR! 404')
      const result = await addMcpServer('bad', config, 'bad-pkg')
      expect(result.success).toBe(false)
    })
  })

  describe('removeMcpServer', () => {
    it('removes server from config', async () => {
      const existing = JSON.stringify({
        mcpServers: { context7: { command: 'npx', args: [], env: {}, enabled: true } },
      })
      await mockExecSequence(existing, 'ok')
      const result = await removeMcpServer('context7')
      expect(result.success).toBe(true)
      expect(result.data).toBe('removed')
    })
  })

  describe('toggleMcpServer', () => {
    it('toggles enabled flag', async () => {
      const existing = JSON.stringify({
        mcpServers: { github: { command: 'npx', args: [], env: {}, enabled: true } },
      })
      await mockExecSequence(existing, 'ok')
      const result = await toggleMcpServer('github', false)
      expect(result.success).toBe(true)
      expect(result.data).toBe('disabled')
    })

    it('returns not found for missing server', async () => {
      await mockExecSequence(JSON.stringify({ mcpServers: {} }))
      const result = await toggleMcpServer('nonexistent', true)
      expect(result.success).toBe(true)
      expect(result.data).toBe('not found')
    })
  })

  describe('installMcpPackage', () => {
    it('installs npm package', async () => {
      await mockExec('added 5 packages')
      const result = await installMcpPackage('@upstash/context7-mcp')
      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      await mockExecFail('npm ERR! 404')
      const result = await installMcpPackage('nonexistent-pkg')
      expect(result.success).toBe(false)
    })
  })

  describe('checkMcpPackage', () => {
    it('returns true when installed', async () => {
      await mockExec('{"dependencies":{}}')
      const result = await checkMcpPackage('@upstash/context7-mcp')
      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('returns false when not installed', async () => {
      await mockExecFail('not found')
      const result = await checkMcpPackage('nonexistent')
      expect(result.success).toBe(true)
      expect(result.data).toBe(false)
    })
  })
})
