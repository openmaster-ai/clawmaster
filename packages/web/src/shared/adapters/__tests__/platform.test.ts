import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectCommandVersion, isTauri } from '../platform'

// Mock the web fetch path that execCommand uses internally
vi.stubGlobal('fetch', vi.fn())

describe('platform utilities', () => {
  describe('isTauri', () => {
    it('returns false in test environment', () => {
      expect(isTauri()).toBe(false)
    })
  })

  describe('detectCommandVersion', () => {
    beforeEach(() => {
      vi.mocked(fetch).mockReset()
    })

    it('parses semver version from output', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: 'v18.19.0' }),
      } as Response)

      const result = await detectCommandVersion('node')
      expect(result.installed).toBe(true)
      expect(result.version).toBe('18.19.0')
    })

    it('parses version without v prefix', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: '3.14.0' }),
      } as Response)

      const result = await detectCommandVersion('pip')
      expect(result.installed).toBe(true)
      expect(result.version).toBe('3.14.0')
    })

    it('returns trimmed output when no semver found', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ stdout: 'some-tool alpha' }),
      } as Response)

      const result = await detectCommandVersion('some-tool')
      expect(result.installed).toBe(true)
      expect(result.version).toBe('some-tool alpha')
    })

    it('returns not installed when command fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'command not found',
      } as Response)

      const result = await detectCommandVersion('nonexistent')
      expect(result.installed).toBe(false)
      expect(result.version).toBe('')
    })

    it('returns not installed when fetch throws', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network error'))

      const result = await detectCommandVersion('broken')
      expect(result.installed).toBe(false)
      expect(result.version).toBe('')
    })
  })
})
