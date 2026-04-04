import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import SkillsPage from '../SkillsPage'

const mockGetSkillsResult = vi.fn()
const mockSearchSkillsResult = vi.fn()
const mockInstallSkillResult = vi.fn()
const mockUninstallSkillResult = vi.fn()

vi.mock('@/shared/adapters/clawhub', () => ({
  getSkillsResult: (...args: any[]) => mockGetSkillsResult(...args),
  searchSkillsResult: (...args: any[]) => mockSearchSkillsResult(...args),
  installSkillResult: (...args: any[]) => mockInstallSkillResult(...args),
  uninstallSkillResult: (...args: any[]) => mockUninstallSkillResult(...args),
}))

describe('SkillsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
    mockSearchSkillsResult.mockResolvedValue({ success: true, data: [] })
    mockInstallSkillResult.mockResolvedValue({ success: true })
    mockUninstallSkillResult.mockResolvedValue({ success: true })
  })

  it('keeps the catalog visible while installed skills are still loading', async () => {
    mockGetSkillsResult.mockReturnValue(new Promise(() => {}))

    render(<SkillsPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Skill Market' })).toBeInTheDocument()
    expect(screen.getByText('Recommended Scenes')).toBeInTheDocument()
    expect(screen.getByText('Curated Catalog')).toBeInTheDocument()
    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })
})
