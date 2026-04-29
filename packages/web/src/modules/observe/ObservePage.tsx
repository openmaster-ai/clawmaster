import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { platformResults } from '@/adapters'
import { getSetupAdapter } from '@/modules/setup/adapters'
import { setSkillEnabledResult } from '@/shared/adapters/clawhub'
import { allSuccess2 } from '@/shared/adapters/resultHelpers'
import {
  getSessionDetail,
  getSessions,
  type SessionDetail,
  type SessionInfo,
} from '@/shared/adapters/sessions'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { InstallTask } from '@/shared/components/InstallTask'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import { LoadingState } from '@/shared/components/LoadingState'
import { getCostDigestTemplates } from '@/shared/cronCostDigests'
import type { ClawprobeConfigJson, ClawprobeCostJson, ClawprobeStatusJson } from '@/types/clawprobe'
import { cn } from '@/lib/utils'

type ObserveBundle = {
  status: ClawprobeStatusJson
  cost: ClawprobeCostJson
  config: ClawprobeConfigJson | null
  latestSession: SessionInfo | null
  latestSessionDetail: SessionDetail | null
}

type ObserveSessionSnapshot = {
  key: string
  model: string | null
  provider: string | null
  inputTokens: number
  outputTokens: number
  usedContextTokens: number
  contextTokens: number
  utilizationPct: number
  estimatedUsd: number | null
  updatedAtMs: number
  isActive: boolean
}

const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000

function severityClass(sev: string): string {
  if (sev === 'critical') return 'border-red-500/40 bg-red-500/5 text-red-900 dark:text-red-100'
  if (sev === 'warning') return 'border-amber-500/40 bg-amber-500/5 text-amber-950 dark:text-amber-100'
  return 'border-blue-500/35 bg-blue-500/5 text-blue-950 dark:text-blue-100'
}

function normalizeTimestampMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function sessionUpdatedAtMs(session: SessionInfo, now = Date.now()): number {
  const explicit = normalizeTimestampMs(session.updatedAt)
  if (explicit > 0) return explicit
  if (session.ageMs > 0) return now - session.ageMs
  return 0
}

function sessionTieBreakerKey(session: SessionInfo): string {
  return session.key || session.sessionId || session.agentId
}

function selectLatestSession(sessions: SessionInfo[]): SessionInfo | null {
  const now = Date.now()
  return sessions.reduce<SessionInfo | null>((latest, session) => {
    if (!latest) return session
    const sessionTime = sessionUpdatedAtMs(session, now)
    const latestTime = sessionUpdatedAtMs(latest, now)
    if (sessionTime !== latestTime) return sessionTime > latestTime ? session : latest
    return sessionTieBreakerKey(session).localeCompare(sessionTieBreakerKey(latest)) > 0
      ? session
      : latest
  }, null)
}

function tokenPercentage(total: number, context: number): number {
  if (context <= 0) return 0
  return Math.min(Math.round((total / context) * 100), 100)
}

function firstPositiveNumber(...values: Array<number | null | undefined>): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return 0
}

function buildSessionSnapshot(
  status: ClawprobeStatusJson,
  latestSession: SessionInfo | null,
  latestSessionDetail: SessionDetail | null
): ObserveSessionSnapshot | null {
  if (latestSession) {
    const key = latestSession.key || latestSession.sessionId
    const detail = latestSessionDetail
    const contextTokens = firstPositiveNumber(
      detail?.windowSize,
      latestSession.contextTokens,
      status.sessionKey === key ? status.windowSize : 0
    )
    const usedContextTokens = firstPositiveNumber(
      detail?.contextTokens,
      status.sessionKey === key ? status.sessionTokens : 0
    )
    return {
      key,
      model: detail?.model || latestSession.model || (status.sessionKey === key ? status.model : null),
      provider: detail?.provider || latestSession.modelProvider || (status.sessionKey === key ? status.provider : null),
      inputTokens: detail?.inputTokens ?? latestSession.inputTokens,
      outputTokens: detail?.outputTokens ?? latestSession.outputTokens,
      usedContextTokens,
      contextTokens,
      utilizationPct: tokenPercentage(usedContextTokens, contextTokens),
      estimatedUsd: detail ? detail.estimatedUsd : null,
      updatedAtMs: sessionUpdatedAtMs(latestSession),
      isActive: status.sessionKey === key || (latestSession.ageMs > 0 && latestSession.ageMs < ACTIVE_SESSION_WINDOW_MS),
    }
  }

  if (!status.sessionKey) return null
  const detail = latestSessionDetail
  const contextTokens = firstPositiveNumber(detail?.windowSize, status.windowSize)
  const usedContextTokens = firstPositiveNumber(detail?.contextTokens, status.sessionTokens)
  return {
    key: status.sessionKey,
    model: detail?.model || status.model,
    provider: detail?.provider || status.provider,
    inputTokens: detail?.inputTokens ?? status.inputTokens,
    outputTokens: detail?.outputTokens ?? status.outputTokens,
    usedContextTokens,
    contextTokens,
    utilizationPct: tokenPercentage(usedContextTokens, contextTokens) || status.utilizationPct,
    estimatedUsd: detail ? detail.estimatedUsd : null,
    updatedAtMs: normalizeTimestampMs(detail?.lastActiveAt ?? status.lastActiveAt),
    isActive: status.isActive,
  }
}

