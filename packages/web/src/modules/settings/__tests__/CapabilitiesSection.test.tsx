import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import type {
  CapabilityId,
  CapabilityStatus,
  InstallProgress,
} from '@/modules/setup/types'

const mockDetect = vi.fn<
  [((status: CapabilityStatus, latest: Map<CapabilityId, CapabilityStatus>) => void) | undefined],
  Promise<CapabilityStatus[]>
>()
const mockInstall = vi.fn<
  [CapabilityId[], ((progress: InstallProgress) => void) | undefined],
  Promise<void>
>()

const stubAdapter = {
  detectCapabilities: (cb?: (status: CapabilityStatus) => void) => mockDetect(cb),
  installCapabilities: (ids: CapabilityId[], cb?: (p: InstallProgress) => void) =>
    mockInstall(ids, cb),
  onboarding: {},
  gateway: {},
  channel: {},
}

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => stubAdapter,
}))

import { CapabilitiesSection } from '../CapabilitiesSection'

function installedEngine(version = '2026.4.1'): CapabilityStatus {
  return { id: 'engine', name: 'capability.engine', status: 'installed', version }
}

function missingObserve(): CapabilityStatus {
  return { id: 'observe', name: 'capability.observe', status: 'not_installed' }
}

function checkingCapability(id: CapabilityId): CapabilityStatus {
  return { id, name: `capability.${id}`, status: 'checking' }
}

function renderSection() {
  return render(
    <MemoryRouter>
      <CapabilitiesSection />
    </MemoryRouter>,
  )
}

describe('CapabilitiesSection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
  })

  it('renders capability rows using live detection output', async () => {
    mockDetect.mockImplementation(async (cb) => {
      const results = [installedEngine(), missingObserve()]
      results.forEach((r) => cb?.(r, new Map(results.map((x) => [x.id, x]))))
      return results
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Manage capabilities' })).toBeInTheDocument()
    })

    expect(mockDetect).toHaveBeenCalled()
    expect(await screen.findByText('Installed · v2026.4.1')).toBeInTheDocument()
    expect(screen.getByText('Not installed')).toBeInTheDocument()

    const section = document.getElementById('settings-capabilities')
    expect(section).not.toBeNull()
  })

  it('shows Install button on not-installed capabilities with install steps and calls adapter', async () => {
    mockDetect.mockImplementation(async (cb) => {
      const r = missingObserve()
      cb?.(r, new Map([[r.id, r]]))
      return [r]
    })
    mockInstall.mockResolvedValue(undefined)

    renderSection()

    const installBtn = await screen.findByRole('button', { name: /^Install$/ })
    await act(async () => {
      fireEvent.click(installBtn)
    })

    expect(mockInstall).toHaveBeenCalledWith(['observe'], expect.any(Function))
  })

  it('requires confirmation before reinstalling an installed capability', async () => {
    mockDetect.mockImplementation(async (cb) => {
      const r = installedEngine()
      cb?.(r, new Map([[r.id, r]]))
      return [r]
    })
    mockInstall.mockResolvedValue(undefined)

    renderSection()

    const reinstallBtn = await screen.findByRole('button', { name: /Reinstall/ })
    await act(async () => {
      fireEvent.click(reinstallBtn)
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockInstall).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockInstall).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Reinstall/ }))
    })
    const confirmBtns = screen.getAllByRole('button', { name: /Reinstall/ })
    await act(async () => {
      fireEvent.click(confirmBtns[confirmBtns.length - 1])
    })

    expect(mockInstall).toHaveBeenCalledWith(['engine'], expect.any(Function))
  })

  it('uses detect output (not systemInfo) for status — a checking state is rendered as checking', async () => {
    mockDetect.mockImplementation(async (cb) => {
      const probe = [checkingCapability('engine'), checkingCapability('observe')]
      probe.forEach((r) => cb?.(r, new Map(probe.map((x) => [x.id, x]))))
      return probe
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getAllByText('Checking...').length).toBeGreaterThan(0)
    })
  })
})
