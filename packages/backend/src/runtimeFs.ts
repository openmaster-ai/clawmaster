import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getClawmasterRuntimeSelection } from './clawmasterSettings.js'
import {
  execWslCommandSync,
  fileExistsInWslSync,
  readTextFileInWslSync,
  requireSelectedWslDistroSync,
  shouldUseWslRuntime,
  writeTextFileInWslSync,
} from './wslRuntime.js'

function getRuntimeWslDistro(): string | null {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (!shouldUseWslRuntime(runtimeSelection)) {
    return null
  }
  return requireSelectedWslDistroSync(runtimeSelection)
}

function expandHomePath(input: string): string {
  if (input === '~') {
    return os.homedir()
  }
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2))
  }
  return input
}

function resolveHostPath(input: string): string {
  const expanded = expandHomePath(input)
  return path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded)
}

function resolveWslPathSync(distro: string, input: string): string {
  const script = `
resolve_path() {
  local value="$1"
  case "$value" in
    "~")
      value="$HOME"
      ;;
    "~/"*)
      value="$HOME/\${value#~/}"
      ;;
  esac
  if [ -z "$value" ]; then
    realpath -m "$PWD"
    return
  fi
  if [ "\${value#/}" != "$value" ]; then
    realpath -m "$value"
    return
  fi
  realpath -m "$PWD/$value"
}
resolve_path "$1"
  `.trim()
  const out = execWslCommandSync(distro, 'bash', ['-lc', script, '--', input])
  if (out.code !== 0) {
    throw new Error(out.stderr.trim() || out.stdout.trim() || 'Failed to resolve WSL path')
  }
  const resolved = out.stdout.trim()
  if (!resolved) {
    throw new Error('Failed to resolve WSL path')
  }
  return resolved
}

export function resolveRuntimePathSync(input: string): string {
  const distro = getRuntimeWslDistro()
  if (!distro) {
    return resolveHostPath(input)
  }
  return resolveWslPathSync(distro, input)
}

export function readOptionalRuntimeTextFileSync(input: string): {
  path: string
  exists: boolean
  content: string
} {
  const distro = getRuntimeWslDistro()
  if (!distro) {
    const resolved = resolveHostPath(input)
    if (!fs.existsSync(resolved)) {
      return { path: resolved, exists: false, content: '' }
    }
    return {
      path: resolved,
      exists: true,
      content: fs.readFileSync(resolved, 'utf8'),
    }
  }

  const resolved = resolveWslPathSync(distro, input)
  if (!fileExistsInWslSync(distro, resolved)) {
    return { path: resolved, exists: false, content: '' }
  }
  return {
    path: resolved,
    exists: true,
    content: readTextFileInWslSync(distro, resolved) ?? '',
  }
}

export function readRequiredRuntimeTextFileSync(input: string): {
  path: string
  content: string
} {
  const out = readOptionalRuntimeTextFileSync(input)
  if (!out.exists) {
    throw new Error(`File not found: ${out.path}`)
  }
  return {
    path: out.path,
    content: out.content,
  }
}

export function writeRuntimeTextFileSync(input: string, content: string): { path: string } {
  const distro = getRuntimeWslDistro()
  const normalized = content.endsWith('\n') ? content : `${content}\n`
  if (!distro) {
    const resolved = resolveHostPath(input)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, normalized, 'utf8')
    return { path: resolved }
  }

  const resolved = resolveWslPathSync(distro, input)
  writeTextFileInWslSync(distro, resolved, normalized)
  return { path: resolved }
}
