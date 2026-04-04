import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import ObservePage from '../ObservePage'

const mockClawprobeStatus = vi.fn()
const mockClawprobeCost = vi.fn()
const mockClawprobeConfig = vi.fn()
const mockClawprobeBootstrap = vi.fn()
const mockInstallCapabilities = vi.fn()

vi.mock('@/adapters', () => ({
  platformResults: {
    clawprobeStatus: (...args: any[]) => mockClawprobeStatus(...args),
    clawprobeCost: (...args: any[]) => mockClawprobeCost(...args),
    clawprobeConfig: (...args: any[]) => mockClawprobeConfig(...args),
    clawprobeBootstrap: (...args: any[]) => mockClawprobeBootstrap(...args),
  },
}))

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => ({
    installCapabilities: (...args: any[]) => mockInstallCapabilities(...args),
  }),
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
    mockInstallCapabilities.mockResolvedValue(undefined)
  })

  it('renders the missing-clawprobe zero state instead of an error screen', async () => {
    render(<ObservePage />)

    expect(await screen.findByText('ClawProbe is not installed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Observe' })).toBeInTheDocument()
    expect(screen.getByText('Not Running')).toBeInTheDocument()
    expect(screen.getByText('No active session')).toBeInTheDocument()
    expect(screen.getByText('No cost data for this period')).toBeInTheDocument()
    expect(screen.getByText('/tmp/.openclaw/clawprobe')).toBeInTheDocument()
  })

  it('installs clawprobe from the observe flow and bootstraps it', async () => {
    render(<ObservePage />)

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
})
