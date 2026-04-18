import type { TFunction } from 'i18next'
import type { CronJobDraft } from '@/shared/adapters/cron'

export interface SchedulePreview {
  summary: string
  detail: string
  tone: 'default' | 'warning'
}

function isFixedNumber(value: string) {
  return /^\d+$/.test(value)
}

function padTime(value: string) {
  return value.padStart(2, '0')
}

function formatClock(hour: string, minute: string) {
  return `${padTime(hour)}:${padTime(minute)}`
}

function resolveLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export function preferredCronTimezone(current: string) {
  return current.trim() || resolveLocalTimezone()
}

export function buildSchedulePreview(draft: CronJobDraft, t: TFunction): SchedulePreview {
  if (draft.scheduleType === 'cron') {
    const expression = draft.cron.trim()
    if (!expression) {
      return {
        summary: t('cron.scheduleHelperEmpty'),
        detail: t('cron.scheduleHelperHintCron'),
        tone: 'warning',
      }
    }

    const parts = expression.split(/\s+/)
    const timezone = draft.tz.trim()
      ? t('cron.schedulePreviewTimezoneValue', { value: draft.tz.trim() })
      : t('cron.schedulePreviewTimezoneLocal')

    if (parts.length !== 5) {
      return {
        summary: t('cron.schedulePreviewCronFallback', { value: expression }),
        detail: t('cron.schedulePreviewFieldCount'),
        tone: 'warning',
      }
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

    if (isFixedNumber(minute) && isFixedNumber(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewDailyAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (isFixedNumber(minute) && isFixedNumber(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
      return {
        summary: t('cron.schedulePreviewWeekdaysAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (isFixedNumber(minute) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewHourlyAt', { minute: padTime(minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (isFixedNumber(minute) && isFixedNumber(hour) && dayOfMonth === '1' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewMonthlyAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    return {
      summary: t('cron.schedulePreviewCronFallback', { value: expression }),
      detail: timezone,
      tone: 'default',
    }
  }

  if (draft.scheduleType === 'every') {
    const interval = draft.every.trim()
    if (!interval) {
      return {
        summary: t('cron.scheduleHelperEmpty'),
        detail: t('cron.scheduleHelperHintEvery'),
        tone: 'warning',
      }
    }

    const validInterval = /^\d+\s*(ms|s|m|h|d|w)$/i.test(interval)
    return {
      summary: t('cron.schedulePreviewEvery', { value: interval }),
      detail: validInterval ? t('cron.scheduleHelperHintEvery') : t('cron.schedulePreviewInvalidInterval'),
      tone: validInterval ? 'default' : 'warning',
    }
  }

  const runAt = draft.at.trim()
  if (!runAt) {
    return {
      summary: t('cron.scheduleHelperEmpty'),
      detail: t('cron.scheduleHelperHintAt'),
      tone: 'warning',
    }
  }

  const parsed = new Date(runAt)
  if (Number.isNaN(parsed.getTime())) {
    return {
      summary: t('cron.schedulePreviewAt', { value: runAt }),
      detail: t('cron.schedulePreviewInvalidAt'),
      tone: 'warning',
    }
  }

  return {
    summary: t('cron.schedulePreviewAt', { value: parsed.toLocaleString() }),
    detail: draft.tz.trim()
      ? t('cron.schedulePreviewTimezoneValue', { value: draft.tz.trim() })
      : t('cron.scheduleHelperHintAt'),
    tone: 'default',
  }
}
