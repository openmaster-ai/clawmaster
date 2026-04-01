import { useState, useCallback } from 'react'

export type InstallStatus = 'idle' | 'running' | 'done' | 'error'

export interface InstallTaskState {
  status: InstallStatus
  progress?: number   // 0-100, undefined = indeterminate
  log?: string        // current operation line
  error?: string
}

export interface UseInstallTaskReturn extends InstallTaskState {
  /** Execute an async task with automatic state management */
  run: (task: () => Promise<void>) => Promise<void>
  /** Reset to idle */
  reset: () => void
}

/**
 * Hook that wraps any async install/download operation with
 * consistent status tracking (idle → running → done/error).
 *
 * @example
 * const install = useInstallTask()
 * <InstallTask label="Context7" {...install} />
 * <button onClick={() => install.run(() => addMcpServer(...))}>Install</button>
 */
export function useInstallTask(): UseInstallTaskReturn {
  const [state, setState] = useState<InstallTaskState>({ status: 'idle' })

  const run = useCallback(async (task: () => Promise<void>) => {
    setState({ status: 'running' })
    try {
      await task()
      setState({ status: 'done' })
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  return { ...state, run, reset }
}
