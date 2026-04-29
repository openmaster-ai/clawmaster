import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkClawmasterReleaseResult,
  compareReleaseVersions,
  isNewerRelease,
  selectInstallerAsset,
  type ClawmasterRelease,
} from '../clawmasterReleases'

vi.mock('@/shared/adapters/platform', () => ({
  getIsTauri: () => false,
}))

function release(overrides: Partial<ClawmasterRelease> = {}): ClawmasterRelease {
  return {
    version: '0.3.1',
    tagName: 'v0.3.1',
    name: 'v0.3.1',
    body: 'Release notes',
    publishedAt: '2026-04-24T00:00:00.000Z',
    htmlUrl: 'https://github.com/openmaster-ai/clawmaster/releases/tag/v0.3.1',
    assets: [],
    ...overrides,
  }
}

describe('clawmaster release adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('compares stable release versions', () => {
    expect(compareReleaseVersions('v0.3.1', '0.3.0')).toBeGreaterThan(0)
    expect(compareReleaseVersions('0.3.0', 'v0.3.1')).toBeLessThan(0)
    expect(isNewerRelease('v0.3.0', '0.3.0')).toBe(false)
  })

  it('selects the best installer asset for each platform', () => {
    const item = release({
      assets: [
        { name: 'ClawMaster_0.3.1_x64-setup.exe', url: 'https://example.com/app.exe' },
        { name: 'ClawMaster_0.3.1_x64.msi', url: 'https://example.com/app.msi' },
        { name: 'ClawMaster_0.3.1_aarch64.dmg', url: 'https://example.com/app.dmg' },
        { name: 'ClawMaster_0.3.1_amd64.AppImage', url: 'https://example.com/app.AppImage' },
      ],
    })

    expect(selectInstallerAsset(item, 'Win32')?.url).toBe('https://example.com/app.msi')
    expect(selectInstallerAsset(item, 'MacIntel')?.url).toBe('https://example.com/app.dmg')
    expect(selectInstallerAsset(item, 'Linux x86_64')?.url).toBe('https://example.com/app.AppImage')
  })

  it('falls back to npm metadata when GitHub has no release details', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('api.github.com')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (url.includes('/api/npm/clawmaster-versions')) {
        return Promise.resolve(new Response(JSON.stringify({
          versions: ['9.9.9', '0.3.0'],
          distTags: { latest: '9.9.9' },
        }), { status: 200 }))
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })

    const result = await checkClawmasterReleaseResult()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(true)
    expect(result.data?.source).toBe('npm')
    expect(result.data?.latestVersion).toBe('9.9.9')
    expect(result.data?.hasUpdate).toBe(true)
  })
})
