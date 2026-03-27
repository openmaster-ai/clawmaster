import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { CostData } from '@/shared/adapters/clawprobe'

const COLORS = ['hsl(220, 90%, 56%)', 'hsl(160, 70%, 45%)', 'hsl(35, 90%, 55%)', 'hsl(280, 70%, 55%)', 'hsl(350, 80%, 55%)', 'hsl(190, 70%, 50%)']

interface Props {
  data?: CostData | null
}

export default function ModelDistribution({ data }: Props) {
  const chartData = data?.by_model
    ? Object.entries(data.by_model)
        .map(([name, value]) => ({ name, value: Number(value.toFixed(4)) }))
        .sort((a, b) => b.value - a.value)
    : []

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">模型费用分布</h3>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius={70}
              dataKey="value"
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `$${Number(v).toFixed(4)}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          暂无模型分布数据
        </div>
      )}
    </div>
  )
}
