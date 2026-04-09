import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { OpenclawProfileSelection } from './openclawProfile.js'

export type ClawmasterRuntimeMode = 'native' | 'wsl2'

export interface ClawmasterRuntimeSelection {
  mode: ClawmasterRuntimeMode
  wslDistro?: string
  backendPort?: number
  autoStartBackend?: boolean
}

export interface ClawmasterSettings {
  openclawProfile?: OpenclawProfileSelection
  runtime?: ClawmasterRuntimeSelection
}

export interface ClawmasterSettingsContext {
  homeDir?: string
  settingsPath?: string
  platform?: string
}

type PlatformPath = Pick<typeof path, 'join' | 'dirname'>

function getPathModule(platformName: string = process.platform): PlatformPath {
  return platformName === 'win32' ? path.win32 : path.posix
}

function resolveHomeDir(homeDir?: string): string {
  return homeDir ?? os.homedir()
}

export function getClawmasterSettingsPath(
  context: ClawmasterSettingsContext = {}
): string {
  if (context.settingsPath) {
    return context.settingsPath
  }
  const pathModule = getPathModule(context.platform)
  return pathModule.join(resolveHomeDir(context.homeDir), '.clawmaster', 'settings.json')
}

export function readClawmasterSettings(
  context: ClawmasterSettingsContext = {}
): ClawmasterSettings {
  try {
    const raw = fs.readFileSync(getClawmasterSettingsPath(context), 'utf8')
    const parsed = JSON.parse(raw) as ClawmasterSettings
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function writeClawmasterSettings(
  settings: ClawmasterSettings,
  context: ClawmasterSettingsContext = {}
): void {
  const file = getClawmasterSettingsPath(context)
  const pathModule = getPathModule(context.platform)
  fs.mkdirSync(pathModule.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

export function normalizeClawmasterRuntimeSelection(
  selection?: Partial<ClawmasterRuntimeSelection> | null
): ClawmasterRuntimeSelection {
  const mode = selection?.mode === 'wsl2' ? 'wsl2' : 'native'
  const normalized: ClawmasterRuntimeSelection = { mode }
  const distro = selection?.wslDistro?.trim()
  if (mode === 'wsl2' && distro) {
    normalized.wslDistro = distro
  }
  if (typeof selection?.backendPort === 'number' && Number.isFinite(selection.backendPort)) {
    normalized.backendPort = Math.max(1, Math.min(65535, Math.trunc(selection.backendPort)))
  }
  if (typeof selection?.autoStartBackend === 'boolean') {
    normalized.autoStartBackend = selection.autoStartBackend
  }
  return normalized
}

export function getClawmasterRuntimeSelection(
  context: ClawmasterSettingsContext = {}
): ClawmasterRuntimeSelection {
  return normalizeClawmasterRuntimeSelection(readClawmasterSettings(context).runtime)
}

export function setClawmasterRuntimeSelection(
  selection?: Partial<ClawmasterRuntimeSelection> | null,
  context: ClawmasterSettingsContext = {}
): ClawmasterRuntimeSelection {
  const normalized = normalizeClawmasterRuntimeSelection(selection)
  const next = readClawmasterSettings(context)
  if (normalized.mode === 'native' && !normalized.wslDistro && normalized.backendPort === undefined && normalized.autoStartBackend === undefined) {
    delete next.runtime
  } else {
    next.runtime = normalized
  }
  writeClawmasterSettings(next, context)
  return normalized
}

