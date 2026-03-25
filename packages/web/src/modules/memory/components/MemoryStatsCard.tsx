import type { MemoryStats } from '@/shared/adapters/powermem'

interface Props {
  data?: MemoryStats | null
}

export default function MemoryStatsCard({ data }: Props) {
  const agentCount = data?.by_agent ? Object.keys(data.by_agent).length : 0

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">记忆统计</h3>
      {data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
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
                <p className="text-muted-foreground">平均记忆保留率</p>
                <p className="text-2xl font-bold">{(data.avg_retention * 100).toFixed(0)}%</p>
              </div>
            )}
            {data.storage_engine && (
              <div>
                <p className="text-muted-foreground">存储引擎</p>
                <p className="font-medium">{data.storage_engine}</p>
              </div>
            )}
          </div>
          {data.by_agent && agentCount > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">按 Agent 分布</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.by_agent).map(([agent, count]) => (
                  <span key={agent} className="text-xs bg-muted px-2 py-1 rounded">
                    {agent}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">无法获取统计数据</p>
      )}
    </div>
  )
}
