import { tauriInvoke } from '@/shared/adapters/invoke'
import { getIsTauri } from '@/shared/adapters/platform'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import { webFetchJson } from '@/shared/adapters/webHttp'
import type { ClawprobeConfigJson, ClawprobeCostJson, ClawprobeStatusJson } from '@/types/clawprobe'

function parseClawprobeStdout(raw: string): AdapterResult<unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return fail('ClawProbe 无输出')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return fail('ClawProbe 返回非 JSON')
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'ok' in parsed &&
    (parsed as { ok: unknown }).ok === false
  ) {
    const o = parsed as { message?: string; error?: string }
    return fail(o.message ?? o.error ?? 'ClawProbe 失败')
  }
  return ok(parsed)
}

async function invokeClawprobeJson(args: string[]): Promise<AdapterResult<unknown>> {
  try {
    const raw = await tauriInvoke<string>('run_clawprobe_command', { args })
    return parseClawprobeStdout(raw)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

export async function clawprobeStatusResult(): Promise<AdapterResult<ClawprobeStatusJson>> {
  if (getIsTauri()) {
    const r = await invokeClawprobeJson(['status', '--json'])
    if (!r.success) return fail<ClawprobeStatusJson>(r.error ?? '请求失败')
    return ok(r.data as ClawprobeStatusJson)
  }
  return webFetchJson<ClawprobeStatusJson>('/api/clawprobe/status')
}

export async function clawprobeCostResult(
  period: 'day' | 'week' | 'month' | 'all'
): Promise<AdapterResult<ClawprobeCostJson>> {
  if (getIsTauri()) {
    const args = ['cost', '--json']
    if (period === 'day') args.push('--day')
    else if (period === 'month') args.push('--month')
    else if (period === 'all') args.push('--all')
    const r = await invokeClawprobeJson(args)
    if (!r.success) return fail<ClawprobeCostJson>(r.error ?? '请求失败')
    return ok(r.data as ClawprobeCostJson)
  }
  const q = new URLSearchParams({ period })
  return webFetchJson<ClawprobeCostJson>(`/api/clawprobe/cost?${q}`)
}

export async function clawprobeConfigResult(): Promise<AdapterResult<ClawprobeConfigJson>> {
  if (getIsTauri()) {
    const r = await invokeClawprobeJson(['config', '--json'])
    if (!r.success) return fail<ClawprobeConfigJson>(r.error ?? '请求失败')
    return ok(r.data as ClawprobeConfigJson)
  }
  return webFetchJson<ClawprobeConfigJson>('/api/clawprobe/config')
}
