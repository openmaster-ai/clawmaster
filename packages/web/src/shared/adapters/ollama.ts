/**
 * Ollama 适配器
 *
 * 管理本地 Ollama 的安装、服务启停、模型拉取与列表
 */

import { execCommand } from './platform'
import { getIsTauri } from './platform'
import { tauriInvoke } from './invoke'
import { wrapAsync, type AdapterResult } from './types'
import { webFetchJson } from './webHttp'

// ─── 类型定义 ───

export interface OllamaModel {
  name: string
  size: number       // bytes
  modifiedAt: string
  digest: string
}

export interface OllamaStatus {
  installed: boolean
  version?: string
  running: boolean
  models: OllamaModel[]
}

async function tauriRunOllama(args: string[]): Promise<string> {
  return tauriInvoke<string>('run_ollama_command', { args })
}

async function detectTauriOllama(): Promise<{ installed: boolean; version?: string }> {
  return tauriInvoke<{ installed: boolean; version?: string }>('detect_ollama_installation')
}

// ─── 检测与安装 ───
async function resolveOllamaInstallation(): Promise<{ bin: string; version: string }> {
  if (!getIsTauri()) {
    const result = await webFetchJson<{ installed: boolean; version?: string }>('/api/ollama/detect')
    if (!result.success || !result.data?.installed) {
      throw new Error(result.error ?? 'ollama not found')
    }
    return { bin: 'ollama', version: result.data.version ?? '' }
  }
  const result = await detectTauriOllama()
  if (!result.installed) {
    throw new Error('ollama not found')
  }
  return {
    bin: 'ollama',
    version: result.version ?? '',
  }
}

async function fetchOllamaTags(baseUrl: string, timeoutMs = 5000): Promise<{ models?: any[] }> {
  if (!getIsTauri()) {
    const query = new URLSearchParams({ baseUrl }).toString()
    const result = await webFetchJson<OllamaModel[]>(`/api/ollama/models?${query}`)
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to fetch Ollama tags')
    }
    return {
      models: (result.data ?? []).map((model) => ({
        name: model.name,
        size: model.size,
        modified_at: model.modifiedAt,
        digest: model.digest,
      })),
    }
  }
  const raw = await execCommand('curl', ['-sf', '--max-time', String(Math.ceil(timeoutMs / 1000)), `${baseUrl}/api/tags`])
  return JSON.parse(raw) as { models?: any[] }
}

export function detectOllama(): Promise<AdapterResult<{ installed: boolean; version?: string }>> {
  return wrapAsync(async () => {
    try {
      const installation = await resolveOllamaInstallation()
      return { installed: true, version: installation.version }
    } catch {
      return { installed: false }
    }
  })
}

export function installOllama(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    if (!getIsTauri()) {
      const result = await webFetchJson<{ status: string }>('/api/ollama/install', {
        method: 'POST',
      })
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to install Ollama')
      }
      return result.data?.status ?? 'installed'
    }
    return tauriInvoke<string>('install_ollama')
  })
}

// ─── 服务管理 ───

export function isOllamaRunning(baseUrl = 'http://localhost:11434'): Promise<AdapterResult<boolean>> {
  return wrapAsync(async () => {
    if (!getIsTauri()) {
      const query = new URLSearchParams({ baseUrl }).toString()
      const result = await webFetchJson<{ running: boolean }>(`/api/ollama/running?${query}`)
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to detect Ollama runtime')
      }
      return Boolean(result.data?.running)
    }
    try {
      await fetchOllamaTags(baseUrl, 3000)
      return true
    } catch {
      return false
    }
  })
}

export function startOllama(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    if (!getIsTauri()) {
      const result = await webFetchJson<{ status: string }>('/api/ollama/start', {
        method: 'POST',
      })
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to start Ollama')
      }
      return result.data?.status ?? 'starting'
    }
    await tauriInvoke<string>('start_ollama')
    // Wait a moment for it to start
    await new Promise((r) => setTimeout(r, 2000))
    // Verify it started
    try {
      await fetchOllamaTags('http://localhost:11434', 5000)
      return 'started'
    } catch {
      return 'starting'
    }
  })
}

// ─── 模型管理 ───

export function listModels(baseUrl = 'http://localhost:11434'): Promise<AdapterResult<OllamaModel[]>> {
  return wrapAsync(async () => {
    const data = await fetchOllamaTags(baseUrl, 5000)
    const models = data.models ?? []
    return models.map((m: any) => ({
      name: m.name ?? m.model ?? '',
      size: m.size ?? 0,
      modifiedAt: m.modified_at ?? '',
      digest: m.digest ?? '',
    }))
  })
}

export function pullModel(name: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    if (!getIsTauri()) {
      await resolveOllamaInstallation()
      const result = await webFetchJson<{ status: string }>('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to pull Ollama model')
      }
      return result.data?.status ?? ''
    }
    const raw = await tauriRunOllama(['pull', name])
    return raw.trim()
  })
}

export function deleteModel(name: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    if (!getIsTauri()) {
      await resolveOllamaInstallation()
      const result = await webFetchJson<{ status: string }>('/api/ollama/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to delete Ollama model')
      }
      return result.data?.status ?? ''
    }
    const raw = await tauriRunOllama(['rm', name])
    return raw.trim()
  })
}

// ─── 综合状态 ───

export function getOllamaStatus(baseUrl = 'http://localhost:11434'): Promise<AdapterResult<OllamaStatus>> {
  if (!getIsTauri()) {
    const query = new URLSearchParams({ baseUrl }).toString()
    return webFetchJson<OllamaStatus>(`/api/ollama/status?${query}`)
  }
  return wrapAsync(async () => {
    // Check installed
    let installed = false
    let version: string | undefined
    try {
      const installation = await resolveOllamaInstallation()
      installed = true
      version = installation.version
    } catch { /* not installed */ }

    // Check running + list models
    let running = false
    let models: OllamaModel[] = []
    if (installed) {
      try {
        const data = await fetchOllamaTags(baseUrl, 3000)
        running = true
        models = (data.models ?? []).map((m: any) => ({
          name: m.name ?? '',
          size: m.size ?? 0,
          modifiedAt: m.modified_at ?? '',
          digest: m.digest ?? '',
        }))
      } catch { /* not running */ }
    }

    return { installed, version, running, models }
  })
}

// ─── 工具函数 ───

export function formatModelSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
