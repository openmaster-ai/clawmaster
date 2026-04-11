/**
 * Ollama 适配器
 *
 * 管理本地 Ollama 的安装、服务启停、模型拉取与列表
 */

import { execCommand } from './platform'
import { getIsTauri } from './platform'
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

async function execTauriOllama(bin: string, args: string[]): Promise<string> {
  if (bin === 'ollama') {
    return execCommand('ollama', args)
  }
  return execCommand('bash', [
    '-lc',
    'bin="$1"; shift; "$bin" "$@"',
    '--',
    bin,
    ...args,
  ])
}

async function resolveTauriOllamaBin(): Promise<string> {
  try {
    await execCommand('ollama', ['--version'])
    return 'ollama'
  } catch {
    await execTauriOllama('~/.local/bin/ollama', ['--version'])
    return '~/.local/bin/ollama'
  }
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
  const bin = await resolveTauriOllamaBin()
  const raw = await execTauriOllama(bin, ['--version'])
  return {
    bin,
    version: raw.trim().replace(/^ollama\s+version\s+/i, ''),
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
    try {
      const uname = await execCommand('bash', ['-c', 'uname -s 2>/dev/null || echo Linux']).catch(() => 'Linux')
      if (/MINGW|MSYS|Windows/i.test(uname)) {
        const raw = await execCommand('bash', ['-c', [
          'INSTALLER="${TMPDIR:-/tmp}/OllamaSetup.exe"',
          'curl -fsSL -o "$INSTALLER" https://ollama.com/download/OllamaSetup.exe',
          'echo "Downloaded OllamaSetup.exe. Running installer..."',
          '"$INSTALLER" /SILENT /NORESTART',
          'echo "Ollama installed on Windows"',
        ].join(' && ')])
        return raw.trim()
      }
    } catch {
      // fall through
    }

    try {
      const raw = await execCommand('bash', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh 2>&1'])
      return raw.trim()
    } catch {
      const raw = await execCommand('bash', [
        '-c',
        [
          'set -e',
          'mkdir -p ~/.local/bin ~/.local/lib/ollama',
          'ARCH=$(uname -m)',
          'case $ARCH in x86_64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; esac',
          'LATEST=$(curl -fsSI https://github.com/ollama/ollama/releases/latest 2>/dev/null | grep -i "^location:" | sed "s|.*/tag/||" | tr -d "\\r\\n")',
          'URL="https://github.com/ollama/ollama/releases/download/${LATEST}/ollama-linux-${ARCH}.tar.zst"',
          'echo "Downloading ${URL}..."',
          'curl -fsSL "${URL}" | zstd -d | tar x -C ~/.local 2>&1',
          'chmod +x ~/.local/bin/ollama',
          'echo "Installed ollama ${LATEST} to ~/.local/bin/ollama"',
        ].join(' && '),
      ])
      return raw.trim()
    }
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
    const bin = await resolveTauriOllamaBin()
    if (bin === 'ollama') {
      execCommand('nohup', ['ollama', 'serve']).catch(() => {})
    } else {
      execCommand('bash', [
        '-lc',
        'bin="$1"; shift; nohup "$bin" "$@" > /dev/null 2>&1 &',
        '--',
        bin,
        'serve',
      ]).catch(() => {})
    }
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
    const bin = await resolveTauriOllamaBin()
    const raw = await execTauriOllama(bin, ['pull', name])
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
    const bin = await resolveTauriOllamaBin()
    const raw = await execTauriOllama(bin, ['rm', name])
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
