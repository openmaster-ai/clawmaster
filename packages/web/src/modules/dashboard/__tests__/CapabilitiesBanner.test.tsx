import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import type { CapabilityId, CapabilityStatus } from '@/modules/setup/types'

const mockDetect = vi.fn<
  [((status: CapabilityStatus, latest: Map<CapabilityId, CapabilityStatus>) => void) | undefined],
  Promise<CapabilityStatus[]>
>()

const stubAdapter = {
  detectCapabilities: (cb?: (status: CapabilityStatus) => void) => mockDetect(cb),
  installCapabilities: async () => {},
  onboarding: {},
  gateway: {},
  channel: {},
}

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => stubAdapter,
}))

import { CapabilitiesBanner } from '../CapabilitiesBanner'

function renderBanner() {
  return render(
    <MemoryRouter>
      <CapabilitiesBanner />
    </MemoryRouter>,
  )
}

describe('CapabilitiesBanner', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
  })

  it('is hidden when every capability is installed', async () => {
    mockDetect.mockImplementation(async (cb) => {
      const results: CapabilityStatus[] = [
        { id: 'engine', name: 'capability.engine', status: 'installed', version: '1.0.0' },
        { id: 'observe', name: 'capability.observe', status: 'installed', version: '1.0.0' },
      ]
      results.forEach((r) => cb?.(r, new Map(results.map((x) => [x.id, x]))))
      return results
    })

    const { container } = renderBanner()

    await waitFor(() => expect(mockDetect).toHaveBeenCalled())
    expect(container.textContent?.trim()).toBe('')
  })

  it('shows when an installable capability (has installSteps) is missing', async () => {
    mockDetect.mockImplementation(async (cb) => {
      const results: CapabilityStatus[] = [
        { id: 'engine', name: 'capability.engine', status: 'installed', version: '1.0.0' },
        { id: 'observe', name: 'capability.observe', status: 'not_installed' },
      ]
      results.forEach((r) => cb?.(r, new Map(results.map((x) => [x.id, x]))))
      return results
    })

    renderBanner()

    expect(await screen.findByText('1 capabilities not installed yet')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Manage capabilities/ })
    expect(cta.getAttribute('href')).toBe('/settings#settings-capabilities')
  })

  it('is hidden when a missing capability has no installSteps (bundled with engine)', async () => {
    // 'ocr' is not_installed in this test, but its installSteps are []
    // so the banner must NOT surface it.
    mockDetect.mockImplementation(async (cb) => {
      const results: CapabilityStatus[] = [
        { id: 'engine', name: 'capability.engine', status: 'installed', version: '1.0.0' },
        { id: 'ocr', name: 'capability.ocr', status: 'not_installed' },
      ]
      results.forEach((r) => cb?.(r, new Map(results.map((x) => [x.id, x]))))
      return results
    })

    const { container } = renderBanner()

    await waitFor(() => expect(mockDetect).toHaveBeenCalled())
    // No banner text renders
    expect(container.textContent?.trim()).toBe('')
  })

  it('surfaces a red error banner when detection fails before any capability is reported', async () => {
    mockDetect.mockRejectedValue(new Error('clawprobe --version: EACCES'))

    renderBanner()

    expect(
      await screen.findByText('Unable to probe capabilities. The runtime may be misconfigured.'),
    ).toBeInTheDocument()
    expect(screen.getByText('clawprobe --version: EACCES')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Manage capabilities/ })
    expect(cta.getAttribute('href')).toBe('/settings#settings-capabilities')
  })
})
