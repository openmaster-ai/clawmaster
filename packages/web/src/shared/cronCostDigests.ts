import type { TFunction } from 'i18next'
import type { CronJobDraft } from '@/shared/adapters/cron'

export type CostDigestPeriod = 'day' | 'week' | 'month'
export type PackageDownloadPeriod = 'week' | 'month'

type CostDigestTemplateMeta = {
  period: CostDigestPeriod
  cron: string
  labelKey: string
  descriptionKey: string
  scheduleKey: string
}

const COST_DIGEST_TEMPLATES: CostDigestTemplateMeta[] = [
  {
    period: 'day',
    cron: '0 8 * * *',
    labelKey: 'observe.digestPresetDayLabel',
    descriptionKey: 'observe.digestPresetDayDesc',
    scheduleKey: 'observe.digestPresetDaySchedule',
  },
  {
    period: 'week',
    cron: '0 8 * * 1',
    labelKey: 'observe.digestPresetWeekLabel',
    descriptionKey: 'observe.digestPresetWeekDesc',
    scheduleKey: 'observe.digestPresetWeekSchedule',
  },
  {
    period: 'month',
    cron: '0 8 1 * *',
    labelKey: 'observe.digestPresetMonthLabel',
    descriptionKey: 'observe.digestPresetMonthDesc',
    scheduleKey: 'observe.digestPresetMonthSchedule',
  },
]

export function getPreferredCostDigestTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isCostDigestPeriod(value: string | null | undefined): value is CostDigestPeriod {
  return value === 'day' || value === 'week' || value === 'month'
}

export function isPackageDownloadPeriod(value: string | null | undefined): value is PackageDownloadPeriod {
  return value === 'week' || value === 'month'
}

export function getCostDigestTemplates(t: TFunction) {
  return COST_DIGEST_TEMPLATES.map((template) => ({
    ...template,
    label: t(template.labelKey),
    description: t(template.descriptionKey),
    schedule: t(template.scheduleKey),
    href: `/cron?template=cost-digest&period=${template.period}`,
  }))
}

export function buildCostDigestDraft(period: CostDigestPeriod, t: TFunction): CronJobDraft {
  const template = COST_DIGEST_TEMPLATES.find((item) => item.period === period) ?? COST_DIGEST_TEMPLATES[0]!

  return {
    name: t(`observe.digestDraft.${period}.name`),
    description: t(`observe.digestDraft.${period}.description`),
    scheduleType: 'cron',
    cron: template.cron,
    every: '',
    at: '',
    tz: getPreferredCostDigestTimezone(),
    session: 'isolated',
    sessionKey: '',
    model: '',
    agent: 'main',
    announce: false,
    channel: '',
    to: '',
    message: t(`observe.digestDraft.${period}.prompt`),
    systemEvent: '',
    enabled: true,
  }
}

export function buildPackageDownloadDraft(period: PackageDownloadPeriod, t: TFunction): CronJobDraft {
  return {
    name: t(`cron.packageDownloadsDraft.${period}.name`),
    description: t(`cron.packageDownloadsDraft.${period}.description`),
    scheduleType: 'cron',
    cron: '0 8 * * *',
    every: '',
    at: '',
    tz: getPreferredCostDigestTimezone(),
    session: 'isolated',
    sessionKey: '',
    model: '',
    agent: 'main',
    announce: false,
    channel: '',
    to: '',
    message: t(`cron.packageDownloadsDraft.${period}.prompt`),
    systemEvent: '',
    enabled: true,
  }
}
