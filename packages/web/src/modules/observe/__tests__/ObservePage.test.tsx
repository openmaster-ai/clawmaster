import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import ObservePage from '../ObservePage'

const mockClawprobeStatus = vi.fn()
const mockClawprobeCost = vi.fn()
const mockClawprobeConfig = vi.fn()
const mockClawprobeBootstrap = vi.fn()
const mockInstallSkill = vi.fn()
const mockSetSkillEnabled = vi.fn()
const mockInstallCapabilities = vi.fn()
const mockGetSessions = vi.fn()
const mockGetSessionDetail = vi.fn()

vi.mock('@/adapters', () => ({
  platformResults: {
    clawprobeStatus: (...args: any[]) => mockClawprobeStatus(...args),
    clawprobeCost: (...args: any[]) => mockClawprobeCost(...args),
    clawprobeConfig: (...args: any[]) => mockClawprobeConfig(...args),
    clawprobeBootstrap: (...args: any[]) => mockClawprobeBootstrap(...args),
    installSkill: (...args: any[]) => mockInstallSkill(...args),
  },
}))

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => ({
    installCapabilities: (...args: any[]) => mockInstallCapabilities(...args),
  }),
}))

vi.mock('@/shared/adapters/clawhub', () => ({
  setSkillEnabledResult: (...args: any[]) => mockSetSkillEnabled(...args),
}))

vi.mock('@/shared/adapters/sessions', () => ({
  getSessions: (...args: any[]) => mockGetSessions(...args),
  getSessionDetail: (...args: any[]) => mockGetSessionDetail(...args),
}))

const fallbackStatus = {
  agent: 'OpenClaw',
  daemonRunning: false,
  installRequired: true,
  sessionKey: null,
  sessionId: null,
  model: null,
  provider: null,
  sessionTokens: 0,
  windowSize: 0,
  utilizationPct: 0,
  inputTokens: 0,
  outputTokens: 0,
  compactionCount: 0,
  lastActiveAt: 0,
  isActive: false,
  todayUsd: 0,
  suggestions: [],
}

const fallbackCost = {
  period: 'week',
  startDate: '2026-03-29',
  endDate: '2026-04-04',
  totalUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  inputUsd: 0,
  outputUsd: 0,
  dailyAvg: 0,
  monthEstimate: 0,
  daily: [],
  unpricedModels: [],
}

const fallbackConfig = {
  openclawDir: '/tmp/.openclaw',
  workspaceDir: '/tmp/.openclaw/workspace',
  sessionsDir: '/tmp/.openclaw/workspace/.openclaw/sessions',
  bootstrapMaxChars: 12000,
  probeDir: '/tmp/.openclaw/clawprobe',
  openclaw: {},
}

