import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import { getPreferredCostDigestTimezone } from '@/shared/cronCostDigests'
import CronPage from '../CronPage'

const mockGetCronJobs = vi.fn()
const mockGetCronStatus = vi.fn()
const mockGetCronRuns = vi.fn()
const mockCreateCronJob = vi.fn()
const mockUpdateCronJob = vi.fn()
const mockRemoveCronJob = vi.fn()
const mockRunCronJob = vi.fn()
const mockSetCronJobEnabled = vi.fn()
const mockGetGatewayStatus = vi.fn()
const mockGetConfig = vi.fn()

vi.mock('@/shared/adapters/cron', () => ({
  getCronJobsResult: (...args: any[]) => mockGetCronJobs(...args),
  getCronStatusResult: (...args: any[]) => mockGetCronStatus(...args),
  getCronRunsResult: (...args: any[]) => mockGetCronRuns(...args),
  createCronJobResult: (...args: any[]) => mockCreateCronJob(...args),
  updateCronJobResult: (...args: any[]) => mockUpdateCronJob(...args),
  removeCronJobResult: (...args: any[]) => mockRemoveCronJob(...args),
  runCronJobResult: (...args: any[]) => mockRunCronJob(...args),
  setCronJobEnabledResult: (...args: any[]) => mockSetCronJobEnabled(...args),
}))

vi.mock('@/shared/adapters/gateway', () => ({
  getGatewayStatusResult: (...args: any[]) => mockGetGatewayStatus(...args),
}))

vi.mock('@/shared/adapters/openclaw', () => ({
  getConfigResult: (...args: any[]) => mockGetConfig(...args),
}))

function renderPage(initialEntries: string[] = ['/cron']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CronPage />
    </MemoryRouter>,
  )
}

function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    name: 'Morning report',
    description: 'Daily summary',
    enabled: true,
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
    nextRun: '2026-04-18T08:00:00+08:00',
    lastRun: '2026-04-17T08:00:00+08:00',
    lastStatus: 'success',
    raw: {},
    ...overrides,
  }
}

