import { useEffect, useMemo, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, Play, RefreshCw, SquarePen, TimerReset, Trash2 } from 'lucide-react'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { LoadingState } from '@/shared/components/LoadingState'
import { buildCostDigestDraft, isCostDigestPeriod } from '@/shared/cronCostDigests'
import { getGatewayStatusResult } from '@/shared/adapters/gateway'
import { getConfigResult } from '@/shared/adapters/openclaw'
import {
  createCronJobResult,
  getCronJobsResult,
  getCronRunsResult,
  getCronStatusResult,
  removeCronJobResult,
  runCronJobResult,
  setCronJobEnabledResult,
  updateCronJobResult,
  type CronJob,
  type CronJobDraft,
  type CronRun,
} from '@/shared/adapters/cron'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { buildGatewayChatUrl } from '@/shared/gatewayUrl'
import { buildSchedulePreview } from './schedulePreview'

type FilterMode = 'all' | 'enabled' | 'disabled'
type EditorMode = 'create' | 'edit'
interface SchedulePreset {
  id: string
  label: string
  apply: (draft: CronJobDraft) => CronJobDraft
}

const EMPTY_DRAFT: CronJobDraft = {
  name: '',
  description: '',
  scheduleType: 'cron',
  cron: '',
  every: '',
  at: '',
  tz: '',
  session: 'main',
  sessionKey: '',
  model: '',
  agent: '',
  announce: false,
  channel: '',
  to: '',
  message: '',
  systemEvent: '',
  enabled: true,
}

function isGatewayUnavailableError(message?: string | null): boolean {
  const text = message?.toLowerCase() ?? ''
  return (
    text.includes('gateway closed') ||
    text.includes('gateway target') ||
    text.includes('gateway unavailable') ||
    text.includes('connect econnrefused') ||
    text.includes('fetch failed')
  )
}

function truncateForBanner(value: string, limit = 160): string {
  const firstLine = value.split('\n')[0]?.trim() ?? ''
  if (firstLine.length <= limit) return firstLine
  return `${firstLine.slice(0, limit - 1)}…`
}

function buildDraftFromJob(job: CronJob): CronJobDraft {
  return {
    name: job.name,
    description: job.description,
    scheduleType: job.scheduleType,
    cron: job.cron,
    every: job.every,
    at: job.at,
    tz: job.tz,
    session: job.session || 'main',
    sessionKey: job.sessionKey,
    model: job.model,
    agent: job.agent,
    announce: job.announce,
    channel: job.channel,
    to: job.to,
    message: job.message,
    systemEvent: job.systemEvent,
    enabled: job.enabled,
  }
}

function formatSchedule(job: CronJob, t: TFunction): string {
  if (job.scheduleType === 'every') return t('cron.scheduleEveryValue', { value: job.every || '-' })
  if (job.scheduleType === 'at') return t('cron.scheduleAtValue', { value: job.at || '-' })
  if (job.tz) return t('cron.scheduleCronWithTz', { value: job.cron || '-', tz: job.tz })
  return t('cron.scheduleCronValue', { value: job.cron || '-' })
}

function formatDateValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return trimmed
  return parsed.toLocaleString()
}

function statusBadgeClass(job: CronJob): string {
  if (!job.enabled) return 'border-border/70 bg-background/70 text-muted-foreground'
  if (/fail|error/i.test(job.lastStatus)) return 'border-destructive/30 bg-destructive/5 text-destructive'
  if (/ok|success|done/i.test(job.lastStatus)) return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
}

function runBadgeClass(run: CronRun): string {
  if (/fail|error/i.test(run.status) || (run.exitCode != null && run.exitCode !== 0)) {
    return 'border-destructive/30 bg-destructive/5 text-destructive'
  }
  if (/ok|success|done/i.test(run.status) || run.exitCode === 0) {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  }
  return 'border-border/70 bg-background/70 text-muted-foreground'
}

