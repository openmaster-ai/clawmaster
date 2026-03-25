import { describe, it, expect, vi } from 'vitest'
import { listInstalledSkills, searchSkills, installSkill, uninstallSkill } from '../clawhub'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('clawhub adapter', () => {
  async function mockExec(output: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(output)
  }

  async function mockExecFail(msg: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockRejectedValue(new Error(msg))
  }

  describe('listInstalledSkills', () => {
    it('parses array response', async () => {
      const skills = [
        { slug: 'weather', name: 'weather', description: 'Get weather', version: '1.2.0' },
        { slug: 'feishu-doc', name: 'feishu-doc', description: 'Feishu docs', version: '2026.3.7' },
      ]
      await mockExec(JSON.stringify(skills))
      const result = await listInstalledSkills()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].slug).toBe('weather')
      expect(result.data![0].installed).toBe(true)
    })

    it('handles wrapped response', async () => {
      await mockExec(JSON.stringify({ skills: [{ name: 'test', description: 'test skill', version: '1.0' }] }))
      const result = await listInstalledSkills()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })

    it('returns error when clawhub not available', async () => {
      await mockExecFail('command not found: clawhub')
      const result = await listInstalledSkills()
      expect(result.success).toBe(false)
      expect(result.error).toContain('clawhub')
    })
  })

  describe('searchSkills', () => {
    it('searches and returns results', async () => {
      const results = [
        { slug: 'paddleocr-doc-parsing', name: 'PaddleOCR Doc Parsing', description: 'Document parsing', version: '1.0' },
      ]
      await mockExec(JSON.stringify(results))
      const result = await searchSkills('paddleocr')
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data![0].installed).toBe(false)
    })
  })

  describe('installSkill', () => {
    it('installs successfully', async () => {
      await mockExec('Installed paddleocr-doc-parsing v1.0')
      const result = await installSkill('paddleocr-doc-parsing')
      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      await mockExecFail('skill not found')
      const result = await installSkill('nonexistent')
      expect(result.success).toBe(false)
    })
  })

  describe('uninstallSkill', () => {
    it('uninstalls successfully', async () => {
      await mockExec('Uninstalled weather')
      const result = await uninstallSkill('weather')
      expect(result.success).toBe(true)
    })
  })
})
