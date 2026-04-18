import { useCallback, useRef, useState } from 'react'
import { getSetupAdapter, type SetupAdapter } from './adapters'
import {
  type CapabilityId,
  type CapabilityStatus,
  type InstallProgress,
} from './types'

export interface UseCapabilityManagerResult {
  capabilities: CapabilityStatus[]
  installProgress: Record<CapabilityId, InstallProgress>
  detecting: boolean
  installing: boolean
  error: string | null
  detect: (
    onUpdate?: (status: CapabilityStatus, latest: Map<CapabilityId, CapabilityStatus>) => void,
  ) => Promise<CapabilityStatus[]>
  install: (ids: CapabilityId[]) => Promise<void>
  resetError: () => void
}

export function useCapabilityManager(adapter?: SetupAdapter): UseCapabilityManagerResult {
  // Adapter is read through a ref so detect/install keep stable identities
  // (deps: []). Callers may pass a fresh adapter each render without triggering
  // re-subscription loops; the latest value is always used on the next call.
  const adapterRef = useRef<SetupAdapter>(adapter ?? getSetupAdapter())
  if (adapter) adapterRef.current = adapter

  const [capabilities, setCapabilities] = useState<CapabilityStatus[]>([])
  const [installProgress, setInstallProgress] = useState<Record<CapabilityId, InstallProgress>>(
    {} as Record<CapabilityId, InstallProgress>,
  )
  const [detecting, setDetecting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetError = useCallback(() => setError(null), [])

  const detect = useCallback<UseCapabilityManagerResult['detect']>(
    async (onUpdate) => {
      setDetecting(true)
      setError(null)
      const latest = new Map<CapabilityId, CapabilityStatus>()
      try {
        const results = await adapterRef.current.detectCapabilities((status) => {
          latest.set(status.id, status)
          setCapabilities((prev) => {
            const idx = prev.findIndex((c) => c.id === status.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = status
              return next
            }
            return [...prev, status]
          })
          onUpdate?.(status, latest)
        })
        setDetecting(false)
        return results
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setDetecting(false)
        throw err
      }
    },
    [],
  )

  const install = useCallback<UseCapabilityManagerResult['install']>(
    async (ids) => {
      if (ids.length === 0) return
      setInstalling(true)
      setError(null)

      const initialProgress: Record<string, InstallProgress> = {}
      for (const id of ids) initialProgress[id] = { id, status: 'waiting' }
      setInstallProgress((prev) => ({ ...prev, ...initialProgress }))

      try {
        await adapterRef.current.installCapabilities(ids, (progress) => {
          setInstallProgress((prev) => ({ ...prev, [progress.id]: progress }))
          if (progress.status === 'done') {
            setCapabilities((prev) =>
              prev.map((c) => (c.id === progress.id ? { ...c, status: 'installed' } : c)),
            )
          }
        })
        setInstalling(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setInstalling(false)
        throw err
      }
    },
    [],
  )

  return {
    capabilities,
    installProgress,
    detecting,
    installing,
    error,
    detect,
    install,
    resetError,
  }
}
