import { useState, useCallback } from 'react'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoadingState } from '@/shared/components/LoadingState'
import { CapabilityGuard } from '@/shared/components/CapabilityGuard'
import {
  getMemoryHealth,
  listMemories,
  searchMemories,
  getMemoryStats,
  getAgentIds,
  deleteMemory,
  updateMemory,
  addMemory,
  isPowerMemServerRunning,
  startPowerMemServer,
  type MemoryHealth,
  type MemoryListResult,
  type MemorySearchResult,
  type MemoryStats,
} from '@/shared/adapters/powermem'
import MemoryHealthCard from './components/MemoryHealthCard'
import MemoryStatsCard from './components/MemoryStatsCard'
import MemoryList from './components/MemoryList'

async function checkMemoryAvailable(): Promise<boolean> {
  const result = await getMemoryHealth()
  return result.success && result.data?.status !== 'disconnected'
}

export default function MemoryPage() {
  return (
    <ErrorBoundary>
      <CapabilityGuard
        capabilityId="memory"
        checkAvailable={checkMemoryAvailable}
        unavailableMessage="记忆管理需要安装 PowerMem。安装后可管理 Agent 长期记忆，Token 消耗降低 96%。"
      >
        <MemoryContent />
      </CapabilityGuard>
    </ErrorBoundary>
  )
}

function MemoryContent() {
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<MemorySearchResult | null>(null)
  const [serverStarting, setServerStarting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)

  const health = useAdapterCall<MemoryHealth>(() => getMemoryHealth(), { pollInterval: 30000 })
  const serverRunning = useAdapterCall<boolean>(() => isPowerMemServerRunning(), { pollInterval: 15000 })
  const stats = useAdapterCall<MemoryStats>(() => getMemoryStats())
  const agents = useAdapterCall<string[]>(() => getAgentIds())
  const memories = useAdapterCall<MemoryListResult>(
    () => listMemories(selectedAgent, undefined, 50, 0),
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

  const handleEdit = useCallback(async (id: string, content: string) => {
    const result = await updateMemory(id, content)
    if (result.success) {
      memories.refetch()
    }
  }, [memories])

  const handleAdd = useCallback(async () => {
    if (!addText.trim()) return
    setAdding(true)
    try {
      const result = await addMemory(addText, {
        agentId: selectedAgent,
        infer: true,
      })
      if (result.success) {
        setAddText('')
        setShowAddForm(false)
        memories.refetch()
        stats.refetch()
      }
    } finally {
      setAdding(false)
    }
  }, [addText, selectedAgent, memories, stats])

  const handleStartServer = useCallback(async () => {
    setServerStarting(true)
    try {
      await startPowerMemServer()
      // 等几秒让服务启动
      await new Promise((r) => setTimeout(r, 3000))
      serverRunning.refetch()
      health.refetch()
    } finally {
      setServerStarting(false)
    }
  }, [serverRunning, health])

  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgent(agentId || undefined)
    setSearchResult(null)
  }, [])

  const isLoading = health.loading && memories.loading && !health.data && !memories.data
  if (isLoading) return <LoadingState message="正在获取记忆数据..." />

  const hasError = health.data?.status === 'disconnected'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">记忆管理</h1>

      {hasError ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground mb-2">无法连接到 PowerMem 记忆服务</p>
          <p className="text-sm text-muted-foreground mb-4">
            请确保 PowerMem 已安装并启动（powermem-server --port 8000）
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={handleStartServer}
              disabled={serverStarting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
            >
              {serverStarting ? '启动中...' : '一键启动服务'}
            </button>
            <button
              onClick={() => { health.refetch(); memories.refetch(); stats.refetch() }}
              className="px-4 py-2 border border-border rounded hover:bg-accent"
            >
              重试
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 健康状态 + 统计 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MemoryHealthCard
              data={health.data}
              serverRunning={serverRunning.data}
              onStartServer={handleStartServer}
              starting={serverStarting}
            />
            <MemoryStatsCard data={stats.data} />
          </div>

          {/* Agent 切换 + 搜索 + 添加 */}
          <div className="flex gap-3 flex-wrap">
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
            <div className="flex-1 flex gap-2 min-w-[200px]">
              <input
                type="text"
                placeholder="语义搜索记忆..."
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
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 border border-border rounded hover:bg-accent"
            >
              {showAddForm ? '取消' : '+ 添加记忆'}
            </button>
          </div>

          {/* 添加记忆表单 */}
          {showAddForm && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h4 className="font-medium mb-2">添加新记忆</h4>
              <p className="text-xs text-muted-foreground mb-2">
                输入的内容将通过 AI 智能提取关键事实后存储（infer 模式）
              </p>
              <textarea
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder="输入要记忆的内容..."
                className="w-full h-24 text-sm bg-background p-3 rounded border border-border resize-none mb-2"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !addText.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
              >
                {adding ? '保存中...' : '智能提取并保存'}
              </button>
            </div>
          )}

          {/* 记忆列表 */}
          <MemoryList
            listData={memories.data}
            searchData={searchResult}
            isSearch={!!searchResult}
            loading={memories.loading}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onRefresh={memories.refetch}
          />
        </>
      )}
    </div>
  )
}
