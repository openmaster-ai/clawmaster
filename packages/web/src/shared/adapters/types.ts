/** Unified async adapter result (CLI / HTTP / Tauri invoke) */
export interface AdapterResult<T> {
  success: boolean
  data?: T
  error?: string
}

export function ok<T>(data: T): AdapterResult<T> {
  return { success: true, data }
}

export function fail<T = never>(error: string): AdapterResult<T> {
  return { success: false, error }
}