function resolveCronWebUiSessionKey(job: CronJob): string | null {
  const explicitSessionKey = job.sessionKey.trim()
  if (explicitSessionKey) return explicitSessionKey

  const sessionName = job.session.trim().toLowerCase()
  const agentId = job.agent.trim() || 'main'
  if (sessionName === 'main') {
    return `agent:${agentId}:main`
  }

  if (sessionName === 'isolated' && job.lastRun.trim()) {
    return `agent:${agentId}:cron:${job.id}`
  }

  return null
}

function getSchedulePresets(scheduleType: CronJobDraft['scheduleType'], t: TFunction): SchedulePreset[] {
  if (scheduleType === 'cron') {
    return [
      {
        id: 'weekday-morning',
        label: t('cron.presetWeekdayMorning'),
        apply: (draft) => ({
          ...draft,
          scheduleType: 'cron',
          cron: '0 8 * * 1-5',
          every: '',
          at: '',
        }),
      },
      {
        id: 'daily-morning',
        label: t('cron.presetDailyMorning'),
        apply: (draft) => ({
          ...draft,
          scheduleType: 'cron',
          cron: '0 9 * * *',
          every: '',
          at: '',
        }),
      },
      {
        id: 'hourly',
        label: t('cron.presetHourly'),
        apply: (draft) => ({
          ...draft,
          scheduleType: 'cron',
          cron: '0 * * * *',
          every: '',
          at: '',
        }),
      },
      {
        id: 'month-start',
        label: t('cron.presetMonthStart'),
        apply: (draft) => ({
          ...draft,
          scheduleType: 'cron',
          cron: '0 9 1 * *',
          every: '',
          at: '',
        }),
      },
    ]
  }

  if (scheduleType === 'every') {
    return [
      {
        id: '15m',
        label: t('cron.presetEvery15m'),
        apply: (draft) => ({ ...draft, scheduleType: 'every', every: '15m', cron: '', at: '' }),
      },
      {
        id: '1h',
        label: t('cron.presetEveryHour'),
        apply: (draft) => ({ ...draft, scheduleType: 'every', every: '1h', cron: '', at: '' }),
      },
      {
        id: '6h',
        label: t('cron.presetEvery6h'),
        apply: (draft) => ({ ...draft, scheduleType: 'every', every: '6h', cron: '', at: '' }),
      },
      {
        id: '1d',
        label: t('cron.presetEveryDay'),
        apply: (draft) => ({ ...draft, scheduleType: 'every', every: '1d', cron: '', at: '' }),
      },
    ]
  }

  return []
}

