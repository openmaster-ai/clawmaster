import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { CostData } from '@/shared/adapters/clawprobe'

interface Props {
  data?: CostData | null
}

export default function CostTrend({ data }: Props) {
  // 从 by_model 构造趋势数据（简化：按模型展示分布，后续接入真实日级数据）
  const chartData = data?.by_model
    ? Object.entries(data.by_model).map(([model, cost]) => ({
        name: model.length > 12 ? model.slice(0, 12) + '...' : model,
        cost: Number(cost.toFixed(4)),
      }))
    : []

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">费用趋势</h3>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => [`$${Number(v).toFixed(4)}`, '费用']} />
            <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          暂无费用数据
        </div>
      )}
    </div>
  )
}
