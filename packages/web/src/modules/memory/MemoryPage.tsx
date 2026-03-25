import { useState, useCallback } from 'react'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoadingState } from '@/shared/components/LoadingState'
import {
  getMemoryHealth,
  listMemories,
  searchMemories,
  getMemoryStats,
  getAgentIds,
  deleteMemory,
  type MemoryHealth,
  type MemorySearchResult,
  type MemoryStats,
} from '@/shared/adapters/powermem'
import MemoryHealthCard from './components/MemoryHealthCard'
import MemoryStatsCard from './components/MemoryStatsCard'
import MemoryList from './components/MemoryList'

export default function MemoryPage() {
  return (
    <ErrorBoundary>
      <MemoryContent />
    </ErrorBoundary>
  )
}

function MemoryContent() {
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<MemorySearchResult | null>(null)

  const health = useAdapterCall<MemoryHealth>(() => getMemoryHealth())
  const stats = useAdapterCall<MemoryStats>(() => getMemoryStats())
  const agents = useAdapterCall<string[]>(() => getAgentIds())

  const memories = useAdapterCall<MemorySearchResult>(
    () => listMemories(selectedAgent, 50, 0),
    { pollInterval: 30000 },
  )

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResult(null)
      return
    }
    setIsSearching(true)
    try {
      const result = await searchMemories(searchQuery, selectedAgent)
      if (result.success && result.data) {
        setSearchResult(result.data)
      }
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, selectedAgent])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定删除这条记忆？')) return
    const result = await deleteMemory(id)
    if (result.success) {
      memories.refetch()
      stats.refetch()
    }
  }, [memories, stats])

  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgent(agentId || undefined)
    setSearchResult(null)
  }, [])

  const isLoading = health.loading && memories.loading && !health.data && !memories.data

  if (isLoading) return <LoadingState message="正在获取记忆数据..." />

  const hasError = health.error && memories.error
  const displayData = searchResult ?? memories.data

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">记忆管理</h1>

      {hasError && !displayData ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-2">无法获取记忆数据</p>
          <p className="text-sm text-muted-foreground mb-4">
            请确保 PowerMem 已安装（openclaw plugins install memory-powermem）
          </p>
          <button
            onClick={() => { health.refetch(); memories.refetch(); stats.refetch() }}
            className="px-4 py-2 border border-border rounded hover:bg-accent"
          >
            重试
          </button>
        </div>
      ) : (
        <>
          {/* 健康状态 + 统计 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MemoryHealthCard data={health.data} />
            <MemoryStatsCard data={stats.data} />
          </div>

          {/* Agent 切换 + 搜索 */}
          <div className="flex gap-3">
            <select
              value={selectedAgent ?? ''}
              onChange={(e) => handleAgentChange(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded"
            >
              <option value="">全部 Agent</option>
              {agents.data?.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                placeholder="搜索记忆..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-4 py-2 bg-muted rounded border border-border"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
              >
                {isSearching ? '搜索中...' : '搜索'}
              </button>
              {searchResult && (
                <button
                  onClick={() => { setSearchResult(null); setSearchQuery('') }}
                  className="px-3 py-2 border border-border rounded hover:bg-accent"
                >
                  清除
                </button>
              )}
            </div>
          </div>

          {/* 记忆列表 */}
          <MemoryList
            data={displayData}
            loading={memories.loading}
            isSearch={!!searchResult}
            onDelete={handleDelete}
            onRefresh={memories.refetch}
          />
        </>
      )}
    </div>
  )
}