export default function CronPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const jobsState = useAdapterCall(getCronJobsResult, { pollInterval: 30_000 })
  const statusState = useAdapterCall(getCronStatusResult, { pollInterval: 30_000 })
  const gatewayState = useAdapterCall(getGatewayStatusResult, { pollInterval: 30_000 })
  const configState = useAdapterCall(getConfigResult, { pollInterval: 30_000 })
  const templateApplied = useRef(false)

  const [filter, setFilter] = useState<FilterMode>('all')
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CronJobDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CronJob | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [runsJob, setRunsJob] = useState<CronJob | null>(null)
  const [runs, setRuns] = useState<CronRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  const jobs = jobsState.data ?? []
  const filteredJobs = useMemo(() => {
    if (filter === 'enabled') return jobs.filter((job) => job.enabled)
    if (filter === 'disabled') return jobs.filter((job) => !job.enabled)
    return jobs
  }, [filter, jobs])

  const enabledCount = jobs.filter((job) => job.enabled).length
  const disabledCount = jobs.length - enabledCount
  const gatewayReady = gatewayState.data?.running === true
  const gatewayResolved = !gatewayState.loading || gatewayState.data !== null
  const gatewayIssue =
    gatewayResolved &&
    !gatewayReady &&
    (isGatewayUnavailableError(jobsState.error) ||
      isGatewayUnavailableError(statusState.error) ||
      gatewayState.data?.running === false)
  const schedulePreview = buildSchedulePreview(draft, t)
  const schedulePresets = getSchedulePresets(draft.scheduleType, t)

  useEffect(() => {
    if (templateApplied.current) {
      return
    }

    if (!gatewayResolved) {
      return
    }

    const template = searchParams.get('template')
    const period = searchParams.get('period')
    if (template !== 'cost-digest' || !isCostDigestPeriod(period)) {
      return
    }

    if (!gatewayReady) {
      return
    }

    templateApplied.current = true
    setEditorMode('create')
    setEditingJobId(null)
    setDraft(buildCostDigestDraft(period, t))
    setEditorError(null)
    setFeedback({
      tone: 'info',
      message: t('cron.templateLoadedCostDigest', {
        period: t(`observe.period${period[0].toUpperCase()}${period.slice(1)}`),
      }),
    })
  }, [gatewayReady, gatewayResolved, searchParams, t])

  async function refreshAll() {
    await Promise.all([jobsState.refetch(), statusState.refetch(), gatewayState.refetch()])
  }

  function openCreateDialog() {
    setEditorMode('create')
    setEditingJobId(null)
    setDraft(EMPTY_DRAFT)
    setEditorError(null)
  }

  function openEditDialog(job: CronJob) {
    setEditorMode('edit')
    setEditingJobId(job.id)
    setDraft(buildDraftFromJob(job))
    setEditorError(null)
  }

  function closeEditor() {
    if (saving) return
    setEditorMode(null)
    setEditingJobId(null)
    setDraft(EMPTY_DRAFT)
    setEditorError(null)
  }

  function resetEditor() {
    setEditorMode(null)
    setEditingJobId(null)
    setDraft(EMPTY_DRAFT)
    setEditorError(null)
  }

  function closeRunsPanel() {
    setRunsJob(null)
    setRuns([])
    setRunsError(null)
  }

  async function handleSaveJob() {
    setSaving(true)
    setEditorError(null)
    const result = editorMode === 'create'
      ? await createCronJobResult(draft)
      : await updateCronJobResult(editingJobId ?? '', draft)

    if (!result.success) {
      setEditorError(result.error ?? t('common.unknownError'))
      setSaving(false)
      return
    }

    setFeedback({
      tone: 'success',
      message: editorMode === 'create' ? t('cron.createSuccess') : t('cron.updateSuccess'),
    })
    resetEditor()
    setSaving(false)
    await Promise.all([jobsState.refetch(), statusState.refetch()])
  }

  async function handleToggleJob(job: CronJob) {
    setBusyJobId(job.id)
    const result = await setCronJobEnabledResult(job.id, !job.enabled)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('common.unknownError') })
      setBusyJobId(null)
      return
    }
    setFeedback({
      tone: 'success',
      message: job.enabled ? t('cron.disableSuccess') : t('cron.enableSuccess'),
    })
    await Promise.all([jobsState.refetch(), statusState.refetch()])
    setBusyJobId(null)
  }

  async function handleRunJob(job: CronJob) {
    setBusyJobId(job.id)
    const result = await runCronJobResult(job.id)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('common.unknownError') })
      setBusyJobId(null)
      return
    }
    setFeedback({
      tone: 'success',
      message: result.data ? truncateForBanner(result.data) : t('cron.runSuccess'),
    })
    await Promise.all([jobsState.refetch(), statusState.refetch()])
    if (runsJob?.id === job.id) {
      await handleLoadRuns(job)
    }
    setBusyJobId(null)
  }

  async function handleDeleteJob() {
    if (!deleteTarget) return
    const current = deleteTarget
    setBusyJobId(current.id)
    setDeleteTarget(null)
    const result = await removeCronJobResult(current.id)
    if (!result.success) {
      setFeedback({ tone: 'error', message: result.error ?? t('common.unknownError') })
      setBusyJobId(null)
      return
    }
    if (runsJob?.id === current.id) {
      closeRunsPanel()
    }
    setFeedback({ tone: 'success', message: t('cron.deleteSuccess') })
    await Promise.all([jobsState.refetch(), statusState.refetch()])
    setBusyJobId(null)
  }

  async function handleLoadRuns(job: CronJob) {
    setRunsJob(job)
    setRunsLoading(true)
    setRunsError(null)
    const result = await getCronRunsResult(job.id, 20)
    if (!result.success) {
      setRuns([])
      setRunsError(result.error ?? t('common.unknownError'))
      setRunsLoading(false)
      return
    }
    setRuns(result.data ?? [])
    setRunsLoading(false)
  }

  if (jobsState.loading && !jobsState.data) {
    return <LoadingState message={t('cron.title')} />
  }

  return (
    <div className="page-shell page-shell-medium">
      {feedback ? (
        <ActionBanner tone={feedback.tone} message={feedback.message} onDismiss={() => setFeedback(null)} />
      ) : null}

      {gatewayIssue ? (
        <ActionBanner
          tone="error"
          message={t('cron.gatewayRequired')}
        />
      ) : null}

      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('cron.jobsCount', { count: jobs.length })}</span>
            <span>{gatewayReady ? t('cron.gatewayReady') : t('cron.gatewayStopped')}</span>
            <span>
              {statusState.data?.healthy ? t('cron.schedulerHealthy') : t('cron.schedulerUnknown')}
            </span>
          </div>
          <h1 className="page-title">{t('cron.title')}</h1>
          <p className="page-subtitle">{t('cron.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void refreshAll()} className="button-secondary">
            <RefreshCw className="h-4 w-4" />
            {t('common.refresh')}
          </button>
          <button type="button" onClick={openCreateDialog} className="button-primary" disabled={!gatewayReady}>
            <TimerReset className="h-4 w-4" />
            {t('cron.createJob')}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <p className="metric-label">{t('cron.totalJobs')}</p>
          <p className="metric-value">{jobs.length}</p>
          <p className="metric-meta">{t('cron.enabledDisabledSummary', { enabled: enabledCount, disabled: disabledCount })}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">{t('cron.scheduler')}</p>
          <p className={`metric-value ${statusState.data?.healthy ? 'text-green-600' : 'text-amber-600'}`}>
            {statusState.data?.healthy ? t('cron.schedulerHealthy') : t('cron.schedulerUnknown')}
          </p>
          <p className="metric-meta">
            {statusState.data?.jobsTotal != null ? t('cron.statusJobsTotal', { count: statusState.data.jobsTotal }) : t('cron.statusUnavailable')}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">{t('cron.gateway')}</p>
          <p className={`metric-value ${gatewayReady ? 'text-green-600' : 'text-red-600'}`}>
            {gatewayReady ? t('dashboard.running') : t('dashboard.stopped')}
          </p>
          <p className="metric-meta">
            <Link to="/gateway" className="text-primary hover:underline">
              {t('cron.openGateway')}
            </Link>
          </p>
        </div>
      </div>

      <div className="toolbar-card">
        <div className="toolbar-group">
          <label className="text-sm text-muted-foreground" htmlFor="cron-filter">
            {t('cron.filter')}
          </label>
          <select
            id="cron-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterMode)}
            className="control-select sm:w-auto"
          >
            <option value="all">{t('cron.filterAll')}</option>
            <option value="enabled">{t('cron.filterEnabled')}</option>
            <option value="disabled">{t('cron.filterDisabled')}</option>
          </select>
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredJobs.length} / {jobs.length}
        </span>
      </div>

      {jobsState.error && !jobsState.data ? (
        <div className="state-panel">
          <p className="text-muted-foreground">{jobsState.error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => void refreshAll()} className="button-secondary">
              {t('common.retry')}
            </button>
            <Link to="/gateway" className="button-primary">
              {t('cron.openGateway')}
            </Link>
          </div>
        </div>
      ) : null}

      {!jobsState.error && filteredJobs.length === 0 ? (
        <div className="state-panel">
          <TimerReset className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">{t('cron.noJobs')}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={openCreateDialog} className="button-primary" disabled={!gatewayReady}>
              {t('cron.createJob')}
            </button>
            <Link to="/gateway" className="button-secondary">
              {t('cron.openGateway')}
            </Link>
          </div>
        </div>
      ) : null}

      {filteredJobs.length > 0 ? (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const busy = busyJobId === job.id
            const runsExpanded = runsJob?.id === job.id
            const chatSessionKey = resolveCronWebUiSessionKey(job)
            const webUiHref = chatSessionKey && configState.data
              ? buildGatewayChatUrl(configState.data, chatSessionKey)
              : null
            return (
              <div key={job.id} className="list-card space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">{job.name || job.id}</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(job)}`}>
                        {job.enabled ? t('cron.enabled') : t('cron.disabled')}
                      </span>
                      {job.lastStatus ? (
                        <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                          {job.lastStatus}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{job.id}</p>
                    {job.description ? <p className="text-sm text-muted-foreground">{job.description}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {webUiHref ? (
                      <a
                        href={webUiHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button-secondary px-3 py-1.5 text-sm"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t('cron.openInWebUi')}
                      </a>
                    ) : null}
                    <button type="button" onClick={() => void handleToggleJob(job)} className="button-secondary px-3 py-1.5 text-sm" disabled={busy || !gatewayReady}>
                      {job.enabled ? t('cron.disable') : t('cron.enable')}
                    </button>
                    <button type="button" onClick={() => void handleRunJob(job)} className="button-secondary px-3 py-1.5 text-sm" disabled={busy || !gatewayReady}>
                      <Play className="h-4 w-4" />
                      {t('cron.runNow')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (runsExpanded) {
                          closeRunsPanel()
                          return
                        }
                        void handleLoadRuns(job)
                      }}
                      className="button-secondary px-3 py-1.5 text-sm"
                      disabled={!gatewayReady}
                    >
                      {runsExpanded ? t('common.close') : t('cron.viewRuns')}
                    </button>
                    <button type="button" onClick={() => openEditDialog(job)} className="button-secondary px-3 py-1.5 text-sm" disabled={!gatewayReady}>
                      <SquarePen className="h-4 w-4" />
                      {t('common.edit')}
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(job)} className="button-danger px-3 py-1.5 text-sm" disabled={!gatewayReady}>
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">{t('cron.schedule')}</p>
                    <p className="font-medium">{formatSchedule(job, t)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('cron.session')}</p>
                    <p className="font-medium">{job.session || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('cron.nextRun')}</p>
                    <p className="font-medium">{formatDateValue(job.nextRun, '-')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('cron.lastRun')}</p>
                    <p className="font-medium">{formatDateValue(job.lastRun, '-')}</p>
                  </div>
                </div>

                {(job.model || job.agent || job.channel || job.to) ? (
                  <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">{t('cron.model')}</p>
                      <p className="font-medium">{job.model || '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('cron.agent')}</p>
                      <p className="font-medium">{job.agent || '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('cron.channel')}</p>
                      <p className="font-medium">{job.channel || '-'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('cron.destination')}</p>
                      <p className="font-medium">{job.to || '-'}</p>
                    </div>
                  </div>
                ) : null}

                {job.message ? (
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">{t('cron.message')}</p>
                    <p className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-foreground">
                      {job.message}
                    </p>
                  </div>
                ) : null}

                {runsExpanded ? (
                  <section className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {t('cron.runHistoryTitle', { name: job.name || job.id })}
                        </h3>
                        <p className="text-sm text-muted-foreground">{job.id}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleLoadRuns(job)}
                          className="button-secondary px-3 py-1.5 text-sm"
                          disabled={runsLoading || !gatewayReady}
                        >
                          {t('common.refresh')}
                        </button>
                        <button
                          type="button"
                          onClick={closeRunsPanel}
                          className="button-secondary px-3 py-1.5 text-sm"
                        >
                          {t('common.close')}
                        </button>
                      </div>
                    </div>

                    {runsLoading ? <LoadingState message={t('cron.loadingRuns')} fullPage={false} /> : null}
                    {!runsLoading && runsError ? <div className="surface-card-danger text-sm">{runsError}</div> : null}
                    {!runsLoading && !runsError && runs.length === 0 ? (
                      <div className="state-panel min-h-[12rem] text-muted-foreground">{t('cron.noRuns')}</div>
                    ) : null}

                    {!runsLoading && runs.length > 0 ? (
                      <div className="space-y-3">
                        {runs.map((run) => (
                          <div key={run.id} className="list-card bg-background/70">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${runBadgeClass(run)}`}>
                                  {run.status || t('cron.statusUnknown')}
                                </span>
                                {run.exitCode != null ? (
                                  <span className="text-xs text-muted-foreground">
                                    {t('cron.exitCode', { code: run.exitCode })}
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDateValue(run.startedAt, '-')}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                              <div>
                                <p className="text-muted-foreground">{t('cron.startedAt')}</p>
                                <p className="font-medium">{formatDateValue(run.startedAt, '-')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">{t('cron.finishedAt')}</p>
                                <p className="font-medium">{formatDateValue(run.finishedAt, '-')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">{t('cron.duration')}</p>
                                <p className="font-medium">{run.durationMs != null ? t('cron.durationMs', { value: run.durationMs }) : '-'}</p>
                              </div>
                            </div>
                            {run.output ? (
                              <pre className="mt-3 overflow-auto rounded-2xl border border-border/70 bg-muted/20 p-3 text-xs text-foreground whitespace-pre-wrap">
                                {run.output}
                              </pre>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      <ConfirmDialog
        open={editorMode !== null}
        title={editorMode === 'create' ? t('cron.createTitle') : t('cron.editTitle')}
        description={t('cron.editorDescription')}
        confirmLabel={editorMode === 'create' ? t('cron.createJob') : t('common.save')}
        busy={saving}
        onCancel={closeEditor}
        onConfirm={() => void handleSaveJob()}
        panelClassName="max-h-[calc(100vh-2.5rem)] max-w-[min(96vw,96rem)] flex flex-col bg-background/95"
        headerClassName="shrink-0 border-b border-border/70 bg-card/80 pb-5"
        bodyClassName="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6"
        actionsClassName="shrink-0 border-t border-border/70 bg-background/95"
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,30rem)]">
          {editorError ? <div className="surface-card-danger text-sm">{editorError}</div> : null}

          <div className="space-y-5">
            <section className="rounded-[1.7rem] border border-border/80 bg-card/90 p-5 backdrop-blur-sm">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.name')}</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    className="control-input"
                    placeholder={t('cron.namePlaceholder')}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.description')}</span>
                  <input
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                    className="control-input"
                    placeholder={t('cron.descriptionPlaceholder')}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[1.7rem] border border-border/80 bg-card/90 p-5 backdrop-blur-sm">
              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('cron.message')}
                </p>
                <p className="text-sm text-muted-foreground">{t('cron.messagePlaceholder')}</p>
              </div>

              <div className="grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.message')}</span>
                  <textarea
                    value={draft.message}
                    onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                    className="control-textarea min-h-36"
                    placeholder={t('cron.messagePlaceholder')}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.systemEvent')}</span>
                  <textarea
                    value={draft.systemEvent}
                    onChange={(event) => setDraft((current) => ({ ...current, systemEvent: event.target.value }))}
                    className="control-textarea min-h-24"
                    placeholder={t('cron.systemEventPlaceholder')}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[1.7rem] border border-border/80 bg-card/90 p-5 backdrop-blur-sm">
              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('cron.session')}
                </p>
                <p className="text-sm text-muted-foreground">{t('cron.editorDescription')}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.session')}</span>
                  <select
                    value={draft.session}
                    onChange={(event) => setDraft((current) => ({ ...current, session: event.target.value }))}
                    className="control-select"
                  >
                    <option value="main">main</option>
                    <option value="isolated">isolated</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.sessionKey')}</span>
                  <input
                    value={draft.sessionKey}
                    onChange={(event) => setDraft((current) => ({ ...current, sessionKey: event.target.value }))}
                    className="control-input"
                    placeholder="agent:main:daily"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.model')}</span>
                  <input
                    value={draft.model}
                    onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                    className="control-input"
                    placeholder="openai/gpt-4.1"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.agent')}</span>
                  <input
                    value={draft.agent}
                    onChange={(event) => setDraft((current) => ({ ...current, agent: event.target.value }))}
                    className="control-input"
                    placeholder="main"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.channel')}</span>
                  <input
                    value={draft.channel}
                    onChange={(event) => setDraft((current) => ({ ...current, channel: event.target.value }))}
                    className="control-input"
                    placeholder="telegram"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">{t('cron.destination')}</span>
                  <input
                    value={draft.to}
                    onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                    className="control-input"
                    placeholder="@ops-room"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-4">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.announce}
                    onChange={(event) => setDraft((current) => ({ ...current, announce: event.target.checked }))}
                  />
                  <span>{t('cron.announce')}</span>
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  <span>{t('cron.enabledOnSave')}</span>
                </label>
              </div>
            </section>
          </div>

          <aside className="xl:sticky xl:top-0 xl:self-start">
            <section
              className={`rounded-[1.8rem] border p-5 backdrop-blur-sm ${
                schedulePreview.tone === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-border/80 bg-gradient-to-br from-card via-background to-background'
              }`}
            >
              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {t('cron.scheduleHelperTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground">{t('cron.scheduleHelperDescription')}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">{t('cron.scheduleType')}</span>
                    <select
                      value={draft.scheduleType}
                      onChange={(event) => setDraft((current) => ({ ...current, scheduleType: event.target.value as CronJobDraft['scheduleType'] }))}
                      className="control-select"
                    >
                      <option value="cron">{t('cron.scheduleTypeCron')}</option>
                      <option value="every">{t('cron.scheduleTypeEvery')}</option>
                      <option value="at">{t('cron.scheduleTypeAt')}</option>
                    </select>
                  </label>

                  {draft.scheduleType === 'cron' ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">{t('cron.cronExpression')}</span>
                      <input
                        value={draft.cron}
                        onChange={(event) => setDraft((current) => ({ ...current, cron: event.target.value }))}
                        className="control-input"
                        placeholder="0 8 * * 1-5"
                      />
                    </label>
                  ) : null}

                  {draft.scheduleType === 'every' ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">{t('cron.interval')}</span>
                      <input
                        value={draft.every}
                        onChange={(event) => setDraft((current) => ({ ...current, every: event.target.value }))}
                        className="control-input"
                        placeholder="30m"
                      />
                    </label>
                  ) : null}

                  {draft.scheduleType === 'at' ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">{t('cron.runAt')}</span>
                      <input
                        value={draft.at}
                        onChange={(event) => setDraft((current) => ({ ...current, at: event.target.value }))}
                        className="control-input"
                        placeholder="2026-04-18T09:00:00+08:00"
                      />
                    </label>
                  ) : null}

                  {(draft.scheduleType === 'cron' || draft.scheduleType === 'at') ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">{t('cron.timezone')}</span>
                      <input
                        value={draft.tz}
                        onChange={(event) => setDraft((current) => ({ ...current, tz: event.target.value }))}
                        className="control-input"
                        placeholder="Asia/Shanghai"
                      />
                    </label>
                  ) : null}
                </div>

                <div
                  className="min-w-0 rounded-[1.4rem] border border-border/70 bg-background/80 px-4 py-4"
                  aria-live="polite"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t('cron.schedulePreviewLabel')}
                  </p>
                  <p className="mt-1 text-base font-semibold text-foreground">{schedulePreview.summary}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{schedulePreview.detail}</p>
                </div>

                {schedulePresets.length > 0 ? (
                  <div className="rounded-[1.4rem] border border-border/70 bg-background/70 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {t('cron.schedulePresets')}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {schedulePresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setDraft((current) => preset.apply(current))}
                          className="rounded-full border border-border/70 bg-background/85 px-3 py-1.5 text-sm text-foreground transition hover:border-primary/40 hover:text-primary"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? t('cron.deleteTitle', { name: deleteTarget.name || deleteTarget.id }) : ''}
        description={t('cron.deleteDescription')}
        tone="danger"
        busy={deleteTarget ? busyJobId === deleteTarget.id : false}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteJob()}
      />
    </div>
  )
}
