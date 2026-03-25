import type { CostData } from '@/shared/adapters/clawprobe'

interface Props {
  day?: CostData | null
  week?: CostData | null
  month?: CostData | null
}

function getBudget(period: 'day' | 'week' | 'month'): number | null {
  const raw = localStorage.getItem(`clawmaster-budget-${period}`)
  return raw ? parseFloat(raw) : null
}

export default function CostCards({ day, week, month }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <CostCard label="今日花费" data={day} color="text-blue-600" budgetPeriod="day" />
      <CostCard label="本周花费" data={week} color="text-purple-600" budgetPeriod="week" />
      <CostCard label="本月花费" data={month} color="text-orange-600" budgetPeriod="month" />
    </div>
  )
}

function CostCard({
  label,
  data,
  color,
  budgetPeriod,
}: {
  label: string
  data?: CostData | null
  color: string
  budgetPeriod: 'day' | 'week' | 'month'
}) {
  const budget = getBudget(budgetPeriod)
  const spent = data?.total ?? 0
  const overBudget = budget !== null && spent > budget
  const nearBudget = budget !== null && spent > budget * 0.8
  const pct = budget ? Math.min((spent / budget) * 100, 100) : 0

  return (
    <div className={`bg-card border rounded-lg p-4 ${overBudget ? 'border-red-500' : 'border-border'}`}>
      {overBudget && (
        <div className="text-xs text-red-500 font-medium mb-1">
          超出预算!
        </div>
      )}
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${overBudget ? 'text-red-600' : color}`}>
        {data ? `$${data.total.toFixed(2)}` : '—'}
      </p>
      {budget !== null && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>预算 ${budget.toFixed(2)}</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                overBudget ? 'bg-red-500' : nearBudget ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      {!budget && data?.by_model && (
        <p className="text-xs text-muted-foreground mt-2">
          {Object.keys(data.by_model).length} 个模型
        </p>
      )}
    </div>
  )
}
