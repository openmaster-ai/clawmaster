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
  [CapabilityId[], ((progress: InstallProgress) => void) | undefined, { registryUrl?: string } | undefined],
  Promise<void>
>()
const mockGetNpmProxy = vi.fn()
const mockSaveNpmProxy = vi.fn()

const stubAdapter = {
  detectCapabilities: (cb?: (status: CapabilityStatus) => void) => mockDetect(cb),
  installCapabilities: (
    ids: CapabilityId[],
    cb?: (p: InstallProgress) => void,
    options?: { registryUrl?: string },
  ) => mockInstall(ids, cb, options),
  onboarding: {},
  gateway: {},
  channel: {},
}

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => stubAdapter,
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    getClawmasterNpmProxy: (...args: any[]) => mockGetNpmProxy(...args),
    saveClawmasterNpmProxy: (...args: any[]) => mockSaveNpmProxy(...args),
  },
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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
    mockGetNpmProxy.mockResolvedValue({
      success: true,
      data: { enabled: true, registryUrl: 'https://registry.npmmirror.com' },
      error: null,
    })
    mockSaveNpmProxy.mockResolvedValue({
      success: true,
      data: { enabled: true, registryUrl: 'https://registry.npmmirror.com' },
      error: null,
    })
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

    expect(mockInstall).toHaveBeenCalledWith(
      ['observe'],
      expect.any(Function),
      { registryUrl: 'https://registry.npmmirror.com' },
    )
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

    expect(mockInstall).toHaveBeenCalledWith(
      ['engine'],
      expect.any(Function),
      { registryUrl: 'https://registry.npmmirror.com' },
    )
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

  it('shows the npm proxy toggle for English users', async () => {
    mockDetect.mockResolvedValue([])

    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Manage capabilities' })).toBeInTheDocument()
    })

    expect(screen.getByText('Use npm mirror')).toBeInTheDocument()
    expect(mockGetNpmProxy).toHaveBeenCalled()
  })

  it('shows the npm proxy toggle for Chinese users and passes the registry override to installs', async () => {
    await changeLanguage('zh')
    mockDetect.mockImplementation(async (cb) => {
      const r = missingObserve()
      cb?.(r, new Map([[r.id, r]]))
      return [r]
    })
    mockInstall.mockResolvedValue(undefined)

    renderSection()

    await screen.findByText('使用 npm 镜像')
    const installBtn = await screen.findByRole('button', { name: '安装' })

    await act(async () => {
      fireEvent.click(installBtn)
    })

    expect(mockGetNpmProxy).toHaveBeenCalled()
    expect(mockInstall).toHaveBeenCalledWith(
      ['observe'],
      expect.any(Function),
      { registryUrl: 'https://registry.npmmirror.com' },
    )
  })

  it('waits for the npm proxy preference to persist before installing', async () => {
    await changeLanguage('zh')
    mockGetNpmProxy.mockResolvedValue({
      success: true,
      data: { enabled: true, registryUrl: 'https://registry.npmmirror.com' },
      error: null,
    })
    mockDetect.mockImplementation(async (cb) => {
      const r = missingObserve()
      cb?.(r, new Map([[r.id, r]]))
      return [r]
    })
    mockInstall.mockResolvedValue(undefined)

    let resolveSave!: (value: { success: boolean; data: { enabled: boolean; registryUrl: null }; error: null }) => void
    mockSaveNpmProxy.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      })
    )

    renderSection()

    const checkbox = await screen.findByRole('checkbox')
    await waitFor(() => {
      expect(checkbox).toBeChecked()
    })

    fireEvent.click(checkbox)
    expect(screen.getByRole('button', { name: '安装' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '安装' }))

    expect(mockInstall).not.toHaveBeenCalled()

    resolveSave({
      success: true,
      data: { enabled: false, registryUrl: null },
      error: null,
    })

    await waitFor(() => {
      expect(mockInstall).toHaveBeenCalledWith(
        ['observe'],
        expect.any(Function),
        undefined,
      )
    })
  })

  it('does not queue duplicate capability installs while npm proxy persistence is pending', async () => {
    await changeLanguage('zh')
    mockGetNpmProxy.mockResolvedValue({
      success: true,
      data: { enabled: true, registryUrl: 'https://registry.npmmirror.com' },
      error: null,
    })
    mockDetect.mockImplementation(async (cb) => {
      const r = missingObserve()
      cb?.(r, new Map([[r.id, r]]))
      return [r]
    })

    let resolveSave!: (value: { success: boolean; data: { enabled: boolean; registryUrl: null }; error: null }) => void
    mockSaveNpmProxy.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )

    renderSection()

    const checkbox = await screen.findByRole('checkbox')
    await waitFor(() => {
      expect(checkbox).toBeChecked()
    })

    fireEvent.click(checkbox)
    const installBtn = screen.getByRole('button', { name: '安装' })
    fireEvent.click(installBtn)
    expect(installBtn).toBeDisabled()
    fireEvent.click(installBtn)

    expect(mockInstall).not.toHaveBeenCalled()

    resolveSave({
      success: true,
      data: { enabled: false, registryUrl: null },
      error: null,
    })

    await waitFor(() => {
      expect(mockInstall).toHaveBeenCalledTimes(1)
    })
  })

})
