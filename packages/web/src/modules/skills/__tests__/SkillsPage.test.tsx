import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import SkillsPage from '../SkillsPage'

const mockGetSkillsResult = vi.fn()
const mockGetClawhubCliStatusResult = vi.fn()
const mockInstallClawhubCliResult = vi.fn()
const mockSearchSkillsResult = vi.fn()
const mockInstallSkillResult = vi.fn()
const mockUninstallSkillResult = vi.fn()
const mockSetSkillEnabledResult = vi.fn()
const mockScanInstalledSkillResult = vi.fn()

vi.mock('@/shared/adapters/clawhub', () => ({
  getSkillsResult: (...args: any[]) => mockGetSkillsResult(...args),
  getClawhubCliStatusResult: (...args: any[]) => mockGetClawhubCliStatusResult(...args),
  installClawhubCliResult: (...args: any[]) => mockInstallClawhubCliResult(...args),
  searchSkillsResult: (...args: any[]) => mockSearchSkillsResult(...args),
  installSkillResult: (...args: any[]) => mockInstallSkillResult(...args),
  uninstallSkillResult: (...args: any[]) => mockUninstallSkillResult(...args),
  setSkillEnabledResult: (...args: any[]) => mockSetSkillEnabledResult(...args),
  scanInstalledSkillResult: (...args: any[]) => mockScanInstalledSkillResult(...args),
}))

describe('SkillsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockGetClawhubCliStatusResult.mockResolvedValue({
      success: true,
      data: { installed: true, version: '0.9.0', packageName: 'clawhub' },
    })
    mockInstallClawhubCliResult.mockResolvedValue({
      success: true,
      data: { installed: true, version: '0.9.0', packageName: 'clawhub' },
    })
    mockSearchSkillsResult.mockResolvedValue({ success: true, data: [] })
    mockInstallSkillResult.mockResolvedValue({ success: true })
    mockUninstallSkillResult.mockResolvedValue({ success: true })
    mockSetSkillEnabledResult.mockResolvedValue({ success: true })
    mockScanInstalledSkillResult.mockResolvedValue({
      success: true,
      data: {
        auditMetadata: { toolVersion: '0.1.0', timestamp: '2026-04-05T00:00:00.000Z', target: '/tmp/find-skills' },
        summary: { totalSkills: 1, byLevel: { A: 1, B: 0, C: 0, D: 0, F: 0 } },
        report: {
          skillName: 'find-skills',
          skillPath: '/tmp/find-skills',
          riskScore: 4,
          riskLevel: 'A',
          findings: [],
          tokenEstimate: { l1SkillMd: 10, l2Eager: 20, l2Lazy: 30, l3Total: 40 },
        },
        severityCounts: {},
        totalFindings: 0,
      },
    })
  })

  it('keeps the featured catalog visible while installed skills are still loading', async () => {
    mockGetSkillsResult.mockReturnValue(new Promise(() => {}))

    render(<SkillsPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Skill Market' })).toBeInTheDocument()
    expect(screen.getByText('Start with high-value skills')).toBeInTheDocument()
    expect(screen.queryByText('Curated Catalog')).not.toBeInTheDocument()
    expect(screen.queryByText('OpenClaw runtime status')).not.toBeInTheDocument()
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('sorts featured skills by id', async () => {
    mockGetSkillsResult.mockResolvedValue({ success: true, data: [] })

    render(<SkillsPage />)

    await screen.findByRole('heading', { level: 2, name: 'Start with high-value skills' })

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .slice(0, 5)
      .map((node) => node.textContent)

    expect(headings).toEqual([
      'clawvet',
      'ernie-image',
      'find-skills',
      'openclaw-memory-pro-system',
      'self-improving-agent',
    ])
  })

  it('does not treat a personal skill-key match as the featured ClawHub install when the registry slug differs', async () => {
    mockGetSkillsResult.mockResolvedValue({
      success: true,
      data: [
        {
          slug: 'find-skills',
          skillKey: 'find-skills',
          name: 'find-skills',
          description: 'Find and install more skills',
          version: '1.0.0',
          installed: true,
          disabled: true,
          eligible: true,
          source: 'agents-skills-personal',
        },
      ],
    })

    render(<SkillsPage />)

    expect(await screen.findByText('find-skills')).toBeInTheDocument()
    expect(screen.getByText('Potential runtime collision')).toBeInTheDocument()
    expect(screen.queryByText('find-skills-skill')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Enable' }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: 'Install' }).length).toBeGreaterThan(0)
  })

  it('scans an installed skill and renders the SkillGuard report', async () => {
    mockGetSkillsResult.mockResolvedValue({
      success: true,
      data: [
        {
          slug: 'find-skills',
          skillKey: 'find-skills',
          name: 'find-skills',
          description: 'Find and install more skills',
          version: '1.0.0',
          installed: true,
          disabled: false,
          eligible: true,
          source: 'agents-skills-personal',
        },
      ],
    })

    render(<SkillsPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }))

    expect(await screen.findByText('SkillGuard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    const dialog = await screen.findByRole('dialog', { name: 'SkillGuard' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('No findings detected')).toBeInTheDocument()
    expect(mockScanInstalledSkillResult).toHaveBeenCalled()
  })

  it('uses the featured registry slug and surfaces install failures inline', async () => {
    mockGetSkillsResult.mockResolvedValue({ success: true, data: [] })
    mockInstallSkillResult.mockResolvedValue({ success: false, error: 'HTTP 500: bad install' })

    render(<SkillsPage />)

    const clawvetHeading = await screen.findByRole('heading', { level: 3, name: 'clawvet' })
    const clawvetCard = clawvetHeading.closest('div.rounded-\\[28px\\].border.p-5')
    expect(clawvetCard).not.toBeNull()
    fireEvent.click(within(clawvetCard as HTMLElement).getByRole('button', { name: 'Install' }))

    expect(mockInstallSkillResult).toHaveBeenCalledWith('clawvet')
    expect(await screen.findByText('HTTP 500: bad install')).toBeInTheDocument()
  })

  it('asks users to install clawhub first when the CLI is missing', async () => {
    mockGetClawhubCliStatusResult.mockResolvedValue({
      success: true,
      data: { installed: false, version: '', packageName: 'clawhub' },
    })
    mockGetSkillsResult.mockResolvedValue({ success: true, data: [] })

    render(<SkillsPage />)

    expect(await screen.findByText('Install ClawHub CLI first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install ClawHub CLI' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Install ClawHub First' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
  })
})
