import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createCronJobResult,
  getCronJobsResult,
  getCronStatusResult,
  getCronRunsResult,
  updateCronJobResult,
} from '../cron'

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
}))

describe('cron adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mockExec(output: string) {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(output)
  }

  async function latestCall() {
    const { execCommand } = await import('../platform')
    return vi.mocked(execCommand).mock.calls.at(-1)
  }

  it('parses cron jobs from a jobs array payload', async () => {
    await mockExec(JSON.stringify({
      jobs: [
        {
          id: 'job-1',
          name: 'Morning report',
          description: 'Daily summary',
          enabled: true,
          cron: '0 8 * * 1-5',
          tz: 'Asia/Shanghai',
          session: 'main',
          model: 'openai/gpt-4.1',
          agent: 'main',
          announce: true,
          channel: 'telegram',
          to: '@ops-room',
          payload: {
            agentTurn: {
              message: 'Send the daily report',
            },
          },
          nextRunAt: '2026-04-18T08:00:00+08:00',
          lastRun: {
            startedAt: '2026-04-17T08:00:00+08:00',
            status: 'success',
          },
        },
      ],
    }))

    const result = await getCronJobsResult()

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]).toMatchObject({
      id: 'job-1',
      name: 'Morning report',
      scheduleType: 'cron',
      cron: '0 8 * * 1-5',
      tz: 'Asia/Shanghai',
      enabled: true,
      channel: 'telegram',
      to: '@ops-room',
      message: 'Send the daily report',
      nextRun: '2026-04-18T08:00:00+08:00',
      lastStatus: 'success',
    })
  })

  it('builds create args for a disabled cron job', async () => {
    await mockExec('')

    const result = await createCronJobResult({
      name: 'Morning report',
      description: 'Daily summary',
      scheduleType: 'cron',
      cron: '0 8 * * 1-5',
      every: '',
      at: '',
      tz: 'Asia/Shanghai',
      session: 'main',
      sessionKey: '',
      model: 'openai/gpt-4.1',
      agent: 'main',
      announce: true,
      channel: 'telegram',
      to: '@ops-room',
      message: 'Send the daily report',
      systemEvent: '',
      enabled: false,
    })

    expect(result.success).toBe(true)
    expect(await latestCall()).toEqual([
      'openclaw',
      [
        'cron',
        'add',
        '--name',
        'Morning report',
        '--description',
        'Daily summary',
        '--message',
        'Send the daily report',
        '--model',
        'openai/gpt-4.1',
        '--agent',
        'main',
        '--session',
        'main',
        '--channel',
        'telegram',
        '--to',
        '@ops-room',
        '--announce',
        '--cron',
        '0 8 * * 1-5',
        '--tz',
        'Asia/Shanghai',
        '--disabled',
      ],
    ])
  })

  it('builds create args with no-deliver when announce is off', async () => {
    await mockExec('')

    const result = await createCronJobResult({
      name: 'Weekly digest',
      description: 'Digest without announce delivery',
      scheduleType: 'cron',
      cron: '0 8 * * 1',
      every: '',
      at: '',
      tz: '',
      session: 'isolated',
      sessionKey: '',
      model: '',
      agent: 'main',
      announce: false,
      channel: '',
      to: '',
      message: 'Generate the weekly digest',
      systemEvent: '',
      enabled: true,
    })

    expect(result.success).toBe(true)
    expect(await latestCall()).toEqual([
      'openclaw',
      [
        'cron',
        'add',
        '--name',
        'Weekly digest',
        '--description',
        'Digest without announce delivery',
        '--message',
        'Generate the weekly digest',
        '--agent',
        'main',
        '--session',
        'isolated',
        '--no-deliver',
        '--cron',
        '0 8 * * 1',
      ],
    ])
  })

  it('builds edit args and clears announce delivery when disabled in the form', async () => {
    await mockExec('')

    const result = await updateCronJobResult('job-1', {
      name: 'Catch up',
      description: '',
      scheduleType: 'every',
      cron: '',
      every: '15m',
      at: '',
      tz: '',
      session: 'isolated',
      sessionKey: 'agent:main:catch-up',
      model: '',
      agent: '',
      announce: false,
      channel: '',
      to: '',
      message: 'Check backlog',
      systemEvent: '',
      enabled: false,
    })

    expect(result.success).toBe(true)
    expect(await latestCall()).toEqual([
      'openclaw',
      [
        'cron',
        'edit',
        'job-1',
        '--name',
        'Catch up',
        '--message',
        'Check backlog',
        '--session',
        'isolated',
        '--session-key',
        'agent:main:catch-up',
        '--no-deliver',
        '--every',
        '15m',
        '--disable',
      ],
    ])
  })

  it('parses JSONL run history output', async () => {
    await mockExec(
      [
        JSON.stringify({
          runId: 'run-1',
          status: 'success',
          startedAt: '2026-04-18T08:00:00+08:00',
          finishedAt: '2026-04-18T08:00:10+08:00',
          durationMs: 10_000,
          exitCode: 0,
          output: 'done',
        }),
        JSON.stringify({
          runId: 'run-2',
          status: 'failed',
          startedAt: '2026-04-17T08:00:00+08:00',
          stderr: 'boom',
        }),
      ].join('\n'),
    )

    const result = await getCronRunsResult('job-1', 20)

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data?.[0]).toMatchObject({
      id: 'run-1',
      status: 'success',
      exitCode: 0,
      output: 'done',
    })
    expect(result.data?.[1]).toMatchObject({
      id: 'run-2',
      status: 'failed',
      output: 'boom',
    })
  })

  it('parses scheduler health summary from status json', async () => {
    await mockExec(JSON.stringify({
      health: 'healthy',
      jobs: {
        total: 3,
        enabled: 2,
        disabled: 1,
      },
    }))

    const result = await getCronStatusResult()

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      healthy: true,
      running: true,
      jobsTotal: 3,
      enabledJobs: 2,
      disabledJobs: 1,
    })
  })

  it('parses current gateway status payloads that use enabled + jobs count', async () => {
    await mockExec(JSON.stringify({
      enabled: true,
      storePath: '/home/test/.openclaw/cron/jobs.json',
      jobs: 1,
      nextWakeAtMs: null,
    }))

    const result = await getCronStatusResult()

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      healthy: null,
      running: true,
      jobsTotal: 1,
    })
  })

  it('returns healthy: null when the payload does not report health explicitly', async () => {
    await mockExec(JSON.stringify({
      running: false,
      jobs: { total: 0, enabled: 0, disabled: 0 },
    }))

    const result = await getCronStatusResult()

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      running: false,
      healthy: null,
    })
  })

  it('returns healthy: false when the payload reports an error state', async () => {
    await mockExec(JSON.stringify({
      running: true,
      status: 'error: store unreadable',
    }))

    const result = await getCronStatusResult()

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      running: true,
      healthy: false,
    })
  })

  it('parses current gateway job payloads with state timestamps and everyMs schedules', async () => {
    await mockExec(JSON.stringify({
      jobs: [
        {
          id: 'job-1',
          name: 'ClawMaster UI proof',
          enabled: true,
          schedule: {
            kind: 'every',
            everyMs: 900000,
            anchorMs: 1776456090460,
          },
          sessionTarget: 'main',
          payload: {
            kind: 'systemEvent',
            text: 'ClawMaster cron proof',
          },
          state: {
            lastRunAtMs: 1776478903602,
            lastRunStatus: 'ok',
            lastStatus: 'ok',
            nextRunAtMs: 1776479803602,
          },
        },
      ],
    }))

    const result = await getCronJobsResult()

    expect(result.success).toBe(true)
    expect(result.data?.[0]).toMatchObject({
      id: 'job-1',
      name: 'ClawMaster UI proof',
      scheduleType: 'every',
      every: '15m',
      session: 'main',
      systemEvent: 'ClawMaster cron proof',
      lastStatus: 'ok',
      nextRun: '2026-04-18T02:36:43.602Z',
      lastRun: '2026-04-18T02:21:43.602Z',
    })
  })

  it('parses current gateway run history entries payloads', async () => {
    await mockExec(JSON.stringify({
      entries: [
        {
          ts: 1776478932492,
          jobId: 'job-1',
          action: 'finished',
          status: 'ok',
          summary: 'ClawMaster cron proof',
          runAtMs: 1776478903602,
          durationMs: 28888,
          deliveryStatus: 'not-requested',
        },
      ],
      total: 1,
      offset: 0,
      limit: 5,
      hasMore: false,
      nextOffset: null,
    }))

    const result = await getCronRunsResult('job-1', 5)

    expect(result.success).toBe(true)
    expect(result.data?.[0]).toMatchObject({
      id: '1776478932492',
      status: 'ok',
      startedAt: '2026-04-18T02:21:43.602Z',
      finishedAt: '2026-04-18T02:22:12.492Z',
      durationMs: 28888,
      output: 'ClawMaster cron proof',
    })
  })

  it('rejects invalid create payloads before executing the command', async () => {
    await mockExec('')

    const result = await createCronJobResult({
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
    })

    expect(result.success).toBe(false)

    const { execCommand } = await import('../platform')
    expect(vi.mocked(execCommand)).not.toHaveBeenCalled()
  })
})
