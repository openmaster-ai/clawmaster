import { useState } from 'react'
import type { MemorySearchResult, MemoryEntry } from '@/shared/adapters/powermem'

interface Props {
  data?: MemorySearchResult | null
  loading: boolean
  isSearch: boolean
  onDelete: (id: string) => void
  onRefresh: () => void
}

export default function MemoryList({ data, loading, isSearch, onDelete, onRefresh }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">
          {isSearch ? `搜索结果 (${data?.total ?? 0})` : `记忆列表 (${data?.total ?? 0})`}
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1 text-sm border border-border rounded hover:bg-accent disabled:opacity-50"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {!data || data.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          {isSearch ? '未找到匹配的记忆' : '暂无记忆'}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {data.entries.map((entry) => (
            <MemoryItem
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onDelete={() => onDelete(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MemoryItem({
  entry,
  expanded,
  onToggle,
  onDelete,
}: {
  entry: MemoryEntry
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const retentionPct = entry.retention !== undefined ? Math.round(entry.retention * 100) : null
  const retentionColor = retentionPct === null ? '' :
    retentionPct > 70 ? 'text-green-600' :
    retentionPct > 30 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="py-3">
      <div
        className="flex items-start justify-between cursor-pointer hover:bg-accent/30 -mx-2 px-2 py-1 rounded"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{entry.content.slice(0, 100)}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {entry.agent_id && <span>Agent: {entry.agent_id}</span>}
            <span>{new Date(entry.created_at).toLocaleDateString()}</span>
            {entry.importance && (
              <span className={
                entry.importance === 'high' ? 'text-red-500' :
                entry.importance === 'medium' ? 'text-yellow-500' : 'text-gray-400'
              }>
                {entry.importance === 'high' ? '高' : entry.importance === 'medium' ? '中' : '低'}
              </span>
            )}
            {retentionPct !== null && (
              <span className={retentionColor}>保留: {retentionPct}%</span>
            )}
          </div>
        </div>
        <span className="text-xs ml-2 flex-shrink-0">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="mt-2 ml-2 pl-4 border-l-2 border-border space-y-2">
          <div className="bg-muted rounded p-3">
            <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>ID: {entry.id}</span>
            {entry.scope && <span>Scope: {entry.scope}</span>}
            {entry.updated_at && <span>更新: {new Date(entry.updated_at).toLocaleString()}</span>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="px-3 py-1 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-950"
          >
            删除此记忆
          </button>
        </div>
      )}
    </div>
  )
}
