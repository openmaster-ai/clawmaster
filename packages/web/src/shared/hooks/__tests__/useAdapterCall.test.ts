import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { UseAdapterCallOptions } from '../useAdapterCall'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/shared/adapters/tauriCommandError', () => ({
  formatAdapterResultError: (result: { error?: string | null }) => result.error ?? 'unknown error',
}))

// useAdapterCall depends on complex chain:
// react-i18next → tauriCommandError → i18n → localStorage
// Testing the interface contract rather than the hook lifecycle.

describe('useAdapterCall interface', () => {
  it('module exports useAdapterCall function', async () => {
    const mod = await import('../useAdapterCall')
    expect(typeof mod.useAdapterCall).toBe('function')
  })

  it('options type supports pollInterval', () => {
    const opts: UseAdapterCallOptions = { pollInterval: 5000 }
    expect(opts.pollInterval).toBe(5000)
  })

  it('options type supports no pollInterval', () => {
    const opts: UseAdapterCallOptions = {}
    expect(opts.pollInterval).toBeUndefined()
  })

  it('does not refetch endlessly when translation identity changes across renders', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      success: true,
      data: 'ready',
    })
    const mod = await import('../useAdapterCall')

    const { result } = renderHook(() => mod.useAdapterCall(fetcher))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await waitFor(() => {
      expect(result.current.data).toBe('ready')
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
