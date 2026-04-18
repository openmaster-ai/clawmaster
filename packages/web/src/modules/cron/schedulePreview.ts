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

function isInRange(value: string, min: number, max: number) {
  if (!isFixedNumber(value)) return false
  const numeric = Number(value)
  return numeric >= min && numeric <= max
}

function padTime(value: string) {
  return value.padStart(2, '0')
}

function formatClock(hour: string, minute: string) {
  return `${padTime(hour)}:${padTime(minute)}`
}

function hasExplicitOffset(value: string) {
  return /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value)
}

function validateTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return true
  } catch {
    return false
  }
}

function parseNaiveDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText ?? '00')

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null
  }

  return `${yearText}-${monthText}-${dayText} ${hourText}:${minuteText}:${padTime(String(second))}`
}

function formatDateInTimezone(value: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = Object.fromEntries(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    )
    if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute || !parts.second) {
      return null
    }
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  } catch {
    return null
  }
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
    const minuteValid = isInRange(minute, 0, 59)
    const hourValid = isInRange(hour, 0, 23)

    if (
      (isFixedNumber(minute) && !minuteValid) ||
      (isFixedNumber(hour) && !hourValid)
    ) {
      return {
        summary: t('cron.schedulePreviewCronFallback', { value: expression }),
        detail: t('cron.schedulePreviewInvalidCron'),
        tone: 'warning',
      }
    }

    if (minuteValid && hourValid && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewDailyAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (minuteValid && hourValid && dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
      return {
        summary: t('cron.schedulePreviewWeekdaysAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (minuteValid && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewHourlyAt', { minute: padTime(minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (minuteValid && hourValid && dayOfMonth === '1' && month === '*' && dayOfWeek === '*') {
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
  const timezone = draft.tz.trim()
  const naiveDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/
  const hasNaiveDateTime = naiveDateTimePattern.test(runAt)
  const naiveDateTime = !hasExplicitOffset(runAt) ? parseNaiveDateTime(runAt) : null

  if ((hasNaiveDateTime && !naiveDateTime) || (!naiveDateTime && Number.isNaN(parsed.getTime()))) {
    return {
      summary: t('cron.schedulePreviewAt', { value: runAt }),
      detail: t('cron.schedulePreviewInvalidAt'),
      tone: 'warning',
    }
  }

  if (timezone && !validateTimezone(timezone)) {
    return {
      summary: t('cron.schedulePreviewAt', { value: naiveDateTime ?? runAt }),
      detail: t('cron.schedulePreviewInvalidTimezone', { value: timezone }),
      tone: 'warning',
    }
  }

  let displayValue: string
  if (timezone && naiveDateTime) {
    displayValue = naiveDateTime
  } else if (timezone) {
    const formatted = formatDateInTimezone(parsed, timezone)
    if (!formatted) {
      return {
        summary: t('cron.schedulePreviewAt', { value: runAt }),
        detail: t('cron.schedulePreviewInvalidTimezone', { value: timezone }),
        tone: 'warning',
      }
    }
    displayValue = formatted
  } else if (hasExplicitOffset(runAt)) {
    displayValue = runAt
  } else if (naiveDateTime) {
    displayValue = parsed.toLocaleString()
  } else {
    displayValue = parsed.toLocaleString()
  }

  return {
    summary: t('cron.schedulePreviewAt', { value: displayValue }),
    detail: timezone
      ? t('cron.schedulePreviewTimezoneValue', { value: timezone })
      : t('cron.scheduleHelperHintAt'),
    tone: 'default',
  }
}
