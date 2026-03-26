import type { MemoryHealth } from '@/shared/adapters/powermem'

interface Props {
  data?: MemoryHealth | null
  serverRunning?: boolean | null
  onStartServer?: () => void
  starting?: boolean
}

export default function MemoryHealthCard({ data, serverRunning, onStartServer, starting }: Props) {
  const statusColor = !data ? 'bg-gray-400' :
    data.status === 'healthy' ? 'bg-green-500' :
    data.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'

  const statusLabel = !data ? '未知' :
    data.status === 'healthy' ? '正常' :
    data.status === 'error' ? '异常' : '未连接'

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">记忆系统</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${statusColor}`} />
            <span className="font-medium">{statusLabel}</span>
          </div>
          {serverRunning === false && onStartServer && (
            <button
              onClick={onStartServer}
              disabled={starting}
              className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
            >
              {starting ? '启动中...' : '启动服务'}
            </button>
          )}
        </div>

        {data?.message && (
          <p className="text-sm text-muted-foreground">{data.message}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          {data?.storage_type && (
            <div>
              <p className="text-muted-foreground">存储引擎</p>
              <p className="font-medium">{data.storage_type}</p>
            </div>
          )}
          {data?.llm_provider && (
            <div>
              <p className="text-muted-foreground">LLM 提供商</p>
              <p className="font-medium">{data.llm_provider}</p>
            </div>
          )}
          {data?.version && (
            <div>
              <p className="text-muted-foreground">版本</p>
              <p className="font-medium">{data.version}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
