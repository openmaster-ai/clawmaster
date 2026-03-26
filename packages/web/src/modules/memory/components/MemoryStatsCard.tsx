import type { MemoryStats } from '@/shared/adapters/powermem'

interface Props {
  data?: MemoryStats | null
}

const TYPE_LABELS: Record<string, string> = {
  working: '工作记忆',
  short_term: '短期记忆',
  long_term: '长期记忆',
  unknown: '未分类',
}

export default function MemoryStatsCard({ data }: Props) {
  const agentCount = data?.by_agent ? Object.keys(data.by_agent).length : 0

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">记忆统计</h3>
      {data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">总记忆数</p>
              <p className="text-2xl font-bold">{data.total.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Agent 数</p>
              <p className="text-2xl font-bold">{agentCount}</p>
            </div>
            {data.avg_retention !== undefined && (
              <div>
                <p className="text-muted-foreground">平均保留率</p>
                <p className="text-2xl font-bold">{(data.avg_retention * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>

          {/* 按记忆类型分布 */}
          {data.by_type && Object.keys(data.by_type).length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">记忆类型分布</p>
              <div className="flex gap-2">
                {Object.entries(data.by_type).map(([type, count]) => (
                  <span key={type} className={`text-xs px-2 py-1 rounded ${
                    type === 'long_term' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    type === 'short_term' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                    type === 'working' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                    'bg-muted'
                  }`}>
                    {TYPE_LABELS[type] ?? type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 按 Agent 分布 */}
          {data.by_agent && agentCount > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Agent 分布</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.by_agent).map(([agent, count]) => (
                  <span key={agent} className="text-xs bg-muted px-2 py-1 rounded">
                    {agent}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.storage_type && (
            <p className="text-xs text-muted-foreground">存储: {data.storage_type}</p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">无法获取统计数据</p>
      )}
    </div>
  )
}
