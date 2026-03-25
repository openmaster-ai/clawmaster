import type { MemoryHealth } from '@/shared/adapters/powermem'

interface Props {
  data?: MemoryHealth | null
}

export default function MemoryHealthCard({ data }: Props) {
  const statusColor = !data ? 'bg-gray-400' :
    data.status === 'ok' ? 'bg-green-500' :
    data.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'

  const statusLabel = !data ? '未知' :
    data.status === 'ok' ? '正常' :
    data.status === 'error' ? '异常' : '未连接'

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">记忆系统健康</h3>
      {data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${statusColor}`} />
            <span className="font-medium">{statusLabel}</span>
          </div>
          {data.message && (
            <p className="text-sm text-muted-foreground">{data.message}</p>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {data.total_memories !== undefined && (
              <div>
                <p className="text-muted-foreground">记忆总数</p>
                <p className="font-medium">{data.total_memories.toLocaleString()}</p>
              </div>
            )}
            {data.storage && (
              <div>
                <p className="text-muted-foreground">存储引擎</p>
                <p className="font-medium">{data.storage}</p>
              </div>
            )}
            {data.agent_count !== undefined && (
              <div>
                <p className="text-muted-foreground">Agent 数</p>
                <p className="font-medium">{data.agent_count}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">无法获取健康状态</p>
      )}
    </div>
  )
}
