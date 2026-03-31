import { useCallback, useEffect, useState } from 'react'
import type { AdapterResult } from '@/shared/adapters/types'

export interface UseAdapterCallOptions {
  /** Poll interval in ms; omit to disable polling */
  pollInterval?: number
}

export function useAdapterCall<T>(
  fetcher: () => Promise<AdapterResult<T>>,
  options?: UseAdapterCallOptions
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetcher()
      if (res.success) {
        setData(res.data ?? null)
        setError(null)
      } else {
        setError(res.error ?? '未知错误')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [fetcher])

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