describe('ObservePage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockClawprobeStatus.mockResolvedValue({ success: true, data: fallbackStatus })
    mockClawprobeCost.mockResolvedValue({ success: true, data: fallbackCost })
    mockClawprobeConfig.mockResolvedValue({ success: true, data: fallbackConfig })
    mockClawprobeBootstrap.mockResolvedValue({
      success: true,
      data: {
        ok: true,
        alreadyRunning: false,
        daemonRunning: true,
        message: 'ClawProbe started',
      },
    })
    mockInstallSkill.mockResolvedValue({ success: true, data: undefined })
    mockSetSkillEnabled.mockResolvedValue({ success: true, data: undefined })
    mockInstallCapabilities.mockResolvedValue(undefined)
    mockGetSessions.mockResolvedValue({
      success: true,
      data: {
        path: '/tmp/.openclaw/workspace/.openclaw/sessions',
        count: 0,
        sessions: [],
      },
    })
    mockGetSessionDetail.mockResolvedValue({
      success: false,
      error: 'session not found',
    })
  })

  it('renders the missing-clawprobe zero state instead of an error screen', async () => {
    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('ClawProbe is not installed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Observe' })).toBeInTheDocument()
    expect(screen.getByText('Not Running')).toBeInTheDocument()
    expect(screen.getByText('No active session')).toBeInTheDocument()
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
    expect(screen.getByText('/tmp/.openclaw/clawprobe')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Scheduled Cost Digests' })).toBeInTheDocument()
  })

  it('installs clawprobe from the observe flow and bootstraps it', async () => {
    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Install and start ClawProbe' }))

    await waitFor(() => {
      expect(mockInstallCapabilities).toHaveBeenCalledTimes(1)
    })
    expect(mockInstallCapabilities.mock.calls[0]?.[0]).toEqual(['observe'])

    await waitFor(() => {
      expect(mockClawprobeBootstrap).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('ClawProbe started')).toBeInTheDocument()
  })

  it('installs the bundled digest skill before opening a digest cron template', async () => {
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        installRequired: false,
      },
    })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Observe' })

    fireEvent.click(screen.getByRole('button', { name: /Weekly Digest/i }))

    await waitFor(() => {
      expect(mockInstallSkill).toHaveBeenCalledWith('clawprobe-cost-digest')
    })
    await waitFor(() => {
      expect(mockSetSkillEnabled).toHaveBeenCalledWith('clawprobe-cost-digest', true)
    })
  })

  it('blocks digest creation until clawprobe is installed', async () => {
    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Observe' })

    const button = screen.getByRole('button', { name: /Weekly Digest/i })
    expect(button).toBeDisabled()
    expect(screen.getByText('Install ClawProbe first before creating a scheduled digest job.')).toBeInTheDocument()
    expect(mockInstallSkill).not.toHaveBeenCalled()
  })

  it('shows an install error instead of opening a broken digest flow when skill install fails', async () => {
    mockInstallSkill.mockResolvedValueOnce({ success: false, error: 'bundled skill missing' })
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        installRequired: false,
      },
    })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Observe' })
    fireEvent.click(screen.getByRole('button', { name: /Daily Digest/i }))

    expect(await screen.findByText('Install failed: bundled skill missing')).toBeInTheDocument()
  })

  it('shows an install error instead of opening a broken digest flow when enabling the skill fails', async () => {
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        installRequired: false,
      },
    })
    mockSetSkillEnabled.mockResolvedValueOnce({ success: false, error: 'write failed' })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'Observe' })
    fireEvent.click(screen.getByRole('button', { name: /Daily Digest/i }))

    expect(await screen.findByText('Install failed: write failed')).toBeInTheDocument()
  })

  it('shows the latest session context usage and estimated cost', async () => {
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        daemonRunning: true,
        installRequired: false,
        sessionKey: null,
      },
    })
    mockGetSessions.mockResolvedValueOnce({
      success: true,
      data: {
        path: '/tmp/.openclaw/workspace/.openclaw/sessions',
        count: 2,
        sessions: [
          {
            key: 'agent:main:older',
            sessionId: 'older',
            agentId: 'main',
            model: 'gpt-4.1-mini',
            modelProvider: 'openai',
            kind: 'direct',
            inputTokens: 1200,
            outputTokens: 300,
            totalTokens: 1500,
            contextTokens: 20000,
            updatedAt: 1774800000000,
            ageMs: 120000,
          },
          {
            key: 'agent:main:latest',
            sessionId: 'latest',
            agentId: 'main',
            model: 'gpt-4.1',
            modelProvider: 'openai',
            kind: 'direct',
            inputTokens: 4300,
            outputTokens: 700,
            totalTokens: 5000,
            contextTokens: 20000,
            updatedAt: 1774900000000,
            ageMs: 30000,
          },
        ],
      },
    })
    mockGetSessionDetail.mockResolvedValueOnce({
      success: true,
      data: {
        sessionKey: 'agent:main:latest',
        model: 'gpt-4.1',
        provider: 'openai',
        inputTokens: 4300,
        outputTokens: 700,
        totalTokens: 25000,
        contextTokens: 5000,
        windowSize: 20000,
        estimatedUsd: 0.042,
        startedAt: 1774890000,
        lastActiveAt: 1774900000,
        durationMin: 12,
        compactionCount: 0,
        turns: [],
      },
    })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Latest Session')).toBeInTheDocument()
    expect(screen.getByText('$0.0420')).toBeInTheDocument()
    expect(screen.getByText('5,000 / 20,000 tokens')).toBeInTheDocument()
    expect(screen.getByTitle('agent:main:latest')).toBeInTheDocument()
    expect(mockGetSessionDetail).toHaveBeenCalledWith('agent:main:latest', { agentId: 'main' })
  })

  it('falls back to session list fields when latest session detail fails', async () => {
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        daemonRunning: true,
        installRequired: false,
        sessionKey: null,
      },
    })
    mockGetSessions.mockResolvedValueOnce({
      success: true,
      data: {
        path: '/tmp/.openclaw/workspace/.openclaw/sessions',
        count: 1,
        sessions: [
          {
            key: 'agent:main:detail-missing',
            sessionId: 'detail-missing',
            agentId: 'main',
            model: 'gpt-4.1-mini',
            modelProvider: 'openai',
            kind: 'direct',
            inputTokens: 1200,
            outputTokens: 300,
            totalTokens: 78000,
            contextTokens: 20000,
            updatedAt: 1774900000000,
            ageMs: 30000,
          },
        ],
      },
    })
    mockGetSessionDetail.mockResolvedValueOnce({
      success: false,
      error: 'session not found',
    })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Latest Session')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('1,200 / 300')).toBeInTheDocument()
    expect(screen.getByText('- / 20,000 tokens')).toBeInTheDocument()
    expect(screen.queryByText('78,000 / 20,000 tokens')).not.toBeInTheDocument()
  })

  it('passes the latest session agent when fetching details from a multi-agent session list', async () => {
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        daemonRunning: true,
        installRequired: false,
        sessionKey: null,
      },
    })
    mockGetSessions.mockResolvedValueOnce({
      success: true,
      data: {
        path: '/tmp/.openclaw/workspace/.openclaw/sessions',
        count: 1,
        sessions: [
          {
            key: 'agent:review:latest',
            sessionId: 'latest',
            agentId: 'review',
            model: 'gpt-4.1',
            modelProvider: 'openai',
            kind: 'direct',
            inputTokens: 1000,
            outputTokens: 100,
            totalTokens: 1100,
            contextTokens: 64000,
            updatedAt: 1774900000000,
            ageMs: 30000,
          },
        ],
      },
    })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    await screen.findByText('Latest Session')
    expect(mockGetSessionDetail).toHaveBeenCalledWith('agent:review:latest', { agentId: 'review' })
  })

  it('uses the active status session key for cost detail when the session list is empty', async () => {
    mockClawprobeStatus.mockResolvedValueOnce({
      success: true,
      data: {
        ...fallbackStatus,
        daemonRunning: true,
        installRequired: false,
        sessionKey: 'agent:main:active',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        sessionTokens: 2500,
        windowSize: 10000,
        utilizationPct: 25,
        inputTokens: 2100,
        outputTokens: 400,
        isActive: true,
      },
    })
    mockGetSessionDetail.mockResolvedValueOnce({
      success: true,
      data: {
        sessionKey: 'agent:main:active',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        inputTokens: 2100,
        outputTokens: 400,
        totalTokens: 2500,
        estimatedUsd: 0.0187,
        startedAt: 1774890000,
        lastActiveAt: 1774900000,
        durationMin: 5,
        compactionCount: 0,
        turns: [],
      },
    })

    render(
      <MemoryRouter>
        <ObservePage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Latest Session')).toBeInTheDocument()
    expect(screen.getByText('$0.0187')).toBeInTheDocument()
    expect(screen.getByText('2,500 / 10,000 tokens')).toBeInTheDocument()
    expect(mockGetSessionDetail).toHaveBeenCalledWith('agent:main:active', { agentId: undefined })
  })
})
