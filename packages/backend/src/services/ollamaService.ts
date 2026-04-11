import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import {
  execWslCommand,
  getWslHomeDirSync,
  requireSelectedWslDistroSync,
  resolveCommandInWslSync,
  runWslShell,
  shellEscapePosixArg,
  shouldUseWslRuntime,
} from '../wslRuntime.js'

const execFileAsync = promisify(execFile)

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
  digest: string
}

export interface OllamaStatus {
  installed: boolean
  version?: string
  running: boolean
  models: OllamaModel[]
}

type OllamaInstallation = {
  bin: string
  version: string
}

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export const OLLAMA_USER_LOCAL_INSTALL_SCRIPT = [
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
].join(' && ')

async function runHostHelper(args: string[]): Promise<string> {
  const out = await execFileAsync(process.execPath, ['-e', OLLAMA_HOST_HELPER_SCRIPT, ...args], {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  })
  return String(out.stdout ?? '').trim()
}

function getSelectedWslDistro(): string | null {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (!shouldUseWslRuntime(runtimeSelection)) {
    return null
  }
  return requireSelectedWslDistroSync(runtimeSelection)
}

async function resolveOllamaInstallation(): Promise<OllamaInstallation> {
  const distro = getSelectedWslDistro()
  if (!distro) {
    return JSON.parse(await runHostHelper(['resolve'])) as OllamaInstallation
  }

  const candidates = [
    resolveCommandInWslSync(distro, 'ollama'),
    `${getWslHomeDirSync(distro).replace(/\/+$/, '')}/.local/bin/ollama`,
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    const out = await execWslCommand(distro, candidate, ['--version'])
    if (out.code !== 0) continue
    return {
      bin: candidate,
      version: out.stdout.replace(/^ollama\s+version\s+/i, '').trim(),
    }
  }

  throw new Error('ollama not found')
}

async function fetchOllamaTags(baseUrl: string, timeoutMs = 5000): Promise<{ models?: unknown[] }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return (await response.json()) as { models?: unknown[] }
  } finally {
    clearTimeout(timer)
  }
}

function mapModels(rawModels: unknown[]): OllamaModel[] {
  return rawModels.map((raw) => {
    const model = (raw ?? {}) as Record<string, unknown>
    return {
      name: typeof model.name === 'string' ? model.name : typeof model.model === 'string' ? model.model : '',
      size: typeof model.size === 'number' ? model.size : 0,
      modifiedAt: typeof model.modified_at === 'string' ? model.modified_at : '',
      digest: typeof model.digest === 'string' ? model.digest : '',
    }
  })
}

async function runWslCommandWithInput(
  distro: string,
  cmd: string,
  args: string[],
  input: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['-d', distro, '--', cmd, ...args], {
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.stdin.end(input)
  })
}

async function runHostCommandWithInput(
  cmd: string,
  args: string[],
  input: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.stdin.end(input)
  })
}

async function runHostShell(script: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', script], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function runOllamaInstallWithFallback(
  primaryInstall: () => Promise<CommandResult>,
  fallbackInstall: () => Promise<CommandResult>,
  options: {
    enableFallback?: boolean
  } = {},
): Promise<string> {
  const primary = await primaryInstall()
  if (primary.code === 0) {
    return primary.stdout.trim() || 'installed'
  }

  if (options.enableFallback === false) {
    throw new Error(
      primary.stderr.trim()
        || primary.stdout.trim()
        || `ollama install failed (${primary.code})`,
    )
  }

  const fallback = await fallbackInstall()
  if (fallback.code === 0) {
    return fallback.stdout.trim() || 'installed'
  }

  throw new Error(
    fallback.stderr.trim()
      || fallback.stdout.trim()
      || primary.stderr.trim()
      || primary.stdout.trim()
      || `ollama install failed (${primary.code})`,
  )
}

async function installOllamaHost(): Promise<string> {
  if (process.platform === 'win32') {
    return runHostHelper(['install'])
  }

  const response = await fetch('https://ollama.com/install.sh')
  if (!response.ok) {
    throw new Error('Failed to download Ollama install script')
  }
  const script = await response.text()

  return runOllamaInstallWithFallback(
    () => runHostCommandWithInput('sh', ['-s'], script),
    () => runHostShell(OLLAMA_USER_LOCAL_INSTALL_SCRIPT),
    { enableFallback: process.platform !== 'darwin' },
  )
}

export async function detectOllamaInstallation(): Promise<{ installed: boolean; version?: string }> {
  try {
    const installation = await resolveOllamaInstallation()
    return { installed: true, version: installation.version }
  } catch {
    return { installed: false }
  }
}

