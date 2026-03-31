import { useCallback, useState } from 'react'
import { platformResults } from '@/adapters'
import { allSuccess2 } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'
import type { ClawprobeConfigJson, ClawprobeCostJson, ClawprobeStatusJson } from '@/types/clawprobe'
import { cn } from '@/lib/utils'

type ObserveBundle = {
  status: ClawprobeStatusJson
  cost: ClawprobeCostJson
  config: ClawprobeConfigJson | null
}

const costPeriods = [
  { id: 'day' as const, label: '今日' },
  { id: 'week' as const, label: '本周' },
  { id: 'month' as const, label: '本月' },
  { id: 'all' as const, label: '全部' },
]

function severityClass(sev: string): string {
  if (sev === 'critical') return 'border-red-500/40 bg-red-500/5 text-red-900 dark:text-red-100'
  if (sev === 'warning') return 'border-amber-500/40 bg-amber-500/5 text-amber-950 dark:text-amber-100'
  return 'border-blue-500/35 bg-blue-500/5 text-blue-950 dark:text-blue-100'
}

export default function ObservePage() {
  const [costPeriod, setCostPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week')
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const [bootstrapHint, setBootstrapHint] = useState<string | null>(null)

  const fetcher = useCallback(async (): Promise<AdapterResult<ObserveBundle>> => {
    const [st, co, cf] = await Promise.all([
      platformResults.clawprobeStatus(),
      platformResults.clawprobeCost(costPeriod),
      platformResults.clawprobeConfig(),
    ])
    const core = allSuccess2(st, co)
    if (!core.success) {
      return fail(core.error ?? '加载失败')
    }
    return ok({
      status: core.data!.a,
      cost: core.data!.b,
      config: cf.success && cf.data ? cf.data : null,
    })
  }, [costPeriod])

  const { data, loading, error, refetch } = useAdapterCall(fetcher, { pollInterval: 45_000 })

  const handleBootstrapClawprobe = useCallback(async () => {
    setBootstrapBusy(true)
    setBootstrapHint(null)
    const r = await platformResults.clawprobeBootstrap()
    if (!r.success || !r.data) {
      setBootstrapHint(`拉起失败：${r.error ?? '未知错误'}`)
      setBootstrapBusy(false)
      return
    }
    const extra = [r.data.stdout, r.data.stderr].filter(Boolean).join('\n').trim()
    setBootstrapHint(
      extra
        ? `${r.data.message}\n\n${extra.slice(0, 1200)}`
        : r.data.message
    )
    setBootstrapBusy(false)
    void refetch()
  }, [refetch])

  if (loading && !data) {
    return <LoadingState message="正在拉取 ClawProbe 数据…" />
  }

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-2xl font-bold">监控</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium mb-2">无法读取 ClawProbe 数据</p>
          <p className="text-muted-foreground mb-3">{error ?? '未知错误'}</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              请安装并全局可用 <code className="font-mono text-xs">clawprobe</code>（桌面端），或确保后端已安装{' '}
              <code className="font-mono text-xs">clawprobe</code> 依赖（Web 模式）。
            </li>
            <li>
              运行 <code className="font-mono text-xs">clawprobe start</code> 开启守护进程以持续写入{' '}
              <code className="font-mono text-xs">probe.db</code>。
            </li>
          </ul>
          <button
            type="button"
            onClick={() => void handleBootstrapClawprobe()}
            disabled={bootstrapBusy}
            className="mt-3 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {bootstrapBusy ? '正在自动拉起…' : '自动部署并拉起 ClawProbe'}
          </button>
          {bootstrapHint ? (
            <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background p-2 text-[11px] font-mono text-muted-foreground">
              {bootstrapHint}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  const { status, cost, config } = data
  const maxDailyUsd = Math.max(...cost.daily.map((d) => d.usd), 0.01)

  return (
    <div className="space-y-8 max-w-4xl pb-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">监控</h1>
          <p className="text-sm text-muted-foreground">
            数据由 <span className="font-medium text-foreground">ClawProbe</span> 从 OpenClaw 会话与{' '}
            <code className="font-mono text-xs">probe.db</code> 汇总，与概览页互补。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent self-start"
        >
          刷新
        </button>
      </div>

      {config && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs font-mono text-muted-foreground space-y-1">
          <div>
            <span className="text-foreground/80">openclawDir</span> {config.openclawDir}
          </div>
          <div>
            <span className="text-foreground/80">probeDir</span> {config.probeDir}
          </div>
          <div>
            <span className="text-foreground/80">sessionsDir</span> {config.sessionsDir}
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">会话与守护</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">守护进程</div>
            <div className="text-lg font-medium">
              {status.daemonRunning ? (
                <span className="text-emerald-600 dark:text-emerald-400">运行中</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">未运行</span>
              )}
            </div>
            {!status.daemonRunning && (
              <p className="text-xs text-muted-foreground">
                可点击下方按钮自动部署并拉起，或在终端手动执行 clawprobe start。
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleBootstrapClawprobe()}
              disabled={bootstrapBusy}
              className="mt-1 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent disabled:opacity-50"
            >
              {bootstrapBusy ? '拉起中…' : status.daemonRunning ? '重新拉起 ClawProbe' : '自动部署并拉起'}
            </button>
            {bootstrapHint ? (
              <pre className="text-[11px] whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-2 max-h-36 overflow-auto">
                {bootstrapHint}
              </pre>
            ) : null}
          </div>
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">今日 API 费用（估算）</div>
            <div className="text-lg font-medium">${status.todayUsd.toFixed(4)}</div>
            <div className="text-xs text-muted-foreground">Agent: {status.agent}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <span className="text-sm font-medium">上下文占用</span>
            {status.model && (
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[min(100%,18rem)]">
                {status.model}
              </span>
            )}
          </div>
          {status.sessionKey ? (
            <>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, status.utilizationPct)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {status.sessionTokens.toLocaleString()} / {status.windowSize.toLocaleString()} tokens
                </span>
                <span>{status.utilizationPct}%</span>
              </div>
              <p className="text-xs text-muted-foreground truncate" title={status.sessionKey}>
                会话 {status.sessionKey}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无活跃会话。使用 OpenClaw 对话后将显示上下文与 token 占用。</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">费用趋势</h2>
          <div className="flex flex-wrap gap-1">
            {costPeriods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCostPeriod(p.id)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md border transition-colors',
                  costPeriod === p.id
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">合计 </span>
              <span className="font-semibold">${cost.totalUsd.toFixed(4)}</span>
            </div>
            {cost.period !== 'day' && (
              <>
                <div>
                  <span className="text-muted-foreground">日均 </span>
                  <span className="font-medium">${cost.dailyAvg.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">月估 </span>
                  <span className="font-medium">${cost.monthEstimate.toFixed(4)}</span>
                </div>
              </>
            )}
          </div>

          {cost.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">该周期尚无费用数据。</p>
          ) : (
            <ul className="space-y-2">
              {cost.daily.map((d) => (
                <li key={d.date} className="flex items-center gap-3 text-sm">
                  <span className="w-28 font-mono text-xs text-muted-foreground">{d.date}</span>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden min-w-[4rem]">
                    <div
                      className="h-full rounded bg-primary/80"
                      style={{ width: `${Math.min(100, (d.usd / maxDailyUsd) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right font-mono text-xs">${d.usd.toFixed(4)}</span>
                </li>
              ))}
            </ul>
          )}

          {cost.unpricedModels && cost.unpricedModels.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              以下模型无公开价目表，费用可能不完整：{cost.unpricedModels.join(', ')}
            </p>
          )}
        </div>
      </section>

      {status.suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">优化建议</h2>
          <ul className="space-y-2">
            {status.suggestions.map((s) => (
              <li
                key={s.ruleId}
                className={cn('rounded-lg border p-3 text-sm', severityClass(s.severity))}
              >
                <div className="font-medium">{s.title}</div>
                <p className="text-xs mt-1 opacity-90">{s.detail}</p>
                {s.action && (
                  <p className="text-xs mt-2 font-mono opacity-80 whitespace-pre-wrap">{s.action}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
