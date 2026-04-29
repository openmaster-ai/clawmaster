import type {
  WikiAssistPayload,
  WikiEvolvePayload,
  WikiIngestInput,
  WikiIngestPayload,
  WikiLinkChoicePayload,
  WikiLintPayload,
  WikiPageDetail,
  WikiPageSummary,
  WikiQueryPayload,
  WikiSearchResult,
  WikiStatusPayload,
  WikiSynthesizeInput,
  WikiSynthesizePayload,
} from '@/lib/types'
import { getIsTauri } from '@/shared/adapters/platform'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail } from '@/shared/adapters/types'
import { webFetchJson } from '@/shared/adapters/webHttp'

function desktopWikiUnavailable<T>(): AdapterResult<T> {
  return fail('Wiki actions are available in web/backend mode first. Desktop commands will be added after the backend API stabilizes.')
}

export async function wikiStatusResult(): Promise<AdapterResult<WikiStatusPayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiStatusPayload>('/api/wiki/status')
}

export async function wikiPagesResult(): Promise<AdapterResult<WikiPageSummary[]>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiPageSummary[]>('/api/wiki/pages')
}

export async function wikiPageResult(pageId: string): Promise<AdapterResult<WikiPageDetail>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiPageDetail>(`/api/wiki/pages/${encodeURIComponent(pageId)}`)
}

export async function wikiSearchResult(
  query: string,
  options?: { limit?: number },
): Promise<AdapterResult<WikiSearchResult[]>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiSearchResult[]>('/api/wiki/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: options?.limit }),
  })
}

export async function wikiIngestResult(input: WikiIngestInput): Promise<AdapterResult<WikiIngestPayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiIngestPayload>('/api/wiki/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function wikiQueryResult(
  query: string,
  options?: { limit?: number },
): Promise<AdapterResult<WikiQueryPayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiQueryPayload>('/api/wiki/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: options?.limit }),
  })
}

export async function wikiAssistResult(
  question: string,
  options?: { limit?: number },
): Promise<AdapterResult<WikiAssistPayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiAssistPayload>('/api/wiki/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, limit: options?.limit }),
  })
}

export async function wikiLinkChoiceResult(input: string): Promise<AdapterResult<WikiLinkChoicePayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiLinkChoicePayload>('/api/wiki/link-choice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
}

export async function wikiSynthesizeResult(input: WikiSynthesizeInput): Promise<AdapterResult<WikiSynthesizePayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiSynthesizePayload>('/api/wiki/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function wikiLintResult(): Promise<AdapterResult<WikiLintPayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiLintPayload>('/api/wiki/lint', { method: 'POST' })
}

export async function wikiEvolveResult(): Promise<AdapterResult<WikiEvolvePayload>> {
  if (getIsTauri()) return desktopWikiUnavailable()
  return webFetchJson<WikiEvolvePayload>('/api/wiki/evolve', { method: 'POST' })
}
