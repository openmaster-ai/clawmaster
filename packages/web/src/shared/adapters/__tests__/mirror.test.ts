import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectMirrors, getMirrorSetupCommands, OFFICIAL_MIRRORS, CN_MIRRORS } from '../mirror'

describe('mirror detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('detectMirrors', () => {
    it('returns official mirrors when network is reachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

      const result = await detectMirrors(1000)
      expect(result.isChina).toBe(false)
      expect(result.mirrors).toBe(OFFICIAL_MIRRORS)
    })

    it('returns CN mirrors when fetch times out', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

      const result = await detectMirrors(100)
      expect(result.isChina).toBe(true)
      expect(result.mirrors).toBe(CN_MIRRORS)
    })

    it('returns CN mirrors when fetch aborts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        const err = new DOMException('aborted', 'AbortError')
        return Promise.reject(err)
      }))

      const result = await detectMirrors(100)
      expect(result.isChina).toBe(true)
      expect(result.mirrors.npm).toBe('https://registry.npmmirror.com')
    })
  })

  describe('getMirrorSetupCommands', () => {
    it('returns empty array for official mirrors', () => {
      const cmds = getMirrorSetupCommands(OFFICIAL_MIRRORS)
      expect(cmds).toEqual([])
    })

    it('returns npm and pip config commands for CN mirrors', () => {
      const cmds = getMirrorSetupCommands(CN_MIRRORS)
      expect(cmds.length).toBeGreaterThan(0)
      expect(cmds[0]).toContain('npmmirror.com')
      expect(cmds[1]).toContain('tuna.tsinghua')
    })
  })

  describe('mirror config values', () => {
    it('CN mirrors have correct URLs', () => {
      expect(CN_MIRRORS.npm).toBe('https://registry.npmmirror.com')
      expect(CN_MIRRORS.pypi).toBe('https://pypi.tuna.tsinghua.edu.cn/simple')
      expect(CN_MIRRORS.nodeDownload).toBe('https://npmmirror.com/mirrors/node')
    })

    it('official mirrors have correct URLs', () => {
      expect(OFFICIAL_MIRRORS.npm).toBe('https://registry.npmjs.org')
      expect(OFFICIAL_MIRRORS.pypi).toBe('https://pypi.org/simple')
    })
  })
})
