import { beforeEach, describe, expect, it } from 'vitest'
import i18n, { changeLanguage } from '@/i18n'
import { buildSchedulePreview } from '../schedulePreview'

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

  it('uses runtime-default wording when a cron preview has no explicit timezone', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '0 8 * * 1-5',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs every weekday at 08:00',
      detail: 'Timezone: runtime default',
      tone: 'default',
    })
  })

  it('accepts six-field cron expressions', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '0 0 8 * * 1-5',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs every weekday at 08:00',
      detail: 'Timezone: runtime default',
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
    expect(preview.detail).toBe('Cron expressions use five or six space-separated fields.')
    expect(preview.tone).toBe('warning')
  })

  it('warns when cron minute or hour fields are out of range', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '60 24 * * *',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs using cron expression 60 24 * * *',
      detail: 'Minute and hour fields must stay within standard cron ranges.',
      tone: 'warning',
    })
  })

  it('warns when cron ranges, lists, or steps exceed the supported field range', () => {
    const rangePreview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '0-61 8 * * *',
      },
      t,
    )
    const listPreview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '5,61 8 * * *',
      },
      t,
    )
    const stepPreview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '*/70 * * * *',
      },
      t,
    )

    for (const preview of [rangePreview, listPreview, stepPreview]) {
      expect(preview.detail).toBe('Minute and hour fields must stay within standard cron ranges.')
      expect(preview.tone).toBe('warning')
    }
  })

  it('warns when a cron timezone is invalid', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        cron: '0 8 * * *',
        tz: 'Asia/Shanghaii',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs using cron expression 0 8 * * *',
      detail: 'Timezone Asia/Shanghaii is invalid. Use a valid IANA timezone name.',
      tone: 'warning',
    })
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

  it('renders one-shot previews in the selected timezone', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-05-01T09:00:00',
        tz: 'Asia/Shanghai',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs once at 2026-05-01 09:00:00',
      detail: 'Timezone: Asia/Shanghai',
      tone: 'default',
    })
  })

  it('accepts relative one-shot values', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '+30m',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs once after 30m',
      detail: 'Relative one-shot values are resolved by OpenClaw when the job is saved.',
      tone: 'default',
    })
  })

  it('warns when the selected timezone is invalid', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-05-01T09:00:00',
        tz: 'Asia/Shanghaii',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs once at 2026-05-01 09:00:00',
      detail: 'Timezone Asia/Shanghaii is invalid. Use a valid IANA timezone name.',
      tone: 'warning',
    })
  })

  it('treats fractional-second naive one-shot timestamps as local wall-clock values', () => {
    const timezonePreview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-05-01T09:00:00.123',
        tz: 'Asia/Shanghai',
      },
      t,
    )
    const utcPreview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-05-01T09:00:00.123',
      },
      t,
    )

    expect(timezonePreview).toEqual({
      summary: 'Runs once at 2026-05-01 09:00:00.123',
      detail: 'Timezone: Asia/Shanghai',
      tone: 'default',
    })
    expect(utcPreview).toEqual({
      summary: 'Runs once at 2026-05-01 09:00:00.123',
      detail: 'No timezone or offset was provided. OpenClaw saves offset-less ISO timestamps as UTC.',
      tone: 'warning',
    })
  })

  it('rejects impossible one-shot calendar dates instead of normalizing them', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-02-29T09:00:00',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs once at 2026-02-29T09:00:00',
      detail: 'Use a valid ISO date and time.',
      tone: 'warning',
    })
  })

  it('preserves explicit offsets in one-shot previews when no timezone is selected', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-05-01T09:00:00+08:00',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs once at 2026-05-01T09:00:00+08:00',
      detail: 'Use an ISO timestamp with an offset, or pair a local time with a timezone.',
      tone: 'default',
    })
  })

  it('keeps timezone-less one-shot previews neutral instead of using browser local time', () => {
    const preview = buildSchedulePreview(
      {
        ...baseDraft(),
        scheduleType: 'at',
        at: '2026-05-01T09:00:00',
      },
      t,
    )

    expect(preview).toEqual({
      summary: 'Runs once at 2026-05-01 09:00:00',
      detail: 'No timezone or offset was provided. OpenClaw saves offset-less ISO timestamps as UTC.',
      tone: 'warning',
    })
  })
})
