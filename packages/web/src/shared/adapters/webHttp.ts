import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'

export async function webFetchJson<T>(
  input: string,
  init?: RequestInit
): Promise<AdapterResult<T>> {
  try {
    const res = await fetch(input, init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const hint = text ? `: ${text.slice(0, 240)}` : ''
      return fail<T>(`HTTP ${res.status}${hint}`)
    }
    const data = (await res.json()) as T
    return ok(data)
  } catch (e) {
    return fail<T>(e instanceof Error ? e.message : String(e))
  }
}

export async function webFetchVoid(
  input: string,
  init?: RequestInit
): Promise<AdapterResult<void>> {
  try {
    const res = await fetch(input, init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const hint = text ? `: ${text.slice(0, 240)}` : ''
      return fail<void>(`HTTP ${res.status}${hint}`)
    }
    return ok(undefined)
  } catch (e) {
    return fail<void>(e instanceof Error ? e.message : String(e))
  }
}
