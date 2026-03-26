import { useState } from 'react'
import type { MemoryEntry, MemoryListResult, MemorySearchResult, MemorySearchItem } from '@/shared/adapters/powermem'

interface Props {
  listData?: MemoryListResult | null
  searchData?: MemorySearchResult | null
  isSearch: boolean
  loading: boolean
  onDelete: (id: string) => void
  onEdit: (id: string, content: string) => void
  onRefresh: () => void
}

export default function MemoryList({ listData, searchData, isSearch, loading, onDelete, onEdit, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const memories = isSearch
    ? (searchData?.results ?? []).map(toUnified)
    : (listData?.memories ?? []).map(entryToUnified)

  const total = isSearch ? (searchData?.results?.length ?? 0) : (listData?.total ?? 0)

  function handleStartEdit(item: UnifiedMemory) {
    setEditingId(item.id)
    setEditText(item.content)
  }

  function handleSaveEdit() {
    if (editingId && editText.trim()) {
      onEdit(editingId, editText)
      setEditingId(null)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">
          {isSearch ? `搜索结果 (${total})` : `记忆列表 (${total})`}
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1 text-sm border border-border rounded hover:bg-accent disabled:opacity-50"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {memories.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          {isSearch ? '未找到匹配的记忆' : '暂无记忆'}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {memories.map((item) => (
            <MemoryItem
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              editing={editingId === item.id}
              editText={editText}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onDelete={() => onDelete(item.id)}
              onStartEdit={() => handleStartEdit(item)}
              onEditChange={setEditText}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 统一数据结构 ───

interface UnifiedMemory {
  id: string
  content: string
  agentId?: string
  createdAt?: string
  score?: number
  intelligence?: MemoryEntry['metadata'] extends { intelligence?: infer I } ? I : never
  memoryType?: string
  importanceScore?: number
  currentRetention?: number
  nextReview?: string
  accessCount?: number
}

function entryToUnified(m: MemoryEntry): UnifiedMemory {
  return {
    id: m.id,
    content: m.memory,
    agentId: m.agent_id,
    createdAt: m.created_at,
    intelligence: m.metadata?.intelligence,
    memoryType: m.metadata?.intelligence?.memory_type,
    importanceScore: m.metadata?.intelligence?.importance_score,
    currentRetention: m.metadata?.intelligence?.current_retention,
    nextReview: m.metadata?.intelligence?.next_review,
    accessCount: m.metadata?.intelligence?.access_count,
  }
}

function toUnified(s: MemorySearchItem): UnifiedMemory {
  return {
    id: s.memory_id,
    content: s.memory ?? s.content ?? '',
    score: s.score,
    intelligence: s.metadata?.intelligence,
    memoryType: s.metadata?.intelligence?.memory_type,
    importanceScore: s.metadata?.intelligence?.importance_score,
    currentRetention: s.metadata?.intelligence?.current_retention,
  }
}

// ─── 记忆条目 ───

const TYPE_STYLES: Record<string, string> = {
  long_term: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  short_term: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  working: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
}

const TYPE_LABELS: Record<string, string> = {
  long_term: '长期',
  short_term: '短期',
  working: '工作',
}

function MemoryItem({
  item, expanded, editing, editText,
  onToggle, onDelete, onStartEdit, onEditChange, onSaveEdit, onCancelEdit,
}: {
  item: UnifiedMemory
  expanded: boolean
  editing: boolean
  editText: string
  onToggle: () => void
  onDelete: () => void
  onStartEdit: () => void
  onEditChange: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}) {
  const retentionPct = item.currentRetention !== undefined ? Math.round(item.currentRetention * 100) : null
  const retentionColor = retentionPct === null ? '' :
    retentionPct > 70 ? 'text-green-600' :
    retentionPct > 30 ? 'text-yellow-600' : 'text-red-600'

  const importancePct = item.importanceScore !== undefined ? Math.round(item.importanceScore * 100) : null

  return (
    <div className="py-3">
      <div
        className="flex items-start justify-between cursor-pointer hover:bg-accent/30 -mx-2 px-2 py-1 rounded"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{item.content.slice(0, 120)}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* 记忆类型标签 */}
            {item.memoryType && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_STYLES[item.memoryType] ?? 'bg-muted'}`}>
                {TYPE_LABELS[item.memoryType] ?? item.memoryType}
              </span>
            )}
            {/* 重要度 */}
            {importancePct !== null && (
              <span className={`text-xs ${importancePct > 70 ? 'text-red-500' : importancePct > 40 ? 'text-yellow-500' : 'text-gray-400'}`}>
                重要度 {importancePct}%
              </span>
            )}
            {/* 保留率 */}
            {retentionPct !== null && (
              <span className={`text-xs ${retentionColor}`}>
                保留 {retentionPct}%
              </span>
            )}
            {/* 搜索得分 */}
            {item.score !== undefined && (
              <span className="text-xs text-blue-500">匹配 {(item.score * 100).toFixed(0)}%</span>
            )}
            {/* Agent */}
            {item.agentId && (
              <span className="text-xs text-muted-foreground">Agent: {item.agentId}</span>
            )}
            {/* 日期 */}
            {item.createdAt && (
              <span className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs ml-2 flex-shrink-0">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="mt-2 ml-2 pl-4 border-l-2 border-border space-y-2">
          {/* 编辑模式 */}
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => onEditChange(e.target.value)}
                className="w-full h-24 text-sm bg-background p-3 rounded border border-border resize-none"
              />
              <div className="flex gap-2">
                <button onClick={onSaveEdit} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded">保存</button>
                <button onClick={onCancelEdit} className="px-3 py-1 text-xs border border-border rounded">取消</button>
              </div>
            </div>
          ) : (
            <div className="bg-muted rounded p-3">
              <p className="text-sm whitespace-pre-wrap">{item.content}</p>
            </div>
          )}

          {/* 智能元数据 */}
          {item.intelligence && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {item.intelligence.decay_rate !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-muted-foreground">衰减率</p>
                  <p className="font-medium">{(item.intelligence.decay_rate * 100).toFixed(1)}%</p>
                </div>
              )}
              {item.intelligence.review_count !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-muted-foreground">复习次数</p>
                  <p className="font-medium">{item.intelligence.review_count}</p>
                </div>
              )}
              {item.accessCount !== undefined && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-muted-foreground">访问次数</p>
                  <p className="font-medium">{item.accessCount}</p>
                </div>
              )}
              {item.nextReview && (
                <div className="bg-muted/50 rounded p-2">
                  <p className="text-muted-foreground">下次复习</p>
                  <p className="font-medium">{new Date(item.nextReview).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          )}

          {/* 保留率进度条 */}
          {retentionPct !== null && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>记忆保留率</span>
                <span className={retentionColor}>{retentionPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    retentionPct > 70 ? 'bg-green-500' : retentionPct > 30 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${retentionPct}%` }}
                />
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            {!editing && (
              <button
                onClick={(e) => { e.stopPropagation(); onStartEdit() }}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-accent"
              >
                编辑
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="px-3 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-950"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
