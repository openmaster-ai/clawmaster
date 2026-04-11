import type { SystemInfo } from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson, webFetchVoid } from '@/shared/adapters/webHttp'

export interface OpenclawProfileInput {
  kind: 'default' | 'dev' | 'named'
  name?: string
}

export interface OpenclawProfileSeedInput {
  mode: 'empty' | 'clone-current' | 'import-config'
  sourcePath?: string
}

export interface ClawmasterRuntimeInput {
  mode: 'native' | 'wsl2'
  wslDistro?: string
  backendPort?: number
  autoStartBackend?: boolean
}

export interface HttpProbeInput {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface HttpProbeOutput {
  ok: boolean
  status: number
}

export async function detectSystemResult(): Promise<AdapterResult<SystemInfo>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<SystemInfo>('detect_system'))
  }
  return webFetchJson<SystemInfo>('/api/system/detect')
}

export async function saveOpenclawProfileResult(
  profile: OpenclawProfileInput,
  seed?: OpenclawProfileSeedInput
): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<void>('save_openclaw_profile', {
        kind: profile.kind,
        name: profile.name ?? null,
        seedMode: seed?.mode ?? null,
        seedPath: seed?.sourcePath ?? null,
      })
    )
  }
  return webFetchVoid('/api/settings/openclaw-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...profile,
      seedMode: seed?.mode,
      seedPath: seed?.sourcePath,
    }),
  })
}

export async function clearOpenclawProfileResult(): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<void>('clear_openclaw_profile'))
  }
  return webFetchVoid('/api/settings/openclaw-profile', {
    method: 'DELETE',
  })
}

export async function saveClawmasterRuntimeResult(
  runtime: ClawmasterRuntimeInput
): Promise<AdapterResult<void>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<void>('save_clawmaster_runtime', {
        mode: runtime.mode,
        wslDistro: runtime.wslDistro ?? null,
        backendPort: runtime.backendPort ?? null,
        autoStartBackend: runtime.autoStartBackend ?? null,
      })
    )
  }
  return webFetchVoid('/api/settings/runtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runtime),
  })
}

export async function probeHttpStatusResult(
  input: HttpProbeInput
): Promise<AdapterResult<HttpProbeOutput>> {
  if (getIsTauri()) {
    return fromPromise(async () => {
      const args = [
        '-sS',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '-X',
        input.method === 'POST' ? 'POST' : 'GET',
        '--max-time',
        String(Math.ceil((input.timeoutMs ?? 5000) / 1000)),
      ]
      for (const [key, value] of Object.entries(input.headers ?? {})) {
        args.push('-H', `${key}: ${value}`)
      }
      if (input.method === 'POST' && input.body !== undefined) {
        args.push('--data-raw', input.body)
      }
      args.push(input.url)

      const raw = await tauriInvoke<string>('run_system_command', {
        cmd: 'curl',
        args,
      })
      const status = Number.parseInt(raw.trim(), 10)
      return {
        ok: Number.isFinite(status) && status >= 200 && status < 300,
        status: Number.isFinite(status) ? status : 0,
      }
    })
  }
  return webFetchJson<HttpProbeOutput>('/api/system/probe-http', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
