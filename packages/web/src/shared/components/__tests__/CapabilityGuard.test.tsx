import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { changeLanguage } from '@/i18n'

import { CapabilityGuard } from '../CapabilityGuard'

const mockInstallCapabilities = vi.fn()

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => ({
    installCapabilities: (...args: any[]) => mockInstallCapabilities(...args),
  }),
}))

describe('CapabilityGuard', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')
  })

  it('runs availability detection only once under Strict Mode for the same pending check', async () => {
    const checkAvailable = vi.fn().mockResolvedValue(true)

    render(
      <StrictMode>
        <CapabilityGuard capabilityId="observe" checkAvailable={checkAvailable}>
          <div>Capability Ready</div>
        </CapabilityGuard>
      </StrictMode>,
    )

    expect(await screen.findByText('Capability Ready')).toBeInTheDocument()
    expect(checkAvailable).toHaveBeenCalledTimes(1)
  })

  it('shows localized follow-up guidance when installation finishes but the capability remains unavailable', async () => {
    const checkAvailable = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    mockInstallCapabilities.mockResolvedValue(undefined)

    render(
      <CapabilityGuard capabilityId="observe" checkAvailable={checkAvailable}>
        <div>Capability Ready</div>
      </CapabilityGuard>,
    )

    expect(await screen.findByRole('button', { name: /Install/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Install/i }))

    await waitFor(() => {
      expect(mockInstallCapabilities).toHaveBeenCalledWith(['observe'], expect.any(Function))
    })

    expect(
      await screen.findByText(
        'Observability finished installing, but the availability check still failed. Review the configuration and try again.',
      ),
    ).toBeInTheDocument()
  })
})