function formatDateTime(ms: number, language: string): string {
  if (ms <= 0) return '-'
  return new Date(ms).toLocaleString(language || undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatContextTokenValue(value: number): string {
  return value > 0 ? value.toLocaleString() : '-'
}

export default function ObservePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [costPeriod, setCostPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week')
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const [bootstrapHint, setBootstrapHint] = useState<string | null>(null)
  const [installHint, setInstallHint] = useState<string | null>(null)
  const [digestInstallPeriod, setDigestInstallPeriod] = useState<string | null>(null)
  const [digestInstallError, setDigestInstallError] = useState<string | null>(null)
  const installTask = useInstallTask()
  const digestTemplates = useMemo(() => getCostDigestTemplates(t), [t])

  const costPeriods = useMemo(
    () =>
      [
        { id: 'day' as const, labelKey: 'observe.periodDay' },
        { id: 'week' as const, labelKey: 'observe.periodWeek' },
        { id: 'month' as const, labelKey: 'observe.periodMonth' },
        { id: 'all' as const, labelKey: 'observe.periodAll' },
      ] as const,
    []
  )

  const fetcher = useCallback(async (): Promise<AdapterResult<ObserveBundle>> => {
    const [st, co, cf] = await Promise.all([
      platformResults.clawprobeStatus(),
      platformResults.clawprobeCost(costPeriod),
      platformResults.clawprobeConfig(),
    ])
    const core = allSuccess2(st, co)
    if (!core.success) {
      return fail(core.error ?? t('observe.loadFailed'))
    }
    let latestSession: SessionInfo | null = null
    let latestSessionDetail: SessionDetail | null = null
    const status = core.data!.a
    if (!status.installRequired) {
      const sessionsResult = await getSessions()
      if (sessionsResult.success && sessionsResult.data) {
        latestSession = selectLatestSession(sessionsResult.data.sessions)
      }
      const detailKey = latestSession?.key || latestSession?.sessionId || status.sessionKey
      if (detailKey) {
        const detailResult = await getSessionDetail(detailKey, { agentId: latestSession?.agentId })
        if (detailResult.success && detailResult.data) {
          latestSessionDetail = detailResult.data
        }
      }
    }
    return ok({
      status,
      cost: core.data!.b,
      config: cf.success && cf.data ? cf.data : null,
      latestSession,
      latestSessionDetail,
    })
  }, [costPeriod, t])

  const { data, loading, error, refetch } = useAdapterCall(fetcher, { pollInterval: 45_000 })
  const installRequired = data?.status.installRequired === true

  const handleBootstrapClawprobe = useCallback(async () => {
    setBootstrapBusy(true)
    setBootstrapHint(null)
    const r = await platformResults.clawprobeBootstrap()
    if (!r.success || !r.data) {
      setBootstrapHint(`${t('observe.bootstrapFailedPrefix')}${r.error ?? t('common.unknownError')}`)
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
  }, [refetch, t])

  const handleInstallClawprobe = useCallback(async () => {
    setInstallHint(null)
    await installTask.run(async () => {
      const adapter = getSetupAdapter()
      await adapter.installCapabilities(['observe'], () => {})
      const bootstrap = await platformResults.clawprobeBootstrap()
      if (!bootstrap.success || !bootstrap.data) {
        throw new Error(bootstrap.error ?? t('common.unknownError'))
      }
      setInstallHint(bootstrap.data.message)
      await refetch()
    })
  }, [installTask, refetch, t])

  const handleOpenDigestTemplate = useCallback(async (href: string, period: string) => {
    if (installRequired) {
      setDigestInstallError(t('observe.digestRequiresClawprobe'))
      return
    }
    setDigestInstallError(null)
    setDigestInstallPeriod(period)
    const result = await platformResults.installSkill('clawprobe-cost-digest')
    if (!result.success) {
      setDigestInstallError(
        t('skills.installFailed', { message: result.error ?? t('common.unknownError') })
      )
      setDigestInstallPeriod(null)
      return
    }
    const enableResult = await setSkillEnabledResult('clawprobe-cost-digest', true)
    if (!enableResult.success) {
      setDigestInstallError(
        t('skills.installFailed', { message: enableResult.error ?? t('common.unknownError') })
      )
      setDigestInstallPeriod(null)
      return
    }
    navigate(href)
  }, [installRequired, navigate, t])

  if (error || !data) {
    if (loading && !data && !error) {
      return (
        <div className="page-shell page-shell-medium gap-8 pb-10">
          <div className="page-header">
            <div className="page-header-copy">
              <h1 className="page-title">{t('observe.title')}</h1>
              <p className="page-subtitle">{t('observe.subtitle')}</p>
            </div>
          </div>
          <div className="state-panel">
            <LoadingState message={t('observe.loading')} fullPage={false} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="state-panel">
              <LoadingState message={t('observe.sectionSession')} fullPage={false} />
            </div>
            <div className="state-panel">
              <LoadingState message={t('observe.costTrend')} fullPage={false} />
            </div>
          </div>
        </div>
      )
    }
    return (
        <div className="page-shell page-shell-prose">
        <div className="page-header">
          <div className="page-header-copy">
            <h1 className="page-title">{t('observe.title')}</h1>
          </div>
        </div>
        <div className="surface-card-danger text-sm text-destructive">
          <p className="font-medium mb-2">{t('observe.errorTitle')}</p>
          <p className="text-muted-foreground mb-3">{error ?? t('common.unknownError')}</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>{t('observe.errorLi1')}</li>
            <li>{t('observe.errorLi2')}</li>
          </ul>
          <button
            type="button"
            onClick={() => void handleBootstrapClawprobe()}
            disabled={bootstrapBusy}
            className="button-primary mt-3"
          >
            {bootstrapBusy ? t('observe.bootstrapWorking') : t('observe.bootstrapAuto')}
          </button>
          {bootstrapHint ? (
            <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background p-2 text-[11px] font-mono text-muted-foreground">
              {bootstrapHint}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            className="button-primary mt-4"
          >
            {t('observe.retry')}
          </button>
        </div>
      </div>
    )
  }

  const { status, cost, config } = data
  const maxDailyUsd = Math.max(...cost.daily.map((d) => d.usd), 0.01)
  const sessionSnapshot = buildSessionSnapshot(status, data.latestSession, data.latestSessionDetail)

  return (
    <div className="page-shell page-shell-medium gap-8 pb-10">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('observe.title')}</h1>
          <p className="page-subtitle">{t('observe.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="button-secondary self-start"
        >
          {t('observe.refresh')}
        </button>
      </div>

      {config && (
        <div className="mono-note space-y-1">
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

      {installRequired && (
        <section className="surface-card border-amber-500/30 bg-amber-500/5 text-center">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('observe.installTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('observe.installBody')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleInstallClawprobe()}
              disabled={installTask.status === 'running'}
              className="button-primary"
            >
              {installTask.status === 'running'
                ? t('observe.installWorking')
                : t('observe.installAction')}
            </button>
            <span className="text-xs font-mono text-muted-foreground">npm i -g clawprobe</span>
          </div>
          <InstallTask
            label="ClawProbe"
            description="npm i -g clawprobe"
            status={installTask.status}
            error={installTask.error}
            onRetry={installTask.reset}
          />
          {installHint ? (
            <p className="text-xs whitespace-pre-wrap text-muted-foreground">{installHint}</p>
          ) : null}
        </section>
      )}

      <section id="observe-runtime" className="space-y-3">
        <h2 className="text-lg font-semibold">{t('observe.sectionSession')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-card space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('observe.daemonLabel')}</div>
            <div className="text-lg font-medium">
              {status.daemonRunning ? (
                <span className="text-emerald-600 dark:text-emerald-400">{t('observe.running')}</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">{t('observe.notRunning')}</span>
              )}
            </div>
            {!status.daemonRunning && (
              <p className="text-xs text-muted-foreground">{t('observe.daemonHint')}</p>
            )}
            <button
              type="button"
              onClick={() => void handleBootstrapClawprobe()}
              disabled={bootstrapBusy}
              className="button-secondary mt-1 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {bootstrapBusy
                ? t('observe.bootstrapShort')
                : status.daemonRunning
                  ? t('observe.bootstrapAgain')
                  : t('observe.bootstrapStart')}
            </button>
            {bootstrapHint ? (
              <pre className="text-[11px] whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-2 max-h-36 overflow-auto">
                {bootstrapHint}
              </pre>
            ) : null}
          </div>
          <div className="surface-card space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {t('observe.todayCostLabel')}
            </div>
            <div className="text-lg font-medium">${status.todayUsd.toFixed(4)}</div>
            <div className="text-xs text-muted-foreground">
              {t('observe.agentLabel')} {status.agent}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('observe.latestSession')}</span>
              {sessionSnapshot?.isActive ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  {t('observe.activeSession')}
                </span>
              ) : null}
            </div>
            {sessionSnapshot?.model && (
              <span className="min-w-0 flex-1 text-right text-xs text-muted-foreground font-mono truncate">
                {[sessionSnapshot.provider, sessionSnapshot.model].filter(Boolean).join(' / ')}
              </span>
            )}
          </div>
          {sessionSnapshot ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('observe.sessionCost')}
                  </div>
                  <div className="text-lg font-semibold">
                    {sessionSnapshot.estimatedUsd === null
                      ? t('observe.costUnavailable')
                      : `$${sessionSnapshot.estimatedUsd.toFixed(4)}`}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('observe.inputOutputTokens')}
                  </div>
                  <div className="text-sm font-medium">
                    {sessionSnapshot.inputTokens.toLocaleString()} / {sessionSnapshot.outputTokens.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('observe.lastActive')}
                  </div>
                  <div className="text-sm font-medium">{formatDateTime(sessionSnapshot.updatedAtMs, i18n.language)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-medium">{t('observe.contextUsage')}</span>
                <span className="text-xs text-muted-foreground">{sessionSnapshot.utilizationPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${sessionSnapshot.utilizationPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatContextTokenValue(sessionSnapshot.usedContextTokens)} / {formatContextTokenValue(sessionSnapshot.contextTokens)} {t('observe.tokens')}
                </span>
                <span>{t('observe.contextWindow')}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate" title={sessionSnapshot.key}>
                {t('observe.sessionPrefix')} {sessionSnapshot.key}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('observe.noSession')}</p>
          )}
        </div>
      </section>

      <section id="observe-cost" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">{t('observe.costTrend')}</h2>
          <div className="pill-group">
            {costPeriods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCostPeriod(p.id)}
                className={cn(
                  'pill-button text-xs',
                  costPeriod === p.id
                    ? 'pill-button-active'
                    : 'pill-button-inactive'
                )}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('observe.total')} </span>
              <span className="font-semibold">${cost.totalUsd.toFixed(4)}</span>
            </div>
            {cost.period !== 'day' && (
              <>
                <div>
                  <span className="text-muted-foreground">{t('observe.dailyAvg')} </span>
                  <span className="font-medium">${cost.dailyAvg.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('observe.monthlyEst')} </span>
                  <span className="font-medium">${cost.monthEstimate.toFixed(4)}</span>
                </div>
              </>
            )}
          </div>

          {cost.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('observe.noCostData')}</p>
          ) : (
            <ul className="space-y-2">
              {cost.daily.map((d) => (
                <li key={d.date} className="grid gap-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <span className="font-mono text-xs text-muted-foreground">{d.date}</span>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-primary/80"
                      style={{ width: `${Math.min(100, (d.usd / maxDailyUsd) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs sm:text-right">${d.usd.toFixed(4)}</span>
                </li>
              ))}
            </ul>
          )}

          {cost.unpricedModels && cost.unpricedModels.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('observe.unpricedWarning', { models: cost.unpricedModels.join(', ') })}
            </p>
          )}
        </div>
      </section>

      <section id="observe-digests" className="space-y-3">
        <div className="surface-card space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t('observe.scheduledDigestsTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('observe.scheduledDigestsDesc')}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="grid gap-3 md:grid-cols-3">
              {digestTemplates.map((template) => (
                <button
                  key={template.period}
                  type="button"
                  onClick={() => void handleOpenDigestTemplate(template.href, template.period)}
                  disabled={digestInstallPeriod !== null || installRequired}
                  className="surface-card block space-y-2 border border-border/70 bg-background/70 text-left transition hover:border-primary/35 hover:bg-background disabled:cursor-wait disabled:opacity-70"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{template.label}</p>
                    <p className="text-xs text-muted-foreground">{template.schedule}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                  <span className="inline-flex text-xs font-medium text-primary">
                    {digestInstallPeriod === template.period
                      ? t('skills.installing')
                      : t('observe.digestCreateAction')}
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('observe.digestIncludesTitle')}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>{t('observe.digestIncludesTotal')}</li>
                <li>{t('observe.digestIncludesBreakdown')}</li>
                <li>{t('observe.digestIncludesTop')}</li>
                <li>{t('observe.digestIncludesTrend')}</li>
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">{t('observe.digestDeliveryNote')}</p>
              <Link to="/cron" className="mt-3 inline-flex text-sm font-medium text-primary">
                {t('observe.openCron')}
              </Link>
            </div>
          </div>
          {installRequired ? (
            <p className="text-sm text-muted-foreground">{t('observe.digestRequiresClawprobe')}</p>
          ) : null}
          {digestInstallError ? (
            <p className="text-sm text-destructive">{digestInstallError}</p>
          ) : null}
        </div>
      </section>

      {status.suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('observe.suggestions')}</h2>
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
