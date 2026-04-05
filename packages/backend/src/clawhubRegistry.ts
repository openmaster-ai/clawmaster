import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const CLAWHUB_BASE_URL = (process.env.OPENCLAW_CLAWHUB_URL ?? process.env.CLAWHUB_URL ?? 'https://clawhub.ai').replace(/\/+$/, '')

type ClawhubSearchResponse = {
  results?: Array<{
    slug?: string
    displayName?: string
    summary?: string
    version?: string | null
  }>
}

export async function searchClawhubSkills(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = new URL('/api/v1/search', `${CLAWHUB_BASE_URL}/`)
  url.searchParams.set('q', trimmed)

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ClawMaster/0.1 skills-search',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `ClawHub search failed (${res.status})`)
  }

  const data = (await res.json()) as ClawhubSearchResponse
  return (data.results ?? [])
    .filter((item) => typeof item?.slug === 'string' && item.slug.trim())
    .map((item) => ({
      slug: item.slug!.trim(),
      name: typeof item.displayName === 'string' && item.displayName.trim() ? item.displayName.trim() : item.slug!.trim(),
      description: typeof item.summary === 'string' ? item.summary : '',
      version: typeof item.version === 'string' && item.version.trim() ? item.version.trim() : 'unknown',
      installed: false,
      skillKey: item.slug!.trim(),
      source: 'clawhub-registry',
      bundled: false,
    }))
}

export async function installSkillWithClawhub(slug: string): Promise<void> {
  const normalized = slug.trim()
  if (!normalized) throw new Error('Missing slug')
  await execFileAsync('clawhub', ['install', normalized], { shell: false })
}
