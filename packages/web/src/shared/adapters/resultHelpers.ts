import i18n from '@/i18n'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'

export async function fromPromise<T>(fn: () => Promise<T>): Promise<AdapterResult<T>> {
  try {
    return ok(await fn())
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

export function allSuccess3<A, B, C>(
  a: AdapterResult<A>,
  b: AdapterResult<B>,
  c: AdapterResult<C>
): AdapterResult<{ a: A; b: B; c: C }> {
  if (!a.success) return fail(a.error ?? i18n.t('common.requestFailed'))
  if (!b.success) return fail(b.error ?? i18n.t('common.requestFailed'))
  if (!c.success) return fail(c.error ?? i18n.t('common.requestFailed'))
  return ok({ a: a.data!, b: b.data!, c: c.data! })
}

export function allSuccess2<A, B>(
  a: AdapterResult<A>,
  b: AdapterResult<B>
): AdapterResult<{ a: A; b: B }> {
  if (!a.success) return fail(a.error ?? i18n.t('common.requestFailed'))
  if (!b.success) return fail(b.error ?? i18n.t('common.requestFailed'))
  return ok({ a: a.data!, b: b.data! })
}
