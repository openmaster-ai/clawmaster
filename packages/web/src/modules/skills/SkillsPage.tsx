import { useCallback, useState } from 'react'
import { platformResults } from '@/adapters'
import type { SkillInfo } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'

export default function Skills() {
  const [view, setView] = useState<'installed' | 'market'>('installed')
  const [searchQuery, setSearchQuery] = useState('')
  const [marketQuery, setMarketQuery] = useState('')
  const [marketSkills, setMarketSkills] = useState<SkillInfo[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError] = useState<string | null>(null)

  const fetcher = useCallback(async () => platformResults.getSkills(), [])
  const { data: installedSkillsRaw, loading, error, refetch } = useAdapterCall(fetcher)
  const installedSkills = installedSkillsRaw ?? []

  async function runMarketSearch() {
    const q = marketQuery.trim()
    if (!q) {
      setMarketSkills([])
      setMarketError(null)
      return
    }
    setMarketLoading(true)
    setMarketError(null)
    const r = await platformResults.searchSkills(q)
    setMarketLoading(false)
    if (!r.success) {
      setMarketSkills([])
      setMarketError(r.error ?? '搜索失败')
      return
    }
    setMarketSkills(r.data ?? [])
  }

  async function handleUninstall(slug: string) {
    const r = await platformResults.uninstallSkill(slug)
    if (!r.success) {
      alert(`卸载失败：${r.error ?? '未知错误'}`)
      return
    }
    void refetch()
  }

  const listForInstalled = installedSkills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const listForMarket = marketSkills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return <LoadingState message="加载技能列表…" />
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-500">加载失败：{error}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="px-3 py-1.5 border border-border rounded text-sm"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setView('installed')}
          className={`px-4 py-2 rounded ${view === 'installed' ? 'bg-primary text-white' : 'border border-border hover:bg-accent'}`}
        >
          已安装
        </button>
        <button
          type="button"
          onClick={() => setView('market')}
          className={`px-4 py-2 rounded ${view === 'market' ? 'bg-primary text-white' : 'border border-border hover:bg-accent'}`}
        >
          浏览市场
        </button>
      </div>

      <input
        type="text"
        placeholder="🔍 过滤列表..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 bg-muted rounded border border-border"
      />

      {view === 'installed' ? (
        <>
          <h3 className="font-medium">已安装 ({listForInstalled.length})</h3>
          <div className="space-y-3">
            {listForInstalled.map((skill) => (
              <div
                key={skill.slug}
                className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">⚡ {skill.name}</span>
                    <span className="text-sm text-muted-foreground">{skill.version}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleUninstall(skill.slug)}
                    className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent text-red-500"
                  >
                    卸载
                  </button>
                </div>
              </div>
            ))}
          </div>
          {listForInstalled.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无已安装技能，或列表为空。</p>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入关键词搜索 ClawHub…"
              value={marketQuery}
              onChange={(e) => setMarketQuery(e.target.value)}
              className="flex-1 px-3 py-2 bg-muted rounded border border-border"
            />
            <button
              type="button"
              onClick={() => void runMarketSearch()}
              disabled={marketLoading}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {marketLoading ? '搜索中…' : '搜索'}
            </button>
          </div>
          {marketError && <p className="text-sm text-red-500">{marketError}</p>}
          <div className="space-y-3">
            {listForMarket.map((skill) => (
              <div
                key={skill.slug}
                className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{skill.name}</span>
                  <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
                </div>
                <span className="text-xs text-muted-foreground">{skill.version}</span>
              </div>
            ))}
          </div>
          {view === 'market' &&
            !marketLoading &&
            marketQuery &&
            listForMarket.length === 0 &&
            !marketError && (
              <p className="text-sm text-muted-foreground">无结果，请尝试其他关键词。</p>
            )}
          <p className="text-xs text-muted-foreground">
            也可在终端使用：
            <code className="bg-muted px-1 rounded">openclaw skills search &lt;查询&gt;</code>
          </p>
          <a
            href="https://clawhub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm inline-block"
          >
            访问 ClawHub 在线市场 →
          </a>
        </div>
      )}
    </div>
  )
}
