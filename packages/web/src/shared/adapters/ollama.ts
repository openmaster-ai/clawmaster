/**
 * Ollama 适配器
 *
 * 管理本地 Ollama 的安装、服务启停、模型拉取与列表
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

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

// ─── 检测与安装 ───

// Resolve ollama binary: system PATH or ~/.local/bin fallback
async function resolveOllamaBin(): Promise<string> {
  try {
    await execCommand('ollama', ['--version'])
    return 'ollama'
  } catch {
    try {
      await execCommand('bash', ['-c', '~/.local/bin/ollama --version'])
      return '~/.local/bin/ollama'
    } catch {
      throw new Error('ollama not found')
    }
  }
}

export function detectOllama(): Promise<AdapterResult<{ installed: boolean; version?: string }>> {
  return wrapAsync(async () => {
    try {
      const bin = await resolveOllamaBin()
      const raw = bin === 'ollama'
        ? await execCommand('ollama', ['--version'])
        : await execCommand('bash', ['-c', `${bin} --version`])
      const version = raw.trim().replace(/^ollama\s+version\s+/i, '')
      return { installed: true, version }
    } catch {
      return { installed: false }
    }
  })
}

export function installOllama(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    // Windows: download and run the official installer
    try {
      // Detect Windows via uname (Git Bash returns MINGW*/MSYS*)
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
    } catch { /* not Windows or installer failed — fall through */ }

    // Linux/macOS: try official install script (needs sudo)
    try {
      const raw = await execCommand('bash', [
        '-c',
        'curl -fsSL https://ollama.com/install.sh | sh 2>&1',
      ])
      return raw.trim()
    } catch {
      // Fallback: download tar.zst archive to ~/.local (no root needed)
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
    try {
      await execCommand('curl', ['-sf', '--max-time', '3', `${baseUrl}/api/tags`])
      return true
    } catch {
      return false
    }
  })
}

export function startOllama(): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const bin = await resolveOllamaBin()
    // Fire-and-forget: start ollama serve in background
    if (bin === 'ollama') {
      execCommand('nohup', ['ollama', 'serve']).catch(() => {})
    } else {
      execCommand('bash', ['-c', `nohup ${bin} serve > /dev/null 2>&1 &`]).catch(() => {})
    }
    // Wait a moment for it to start
    await new Promise((r) => setTimeout(r, 2000))
    // Verify it started
    try {
      await execCommand('curl', ['-sf', '--max-time', '5', 'http://localhost:11434/api/tags'])
      return 'started'
    } catch {
      return 'starting'
    }
  })
}

// ─── 模型管理 ───

export function listModels(baseUrl = 'http://localhost:11434'): Promise<AdapterResult<OllamaModel[]>> {
  return wrapAsync(async () => {
    const raw = await execCommand('curl', ['-sf', '--max-time', '5', `${baseUrl}/api/tags`])
    const data = JSON.parse(raw)
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
    const bin = await resolveOllamaBin()
    const raw = bin === 'ollama'
      ? await execCommand('ollama', ['pull', name])
      : await execCommand('bash', ['-c', `${bin} pull ${name}`])
    return raw.trim()
  })
}

export function deleteModel(name: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const bin = await resolveOllamaBin()
    const raw = bin === 'ollama'
      ? await execCommand('ollama', ['rm', name])
      : await execCommand('bash', ['-c', `${bin} rm ${name}`])
    return raw.trim()
  })
}

// ─── 综合状态 ───

export function getOllamaStatus(baseUrl = 'http://localhost:11434'): Promise<AdapterResult<OllamaStatus>> {
  return wrapAsync(async () => {
    // Check installed
    let installed = false
    let version: string | undefined
    try {
      const bin = await resolveOllamaBin()
      const raw = bin === 'ollama'
        ? await execCommand('ollama', ['--version'])
        : await execCommand('bash', ['-c', `${bin} --version`])
      installed = true
      version = raw.trim().replace(/^ollama\s+version\s+/i, '')
    } catch { /* not installed */ }

    // Check running + list models
    let running = false
    let models: OllamaModel[] = []
    if (installed) {
      try {
        const raw = await execCommand('curl', ['-sf', '--max-time', '3', `${baseUrl}/api/tags`])
        running = true
        const data = JSON.parse(raw)
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