export async function installOllamaService(): Promise<string> {
  const distro = getSelectedWslDistro()
  if (!distro) {
    return installOllamaHost()
  }

  const response = await fetch('https://ollama.com/install.sh')
  if (!response.ok) {
    throw new Error('Failed to download Ollama install script')
  }
  const script = await response.text()

  return runOllamaInstallWithFallback(
    () => runWslCommandWithInput(distro, 'sh', ['-s'], script),
    () => runWslShell(distro, OLLAMA_USER_LOCAL_INSTALL_SCRIPT),
  )
}

export async function isOllamaRunningService(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  try {
    await fetchOllamaTags(baseUrl, 3000)
    return true
  } catch {
    return false
  }
}

export async function startOllamaService(): Promise<string> {
  const distro = getSelectedWslDistro()
  if (!distro) {
    await runHostHelper(['start'])
  } else {
    const installation = await resolveOllamaInstallation()
    const out = await runWslShell(
      distro,
      `nohup ${shellEscapePosixArg(installation.bin)} serve >/dev/null 2>&1 &`
    )
    if (out.code !== 0) {
      throw new Error(out.stderr.trim() || out.stdout.trim() || 'Failed to start Ollama')
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 2000))
  try {
    await fetchOllamaTags('http://localhost:11434', 5000)
    return 'started'
  } catch {
    return 'starting'
  }
}

export async function listOllamaModels(baseUrl = 'http://localhost:11434'): Promise<OllamaModel[]> {
  const data = await fetchOllamaTags(baseUrl, 5000)
  return mapModels(Array.isArray(data.models) ? data.models : [])
}

export async function pullOllamaModel(name: string): Promise<string> {
  const installation = await resolveOllamaInstallation()
  const distro = getSelectedWslDistro()
  if (!distro) {
    return runHostHelper(['run', 'pull', name])
  }

  const out = await execWslCommand(distro, installation.bin, ['pull', name])
  if (out.code !== 0) {
    throw new Error(out.stderr.trim() || out.stdout.trim() || `ollama pull failed (${out.code})`)
  }
  return out.stdout.trim()
}

export async function deleteOllamaModel(name: string): Promise<string> {
  const installation = await resolveOllamaInstallation()
  const distro = getSelectedWslDistro()
  if (!distro) {
    return runHostHelper(['run', 'rm', name])
  }

  const out = await execWslCommand(distro, installation.bin, ['rm', name])
  if (out.code !== 0) {
    throw new Error(out.stderr.trim() || out.stdout.trim() || `ollama rm failed (${out.code})`)
  }
  return out.stdout.trim()
}

export async function getOllamaStatusService(baseUrl = 'http://localhost:11434'): Promise<OllamaStatus> {
  let installed = false
  let version: string | undefined
  try {
    const installation = await resolveOllamaInstallation()
    installed = true
    version = installation.version
  } catch {
    installed = false
  }

  let running = false
  let models: OllamaModel[] = []
  if (installed) {
    try {
      models = await listOllamaModels(baseUrl)
      running = true
    } catch {
      running = false
    }
  }

  return { installed, version, running, models }
}

const OLLAMA_HOST_HELPER_SCRIPT = `
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function resolveCandidates() {
  const localBin = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'ollama.exe' : 'ollama')
  return ['ollama', localBin]
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || command + ' failed').trim())
  }
  return (result.stdout || result.stderr || '').trim()
}

function resolveInstall() {
  for (const candidate of resolveCandidates()) {
    try {
      const output = runSync(candidate, ['--version'])
      return {
        bin: candidate,
        version: output.replace(/^ollama\\s+version\\s+/i, '').trim(),
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('ollama not found')
}

async function installOllama() {
  if (process.platform === 'win32') {
    const installerPath = path.join(os.tmpdir(), 'OllamaSetup.exe')
    const response = await fetch('https://ollama.com/download/OllamaSetup.exe')
    if (!response.ok) throw new Error('Failed to download OllamaSetup.exe')
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(installerPath, buffer)
    runSync(installerPath, ['/SILENT', '/NORESTART'], { stdio: 'pipe' })
    console.log('Ollama installed on Windows')
    return
  }

  const response = await fetch('https://ollama.com/install.sh')
  if (!response.ok) throw new Error('Failed to download Ollama install script')
  const script = await response.text()
  const output = runSync('sh', ['-s'], {
    input: script,
    env: process.env,
  })
  console.log(output)
}

async function main() {
  const action = process.argv[1]
  if (action === 'resolve') {
    console.log(JSON.stringify(resolveInstall()))
    return
  }
  if (action === 'start') {
    const installation = resolveInstall()
    const child = spawn(installation.bin, ['serve'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    console.log('started')
    return
  }
  if (action === 'run') {
    const installation = resolveInstall()
    const args = process.argv.slice(2)
    const output = runSync(installation.bin, args)
    console.log(output)
    return
  }
  if (action === 'install') {
    await installOllama()
    return
  }
  throw new Error('unknown action: ' + action)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
`.trim()
