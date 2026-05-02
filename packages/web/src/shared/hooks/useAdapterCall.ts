import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdapterResult } from '@/shared/adapters/types'
import { formatAdapterResultError } from '@/shared/adapters/tauriCommandError'

export interface UseAdapterCallOptions {
  /** Poll interval in ms; omit to disable polling */
  pollInterval?: number
}

export function useAdapterCall<T>(
  fetcher: () => Promise<AdapterResult<T>>,
  options?: UseAdapterCallOptions
) {
  const { t } = useTranslation()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keep a stable ref to the latest fetcher so callers don't need to memoize
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const tRef = useRef(t)
  tRef.current = t

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetcherRef.current()
      if (res.success) {
        setData(res.data ?? null)
        setError(null)
      } else {
        setError(formatAdapterResultError(res, tRef.current))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    if (!options?.pollInterval || options.pollInterval <= 0) return
    const id = window.setInterval(() => void refetch(), options.pollInterval)
    return () => window.clearInterval(id)
  }, [refetch, options?.pollInterval])

  return { data, loading, error, refetch }
}
