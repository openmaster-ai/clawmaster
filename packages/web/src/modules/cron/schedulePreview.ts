import type { TFunction } from 'i18next'
import type { CronJobDraft } from '@/shared/adapters/cron'

export interface SchedulePreview {
  summary: string
  detail: string
  tone: 'default' | 'warning'
}

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(?:([zZ])|([+-]\d{2}:\d{2}))?$/
const OFFSET_PATTERN = /^[+-](\d{2}):(\d{2})$/
const ISO_DATE_TIME_SHAPE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[zZ]|[+-]\d{2}:\d{2})?$/

function isFixedNumber(value: string) {
  return /^\d+$/.test(value)
}

function isRelativeDuration(value: string) {
  return /^\+?\d+\s*(ms|s|m|h|d|w)$/i.test(value)
}

function isCronFieldValid(value: string, min: number, max: number) {
  const segments = value.split(',')
  const domainSize = max - min + 1

  return segments.every((segment) => {
    const trimmed = segment.trim()
    if (!trimmed) return false

    const stepParts = trimmed.split('/')
    if (stepParts.length > 2) return false

    const [base, step] = stepParts
    if (!base) return false

    if (step != null) {
      if (!isFixedNumber(step)) return false
      const stepValue = Number(step)
      if (stepValue < 1 || stepValue > domainSize) return false
    }

    if (base === '*') return true

    if (base.includes('-')) {
      const rangeParts = base.split('-')
      if (rangeParts.length !== 2) return false
      const [rangeStart, rangeEnd] = rangeParts
      if (!isFixedNumber(rangeStart) || !isFixedNumber(rangeEnd)) return false
      const start = Number(rangeStart)
      const end = Number(rangeEnd)
      return start >= min && end <= max && start <= end
    }

    if (!isFixedNumber(base)) return false
    const numeric = Number(base)
    return numeric >= min && numeric <= max
  })
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

function parseIsoDateTimeParts(value: string) {
  const match = value.match(ISO_DATE_TIME_PATTERN)
  if (!match) return null

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionalText, zuluText, offsetText] = match
  if (offsetText) {
    const [, offsetHourText, offsetMinuteText] = offsetText.match(OFFSET_PATTERN) ?? []
    const offsetHour = Number(offsetHourText)
    const offsetMinute = Number(offsetMinuteText)
    if (!Number.isInteger(offsetHour) || !Number.isInteger(offsetMinute) || offsetHour > 23 || offsetMinute > 59) {
      return null
    }
  }

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

  const formattedSecond = secondText ? padTime(String(second)) : '00'
  const fractionalSuffix = secondText ? (fractionalText ?? '') : ''
  return {
    hasOffset: Boolean(zuluText || offsetText),
    display: `${yearText}-${monthText}-${dayText} ${hourText}:${minuteText}:${formattedSecond}${fractionalSuffix}`,
  }
}

function looksLikeIsoDateTime(value: string) {
  return ISO_DATE_TIME_SHAPE_PATTERN.test(value)
}

function parseNaiveDateTime(value: string) {
  const parsed = parseIsoDateTimeParts(value)
  if (!parsed || parsed.hasOffset) return null
  return parsed.display
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
    const timezoneName = draft.tz.trim()
    const timezone = timezoneName
      ? t('cron.schedulePreviewTimezoneValue', { value: timezoneName })
      : t('cron.schedulePreviewTimezoneRuntime')

    if (parts.length !== 5 && parts.length !== 6) {
      return {
        summary: t('cron.schedulePreviewCronFallback', { value: expression }),
        detail: t('cron.schedulePreviewFieldCount'),
        tone: 'warning',
      }
    }

    if (timezoneName && !validateTimezone(timezoneName)) {
      return {
        summary: t('cron.schedulePreviewCronFallback', { value: expression }),
        detail: t('cron.schedulePreviewInvalidTimezone', { value: timezoneName }),
        tone: 'warning',
      }
    }

    const [second, minute, hour, dayOfMonth, month, dayOfWeek] =
      parts.length === 6 ? parts : ['', ...parts]
    const secondValid = second === '' || isCronFieldValid(second, 0, 59)
    const minuteValid = isCronFieldValid(minute, 0, 59)
    const hourValid = isCronFieldValid(hour, 0, 23)
    const dayOfMonthValid = isCronFieldValid(dayOfMonth, 1, 31)
    const monthValid = isCronFieldValid(month, 1, 12)
    const dayOfWeekValid = isCronFieldValid(dayOfWeek, 0, 7)

    if (!secondValid || !minuteValid || !hourValid || !dayOfMonthValid || !monthValid || !dayOfWeekValid) {
      return {
        summary: t('cron.schedulePreviewCronFallback', { value: expression }),
        detail: t('cron.schedulePreviewInvalidCron'),
        tone: 'warning',
      }
    }

    const supportedShortcutSeconds = second === '' || second === '0'
    const minuteFixed = isFixedNumber(minute)
    const hourFixed = isFixedNumber(hour)

    if (supportedShortcutSeconds && minuteFixed && hourFixed && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewDailyAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (supportedShortcutSeconds && minuteFixed && hourFixed && dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
      return {
        summary: t('cron.schedulePreviewWeekdaysAt', { time: formatClock(hour, minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (supportedShortcutSeconds && minuteFixed && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return {
        summary: t('cron.schedulePreviewHourlyAt', { minute: padTime(minute) }),
        detail: timezone,
        tone: 'default',
      }
    }

    if (supportedShortcutSeconds && minuteFixed && hourFixed && dayOfMonth === '1' && month === '*' && dayOfWeek === '*') {
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

  if (isRelativeDuration(runAt)) {
    return {
      summary: t('cron.schedulePreviewAtRelative', { value: runAt.startsWith('+') ? runAt.slice(1) : runAt }),
      detail: t('cron.schedulePreviewAtRelativeHint'),
      tone: 'default',
    }
  }

  const isoDateTime = parseIsoDateTimeParts(runAt)
  const parsed = new Date(runAt)
  const timezone = draft.tz.trim()
  const naiveDateTime = !hasExplicitOffset(runAt) ? parseNaiveDateTime(runAt) : null
  const hasIsoDateTimeShape = looksLikeIsoDateTime(runAt)
  const parseableNonIsoDateTime = !hasIsoDateTimeShape && !Number.isNaN(parsed.getTime())

  if ((hasIsoDateTimeShape && !isoDateTime) || parseableNonIsoDateTime || (Number.isNaN(parsed.getTime()) && !isoDateTime)) {
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
    displayValue = naiveDateTime
  } else {
    displayValue = runAt
  }

  const offsetlessUtcWarning = !timezone && naiveDateTime && !hasExplicitOffset(runAt)
  const detail = timezone
    ? t('cron.schedulePreviewTimezoneValue', { value: timezone })
    : offsetlessUtcWarning
      ? t('cron.schedulePreviewAtUtcWarning')
      : t('cron.scheduleHelperHintAt')

  return {
    summary: t('cron.schedulePreviewAt', { value: displayValue }),
    detail,
    tone: offsetlessUtcWarning ? 'warning' : 'default',
  }
}