describe('CronPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')

    mockGetCronJobs.mockResolvedValue({
      success: true,
      data: [baseJob()],
    })
    mockGetCronStatus.mockResolvedValue({
      success: true,
      data: {
        running: true,
        healthy: true,
        jobsTotal: 1,
        enabledJobs: 1,
        disabledJobs: 0,
        raw: {},
      },
    })
    mockGetGatewayStatus.mockResolvedValue({
      success: true,
      data: {
        running: true,
        port: 18789,
      },
    })
    mockGetConfig.mockResolvedValue({
      success: true,
      data: {
        gateway: {
          port: 18789,
          bind: 'loopback',
          auth: { mode: 'token', token: 'secret-token' },
        },
      },
    })
    mockGetCronRuns.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'run-1',
          status: 'success',
          startedAt: '2026-04-18T08:00:00+08:00',
          finishedAt: '2026-04-18T08:00:10+08:00',
          durationMs: 10000,
          exitCode: 0,
          output: 'done',
          raw: {},
        },
      ],
    })
    mockCreateCronJob.mockResolvedValue({ success: true, data: undefined })
    mockUpdateCronJob.mockResolvedValue({ success: true, data: undefined })
    mockRemoveCronJob.mockResolvedValue({ success: true, data: undefined })
    mockRunCronJob.mockResolvedValue({ success: true, data: 'requested' })
    mockSetCronJobEnabled.mockResolvedValue({ success: true, data: undefined })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders cron jobs and loads run history for a selected job', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    expect(screen.getByText('Morning report')).toBeInTheDocument()
    expect(screen.getByText('Daily summary')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in WebUI' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:18789/chat?token=secret-token&session=agent%3Amain%3Amain',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run History' }))

    await waitFor(() => {
      expect(mockGetCronRuns).toHaveBeenCalledWith('job-1', 20)
    })
    expect(await screen.findByText('done')).toBeInTheDocument()
  })

  it('opens cron jobs with explicit session keys in the webui chat', async () => {
    mockGetCronJobs.mockResolvedValue({
      success: true,
      data: [baseJob({ sessionKey: 'agent:main:daily-report' })],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in WebUI' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:18789/chat?token=secret-token&session=agent%3Amain%3Adaily-report',
    )
  })

  it('opens isolated cron jobs in the stable cron session after they have run', async () => {
    mockGetCronJobs.mockResolvedValue({
      success: true,
      data: [baseJob({
        id: 'job-isolated',
        session: 'isolated',
        sessionKey: '',
        agent: 'main',
      })],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in WebUI' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:18789/chat?token=secret-token&session=agent%3Amain%3Acron%3Ajob-isolated',
    )
  })

  it('submits the create dialog through the cron adapter', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Evening report' },
    })
    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '0 18 * * *' },
    })
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Send the evening report' },
    })

    const dialog = screen.getByRole('dialog', { name: 'Create Cron Job' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Job' }))

    await waitFor(() => {
      expect(mockCreateCronJob).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Evening report',
        scheduleType: 'cron',
        cron: '0 18 * * *',
        message: 'Send the evening report',
      }))
    })
  })

  it('opens the create dialog with a prefilled cost digest template from the observe flow', async () => {
    renderPage(['/cron?template=cost-digest&period=week'])

    expect(await screen.findByRole('dialog', { name: 'Create Cron Job' })).toBeInTheDocument()
    expect(screen.getByText('Loaded the Week cost digest template. Review the prompt, choose delivery, and save the job.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Weekly Cost Digest')
    expect(screen.getByLabelText('Cron expression')).toHaveValue('0 8 * * 1')
    expect(screen.getByLabelText('Timezone')).toHaveValue(getPreferredCostDigestTimezone())
    expect(screen.getByLabelText('Session')).toHaveValue('isolated')
    expect(screen.getByLabelText('Agent')).toHaveValue('main')
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Use the installed clawprobe-cost-digest skill to generate the weekly OpenClaw cost digest for the last 7 days. Read the skill, run `node ${SKILL_DIR}/scripts/generate-digest.mjs --period week --summary`, and return only the generated markdown summary. Do not invent numbers or add extra commentary.',
    )
  })

  it('shows gateway-required state and disables create when the gateway is down', async () => {
    mockGetGatewayStatus.mockResolvedValueOnce({
      success: true,
      data: {
        running: false,
        port: 18789,
      },
    })

    renderPage()

    expect(await screen.findByText('OpenClaw cron commands depend on the gateway. Start the gateway before managing cron jobs.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Job' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open Gateway' })).toBeInTheDocument()
  })

  it('does not auto-open a cost digest template when the gateway is down', async () => {
    mockGetGatewayStatus.mockResolvedValueOnce({
      success: true,
      data: {
        running: false,
        port: 18789,
      },
    })

    renderPage(['/cron?template=cost-digest&period=week'])

    expect(await screen.findByText('OpenClaw cron commands depend on the gateway. Start the gateway before managing cron jobs.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create Cron Job' })).not.toBeInTheDocument()
  })

  it('opens the pending cost digest template after the gateway becomes ready', async () => {
    const intervalCallbacks: Array<() => void | Promise<void>> = []
    const setIntervalSpy = vi
      .spyOn(window, 'setInterval')
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === 'function') {
          intervalCallbacks.push(callback as () => void | Promise<void>)
        }
        return 1 as unknown as number
      }) as typeof window.setInterval)

    mockGetGatewayStatus
      .mockResolvedValueOnce({
        success: true,
        data: {
          running: false,
          port: 18789,
        },
      })
      .mockResolvedValue({
        success: true,
        data: {
          running: true,
          port: 18789,
        },
      })

    renderPage(['/cron?template=cost-digest&period=week'])

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('OpenClaw cron commands depend on the gateway. Start the gateway before managing cron jobs.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create Cron Job' })).not.toBeInTheDocument()

    await act(async () => {
      await Promise.all(intervalCallbacks.map((callback) => callback()))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Create Cron Job' })).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Name')).toHaveValue('Weekly Cost Digest')

    setIntervalSpy.mockRestore()
  })

  it('runs enable and delete actions through the cron adapter', async () => {
    mockGetCronJobs.mockResolvedValue({
      success: true,
      data: [baseJob({ enabled: false })],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() => {
      expect(mockSetCronJobEnabled).toHaveBeenCalledWith('job-1', true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Morning report?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockRemoveCronJob).toHaveBeenCalledWith('job-1')
    })
  })

  it('prefills the edit dialog from the selected job and dispatches updateCronJob', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit Cron Job' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Morning report')
    expect(within(dialog).getByLabelText('Cron expression')).toHaveValue('0 8 * * 1-5')
    expect(within(dialog).getByLabelText('Message')).toHaveValue('Send the daily report')

    fireEvent.change(within(dialog).getByLabelText('Message'), {
      target: { value: 'Updated prompt' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockUpdateCronJob).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ message: 'Updated prompt' }),
      )
    })
  })

  it('sends every-interval schedule fields to createCronJob', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Heartbeat' } })
    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'every' } })
    fireEvent.change(screen.getByLabelText('Interval'), { target: { value: '15m' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Pulse' } })

    const dialog = screen.getByRole('dialog', { name: 'Create Cron Job' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Job' }))

    await waitFor(() => {
      expect(mockCreateCronJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleType: 'every',
          every: '15m',
          cron: '',
          at: '',
          message: 'Pulse',
        }),
      )
    })
  })

  it('sends one-shot schedule fields to createCronJob', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'One-shot' } })
    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-05-01T09:00:00+08:00' },
    })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Fire once' } })

    const dialog = screen.getByRole('dialog', { name: 'Create Cron Job' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Job' }))

    await waitFor(() => {
      expect(mockCreateCronJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleType: 'at',
          at: '2026-05-01T09:00:00+08:00',
          cron: '',
          every: '',
          message: 'Fire once',
        }),
      )
    })
  })

  it('shows a human-readable preview for common cron schedules', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '0 8 * * 1-5' },
    })
    fireEvent.change(screen.getByLabelText('Timezone'), {
      target: { value: 'Asia/Shanghai' },
    })

    expect(screen.getByText('Runs every weekday at 08:00')).toBeInTheDocument()
    expect(screen.getByText('Timezone: Asia/Shanghai')).toBeInTheDocument()
    expect(screen.getByText('Runs every weekday at 08:00').closest('[aria-live="polite"]')).toHaveAttribute('aria-live', 'polite')
  })

  it('uses runtime-default wording for cron previews without an explicit timezone', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '0 8 * * 1-5' },
    })

    expect(screen.getByText('Runs every weekday at 08:00')).toBeInTheDocument()
    expect(screen.getByText('Timezone: runtime default')).toBeInTheDocument()
  })

  it('accepts six-field cron expressions in the preview', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '0 0 8 * * 1-5' },
    })

    expect(screen.getByText('Runs every weekday at 08:00')).toBeInTheDocument()
    expect(screen.getByText('Timezone: runtime default')).toBeInTheDocument()
  })

  it('falls back for stepped or list-based cron minute and hour fields', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '*/15 * * * *' },
    })

    expect(screen.getByText('Runs using cron expression */15 * * * *')).toBeInTheDocument()
    expect(screen.getByText('Timezone: runtime default')).toBeInTheDocument()
  })

  it('warns for out-of-range cron shortcut values', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '60 24 * * *' },
    })

    expect(screen.getByText('Runs using cron expression 60 24 * * *')).toBeInTheDocument()
    expect(screen.getByText('One or more cron fields are outside the supported range.')).toBeInTheDocument()
  })

  it('warns for invalid cron ranges, lists, and steps', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '*/70 * * * *' },
    })

    expect(screen.getByText('Runs using cron expression */70 * * * *')).toBeInTheDocument()
    expect(screen.getByText('One or more cron fields are outside the supported range.')).toBeInTheDocument()
  })

  it('warns when day, month, or weekday cron fields are invalid', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '0 8 32 * *' },
    })

    expect(screen.getByText('Runs using cron expression 0 8 32 * *')).toBeInTheDocument()
    expect(screen.getByText('One or more cron fields are outside the supported range.')).toBeInTheDocument()
  })

  it('warns when a cron timezone is invalid', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Cron expression'), {
      target: { value: '0 8 * * *' },
    })
    fireEvent.change(screen.getByLabelText('Timezone'), {
      target: { value: 'Asia/Shanghaii' },
    })

    expect(screen.getByText('Runs using cron expression 0 8 * * *')).toBeInTheDocument()
    expect(screen.getByText('Timezone Asia/Shanghaii is invalid. Use a valid IANA timezone name.')).toBeInTheDocument()
  })

  it('applies schedule presets inside the editor', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.click(screen.getByRole('button', { name: 'Weekdays 08:00' }))
    expect(screen.getByLabelText('Cron expression')).toHaveValue('0 8 * * 1-5')
    expect(screen.getByLabelText('Timezone')).toHaveValue('')
    expect(screen.getByText('Runs every weekday at 08:00')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'every' } })
    fireEvent.click(screen.getByRole('button', { name: 'Every 15m' }))
    expect(screen.getByLabelText('Interval')).toHaveValue('15m')
    expect(screen.getByText('Runs every 15m')).toBeInTheDocument()
  })

  it('renders one-shot previews using the selected timezone instead of the browser timezone', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-05-01T09:00:00' },
    })
    fireEvent.change(screen.getByLabelText('Timezone'), {
      target: { value: 'Asia/Shanghai' },
    })

    expect(screen.getByText('Runs once at 2026-05-01 09:00:00')).toBeInTheDocument()
    expect(screen.getByText('Timezone: Asia/Shanghai')).toBeInTheDocument()
  })

  it('treats fractional-second naive one-shot timestamps as local wall-clock values', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-05-01T09:00:00.123' },
    })
    fireEvent.change(screen.getByLabelText('Timezone'), {
      target: { value: 'Asia/Shanghai' },
    })

    expect(screen.getByText('Runs once at 2026-05-01 09:00:00.123')).toBeInTheDocument()
    expect(screen.getByText('Timezone: Asia/Shanghai')).toBeInTheDocument()
  })

  it('accepts relative one-shot values in the preview', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '+30m' },
    })

    expect(screen.getByText('Runs once after 30m')).toBeInTheDocument()
    expect(screen.getByText('Relative one-shot values are resolved by OpenClaw when the job is saved.')).toBeInTheDocument()
  })

  it('warns when the selected timezone is invalid for one-shot previews', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-05-01T09:00:00' },
    })
    fireEvent.change(screen.getByLabelText('Timezone'), {
      target: { value: 'Asia/Shanghaii' },
    })

    expect(screen.getByText('Runs once at 2026-05-01 09:00:00')).toBeInTheDocument()
    expect(screen.getByText('Timezone Asia/Shanghaii is invalid. Use a valid IANA timezone name.')).toBeInTheDocument()
  })

  it('warns for impossible one-shot dates instead of normalizing them', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-02-29T09:00:00' },
    })

    expect(screen.getByText('Runs once at 2026-02-29T09:00:00')).toBeInTheDocument()
    expect(screen.getByText('Use a valid ISO date and time.')).toBeInTheDocument()
  })

  it('warns for impossible one-shot timestamps with offsets or fractional seconds', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-02-29T09:00:00+08:00' },
    })

    expect(screen.getByText('Runs once at 2026-02-29T09:00:00+08:00')).toBeInTheDocument()
    expect(screen.getByText('Use a valid ISO date and time.')).toBeInTheDocument()
  })

  it('warns for impossible UTC offsets in one-shot previews', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-05-01T09:00:00+24:00' },
    })

    expect(screen.getByText('Runs once at 2026-05-01T09:00:00+24:00')).toBeInTheDocument()
    expect(screen.getByText('Use a valid ISO date and time.')).toBeInTheDocument()
  })

  it('warns for non-ISO one-shot timestamps that the browser can parse', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: 'Fri, 01 May 2026 09:00:00 GMT' },
    })

    expect(screen.getByText('Runs once at Fri, 01 May 2026 09:00:00 GMT')).toBeInTheDocument()
    expect(screen.getByText('Use a valid ISO date and time.')).toBeInTheDocument()
  })

  it('keeps timezone-less one-shot previews neutral', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Job' }))

    fireEvent.change(screen.getByLabelText('Schedule type'), { target: { value: 'at' } })
    fireEvent.change(screen.getByLabelText('Run at'), {
      target: { value: '2026-05-01T09:00:00' },
    })

    expect(screen.getByText('Runs once at 2026-05-01 09:00:00')).toBeInTheDocument()
    expect(screen.getByText('No timezone or offset was provided. OpenClaw saves offset-less ISO timestamps as UTC.')).toBeInTheDocument()
  })

  it('truncates multi-line run-now output in the success banner', async () => {
    mockRunCronJob.mockResolvedValueOnce({
      success: true,
      data: 'queued run\n{"runId":"run-42","status":"pending"}',
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Cron Jobs' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run Now' }))

    const banner = await screen.findByText('queued run')
    expect(banner).toBeInTheDocument()
    expect(screen.queryByText(/runId/)).not.toBeInTheDocument()
  })
})
