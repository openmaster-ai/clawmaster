import { CLAWMASTER_VERSION } from '@/lib/appVersion'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

const CLAWMASTER_REPO = 'openmaster-ai/clawmaster'
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${CLAWMASTER_REPO}/releases?per_page=10`
const GITHUB_RELEASE_TIMEOUT_MS = 3000

export interface ClawmasterNpmVersions {
  versions: string[]
  distTags: Record<string, string>
}

export interface ClawmasterReleaseAsset {
  name: string
  url: string
}

export interface ClawmasterRelease {
  version: string
  tagName: string
  name: string
  body: string
  publishedAt: string
  htmlUrl: string
  assets: ClawmasterReleaseAsset[]
}

export interface ClawmasterReleaseCheck {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  source: 'github' | 'npm'
  releases: ClawmasterRelease[]
  latestRelease: ClawmasterRelease | null
}

interface GitHubReleaseApiItem {
  tag_name?: unknown
  name?: unknown
  body?: unknown
  published_at?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: unknown
}

interface GitHubReleaseAssetApiItem {
  name?: unknown
  browser_download_url?: unknown
}

export function normalizeReleaseVersion(value: string | undefined | null): string {
  const raw = String(value ?? '').replace(/^v/i, '').trim()
  const match = raw.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
  return match ? match[0] : raw
}

function semverParts(value: string): [number, number, number] | null {
  const match = normalizeReleaseVersion(value).match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareReleaseVersions(left: string, right: string): number {
  const l = semverParts(left)
  const r = semverParts(right)
  if (!l || !r) return normalizeReleaseVersion(left).localeCompare(normalizeReleaseVersion(right))
  for (let i = 0; i < 3; i += 1) {
    if (l[i] !== r[i]) return l[i] - r[i]
  }
  return 0
}

export function isNewerRelease(latest: string, current: string): boolean {
  return compareReleaseVersions(latest, current) > 0
}

function parseGitHubRelease(item: GitHubReleaseApiItem): ClawmasterRelease | null {
  if (item.draft === true || item.prerelease === true) return null
  const tagName = typeof item.tag_name === 'string' ? item.tag_name : ''
  const version = normalizeReleaseVersion(tagName)
  if (!semverParts(version)) return null
  const apiAssets = Array.isArray(item.assets) ? item.assets as GitHubReleaseAssetApiItem[] : []
  const assets = apiAssets
    .map((asset) => ({
      name: typeof asset.name === 'string' ? asset.name : '',
      url: typeof asset.browser_download_url === 'string' ? asset.browser_download_url : '',
    }))
    .filter((asset) => asset.name && asset.url)

  return {
    version,
    tagName,
    name: typeof item.name === 'string' ? item.name : tagName,
    body: typeof item.body === 'string' ? item.body : '',
    publishedAt: typeof item.published_at === 'string' ? item.published_at : '',
    htmlUrl: typeof item.html_url === 'string' ? item.html_url : '',
    assets,
  }
}

export async function fetchClawmasterGitHubReleases(
  timeoutMs = GITHUB_RELEASE_TIMEOUT_MS
): Promise<ClawmasterRelease[]> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(GITHUB_RELEASES_URL, { signal: controller.signal })
    if (!response.ok) return []
    const data = await response.json() as unknown
    if (!Array.isArray(data)) return []
    return data
      .map((item) => parseGitHubRelease(item as GitHubReleaseApiItem))
      .filter((item): item is ClawmasterRelease => Boolean(item))
      .sort((a, b) => compareReleaseVersions(b.version, a.version))
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function listClawmasterNpmVersionsResult(): Promise<
  AdapterResult<ClawmasterNpmVersions>
> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<ClawmasterNpmVersions>('list_clawmaster_npm_versions')
    )
  }
  return webFetchJson<ClawmasterNpmVersions>('/api/npm/clawmaster-versions')
}

export function selectInstallerAsset(
  release: ClawmasterRelease | null,
  platform: string | undefined
): ClawmasterReleaseAsset | null {
  if (!release) return null
  const normalized = (platform ?? '').toLowerCase()
  const names = release.assets.map((asset) => ({ asset, name: asset.name.toLowerCase() }))

  const pick = (extensions: string[]) =>
    names.find(({ name }) => extensions.some((extension) => name.endsWith(extension)))?.asset ?? null

  if (normalized.includes('mac') || normalized.includes('darwin')) {
    return pick(['.dmg']) ?? pick(['.zip'])
  }
  if (normalized.includes('win')) {
    return pick(['.msi']) ?? pick(['.exe'])
  }
  if (normalized.includes('linux')) {
    return pick(['.appimage']) ?? pick(['.deb']) ?? pick(['.rpm'])
  }
  return null
}

export async function checkClawmasterReleaseResult(): Promise<
  AdapterResult<ClawmasterReleaseCheck>
> {
  const currentVersion = normalizeReleaseVersion(CLAWMASTER_VERSION)

  try {
    const releases = await fetchClawmasterGitHubReleases()
    const latestRelease = releases[0] ?? null
    if (latestRelease) {
      return {
        success: true,
        data: {
          currentVersion,
          latestVersion: latestRelease.version,
          hasUpdate: isNewerRelease(latestRelease.version, currentVersion),
          source: 'github',
          releases,
          latestRelease,
        },
      }
    }
  } catch {
    // Fall through to npm metadata; GitHub can be slow behind proxies.
  }

  const npm = await listClawmasterNpmVersionsResult()
  if (!npm.success || !npm.data) {
    return {
      success: false,
      error: npm.error,
    }
  }

  const latestVersion = normalizeReleaseVersion(
    npm.data.distTags.latest ?? npm.data.versions[0]
  )
  return {
    success: true,
    data: {
      currentVersion,
      latestVersion,
      hasUpdate: Boolean(latestVersion) && isNewerRelease(latestVersion, currentVersion),
      source: 'npm',
      releases: [],
      latestRelease: null,
    },
  }
}
