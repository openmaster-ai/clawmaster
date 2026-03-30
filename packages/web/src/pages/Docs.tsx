import { useState } from 'react'
import { execCommand } from '@/shared/adapters/platform'

interface DocResult {
  title: string
  url: string
  snippet: string
}

const QUICK_LINKS = [
  { label: '快速开始', url: 'https://docs.openclaw.ai/quickstart', desc: '安装、配置、发送第一条消息' },
  { label: 'CLI 参考', url: 'https://docs.openclaw.ai/cli', desc: 'openclaw 命令行完整文档' },
  { label: '通道配置', url: 'https://docs.openclaw.ai/channels', desc: 'Telegram、Discord、Slack、飞书' },
  { label: '模型配置', url: 'https://docs.openclaw.ai/models', desc: '提供商 API Key、模型选择、备选链' },
  { label: '技能开发', url: 'https://docs.openclaw.ai/skills', desc: '创建和发布自定义技能' },
  { label: '安全指南', url: 'https://docs.openclaw.ai/security', desc: 'Token 管理、沙箱、权限' },
]

export default function Docs() {
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
      setError('搜索失败，请检查网络连接')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">文档</h1>

      {/* 搜索 */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="搜索 OpenClaw 文档..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-4 py-2 bg-card rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
        >
          {searching ? '搜索中...' : '搜索'}
        </button>
      </div>

      {/* 搜索结果 */}
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground">{results.length} 条结果</h3>
          {results.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition"
            >
              <p className="font-medium text-primary">{r.title}</p>
              {r.url && <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.url}</p>}
              {r.snippet && <p className="text-sm text-muted-foreground mt-1">{r.snippet}</p>}
            </a>
          ))}
        </div>
      )}
      {searched && !searching && results.length === 0 && !error && (
        <p className="text-muted-foreground text-center py-4">未找到相关文档</p>
      )}

      {/* 快速链接 */}
      {!searched && (
        <div>
          <h3 className="font-medium mb-3">常用文档</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition"
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
            打开完整文档站 &rarr;
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
