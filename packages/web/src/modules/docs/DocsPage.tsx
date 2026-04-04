import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { execCommand } from '@/shared/adapters/platform'

interface DocResult {
  title: string
  url: string
  snippet: string
}

export default function Docs() {
  const { t } = useTranslation()

  const QUICK_LINKS = [
    { label: t('docs.quickStart'), url: 'https://docs.openclaw.ai/quickstart', desc: t('docs.quickStartDesc') },
    { label: t('docs.cliRef'), url: 'https://docs.openclaw.ai/cli', desc: t('docs.cliRefDesc') },
    { label: t('docs.channelConfig'), url: 'https://docs.openclaw.ai/channels', desc: t('docs.channelConfigDesc') },
    { label: t('docs.modelConfig'), url: 'https://docs.openclaw.ai/models', desc: t('docs.modelConfigDesc') },
    { label: t('docs.skillDev'), url: 'https://docs.openclaw.ai/skills', desc: t('docs.skillDevDesc') },
    { label: t('docs.securityGuide'), url: 'https://docs.openclaw.ai/security', desc: t('docs.securityGuideDesc') },
  ]
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DocResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    setSearched(true)
    try {
      const raw = await execCommand('openclaw', ['docs', query.trim()])
      // Parse the text output into results
      const parsed = parseDocsOutput(raw)
      setResults(parsed)
    } catch (err) {
      setError(t('docs.searchFailed'))
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="page-shell page-shell-prose">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('docs.title')}</h1>
          <p className="page-subtitle">{t('docs.commonDocs')}</p>
        </div>
      </div>

      <div className="toolbar-card">
        <input
          type="text"
          placeholder={t('docs.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="control-input flex-1"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="button-primary"
        >
          {searching ? t('common.searching') : t('common.search')}
        </button>
      </div>

      {/* 搜索结果 */}
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground">{t('docs.resultCount', { count: results.length })}</h3>
          {results.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="list-card block transition hover:border-primary/50"
            >
              <p className="font-medium text-primary">{r.title}</p>
              {r.url && <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.url}</p>}
              {r.snippet && <p className="text-sm text-muted-foreground mt-1">{r.snippet}</p>}
            </a>
          ))}
        </div>
      )}
      {searched && !searching && results.length === 0 && !error && (
        <div className="state-panel min-h-0 py-8 text-muted-foreground">{t('docs.noResults')}</div>
      )}

      {/* 快速链接 */}
      {!searched && (
        <div>
          <h3 className="font-medium mb-3">{t('docs.commonDocs')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="list-card transition hover:border-primary/50"
              >
                <p className="font-medium">{link.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{link.desc}</p>
              </a>
            ))}
          </div>
          <a
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block text-sm text-primary hover:underline"
          >
            {t('docs.openFullDocs')} &rarr;
          </a>
        </div>
      )}
    </div>
  )
}

/** Parse openclaw docs text output into structured results */
function parseDocsOutput(raw: string): DocResult[] {
  const results: DocResult[] = []
  const lines = raw.trim().split('\n').filter(l => l.trim())

  let current: Partial<DocResult> = {}
  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/[^\s]+/)
    if (urlMatch && !current.url) {
      current.url = urlMatch[0]
      // Title is the part before the URL or the whole line
      const title = line.replace(urlMatch[0], '').replace(/[-–—|]\s*$/, '').trim()
      if (title) current.title = title
    } else if (current.url && !current.snippet) {
      current.snippet = line.trim()
    }

    // If we have enough for a result, push it
    if (current.url && (current.snippet || current.title)) {
      results.push({
        title: current.title || current.url,
        url: current.url,
        snippet: current.snippet || '',
      })
      current = {}
    }
  }

  // Push last partial result
  if (current.url) {
    results.push({
      title: current.title || current.url,
      url: current.url,
      snippet: current.snippet || '',
    })
  }

  // If no structured results, treat each non-empty line as a result
  if (results.length === 0 && lines.length > 0) {
    results.push({
      title: '搜索结果',
      url: 'https://docs.openclaw.ai',
      snippet: lines.join('\n'),
    })
  }

  return results
}
