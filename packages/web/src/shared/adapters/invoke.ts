import { getIsTauri } from '@/shared/adapters/platform'

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!getIsTauri()) {
    throw new Error('Not running in Tauri environment')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}
