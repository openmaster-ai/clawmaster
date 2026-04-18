import { beforeEach, describe, expect, it } from 'vitest'
import i18n, { changeLanguage } from '@/i18n'
import { buildSchedulePreview, preferredCronTimezone } from '../schedulePreview'

const t = i18n.t.bind(i18n)

function baseDraft() {
  return {
    name: '',
    description: '',
    scheduleType: 'cron' as const,
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
}

describe('schedulePreview', () => {
  beforeEach(async () => {
    await changeLanguage('en')
  })

  it('describes a weekday cron schedule in human-readable form', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '0 8 * * 1-5',
        tz: 'Asia/Shanghai',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs every weekday at 08:00',
      detail: 'Timezone: Asia/Shanghai',
      tone: 'default',
    })
  })

  it('warns when a cron expression is incomplete', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '0 8 * *',
      },
      t,
    )

    expect(preview.summary).toBe('Runs using cron expression 0 8 * *')
    expect(preview.detail).toBe('Cron expressions use five space-separated fields.')
    expect(preview.tone).toBe('warning')
  })

  it('describes interval schedules and validates the syntax', () => {
    const validPreview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'every',
        every: '15m',
      },
      t,
    )
    const invalidPreview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'every',
        every: 'fifteen minutes',
      },
      t,
    )

    expect(validPreview).toEqual({
      summary: 'Runs every 15m',
      detail: 'Use OpenClaw interval syntax like 15m, 1h, or 1d.',
      tone: 'default',
    })
    expect(invalidPreview.tone).toBe('warning')
    expect(invalidPreview.detail).toBe('Use a duration like 15m, 1h, or 1d.')
  })

  it('falls back to the local timezone helper when no timezone is set', () => {
    expect(preferredCronTimezone('Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(preferredCronTimezone('')).not.toBe('')
  })
})
