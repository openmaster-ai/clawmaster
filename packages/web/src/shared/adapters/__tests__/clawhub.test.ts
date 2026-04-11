import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock i18n before any adapter imports
vi.mock('@/i18n', () => ({
  default: { t: (k: string) => k, language: 'en' },
}))

vi.mock('../platform', () => ({
  getIsTauri: vi.fn(() => false),
  execCommand: vi.fn(),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
  webFetch: vi.fn((input: string, init?: RequestInit) => fetch(input, init)),
}))

vi.mock('../invoke', () => ({
  tauriInvoke: vi.fn(),
}))

describe('clawhub adapter (web mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('getSkillsResult returns skills via web fetch', async () => {
    const { webFetchJson } = await import('../webHttp')
    const skills = [{ slug: 'test', name: 'Test', description: 'A skill', version: '1.0', installed: true }]
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: skills })

    const { getSkillsResult } = await import('../clawhub')
    const result = await getSkillsResult()
    expect(result.success).toBe(true)
    expect(result.data).toEqual(skills)
  })

  it('searchSkillsResult calls web fetch', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({ success: true, data: [] })

    const { searchSkillsResult } = await import('../clawhub')
    const result = await searchSkillsResult('test')
    expect(result.success).toBe(true)
  })

  it('installSkillResult succeeds on HTTP 200', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') } as any)

    const { installSkillResult } = await import('../clawhub')
    const result = await installSkillResult('test-skill')
    expect(result.success).toBe(true)
  })

  it('installSkillResult fails on HTTP 404', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false, status: 404, text: vi.fn().mockResolvedValue('Not found'),
    } as any)

    const { installSkillResult } = await import('../clawhub')
    const result = await installSkillResult('bad')
    expect(result.success).toBe(false)
    expect(result.error).toContain('404')
  })

  it('uninstallSkillResult succeeds', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue('') } as any)

    const { uninstallSkillResult } = await import('../clawhub')
    const result = await uninstallSkillResult('test-skill')
    expect(result.success).toBe(true)
  })

  it('getClawhubCliStatusResult reports installed when clawhub is available', async () => {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue('ClawHub CLI v0.9.0 (f12692c3)')

    const { getClawhubCliStatusResult } = await import('../clawhub')
    const result = await getClawhubCliStatusResult()

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ installed: true, version: '0.9.0', packageName: 'clawhub' })
  })

  it('installClawhubCliResult installs the global clawhub package', async () => {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('ClawHub CLI v0.9.0 (f12692c3)')

    const { installClawhubCliResult } = await import('../clawhub')
    const result = await installClawhubCliResult()

    expect(result.success).toBe(true)
    expect(execCommand).toHaveBeenNthCalledWith(1, 'npm', ['install', '-g', 'clawhub'])
    expect(execCommand).toHaveBeenNthCalledWith(2, 'clawhub', ['--cli-version'])
  })

  it('scanInstalledSkillResult runs SkillGuard via execCommand', async () => {
    const { webFetchJson } = await import('../webHttp')
    vi.mocked(webFetchJson).mockResolvedValue({
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
      error: null,
    })

    const { scanInstalledSkillResult } = await import('../clawhub')
    const result = await scanInstalledSkillResult({
      slug: 'find-skills',
      name: 'find-skills',
      description: 'Find more skills',
      version: '1.0.0',
      installed: true,
      skillKey: 'find-skills',
    })

    expect(result.success).toBe(true)
    expect(result.data?.report?.skillName).toBe('find-skills')
    expect(webFetchJson).toHaveBeenCalledWith('/api/skills/scan', expect.objectContaining({
      method: 'POST',
    }))
  })
})
