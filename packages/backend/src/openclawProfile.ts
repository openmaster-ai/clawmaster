import os from 'os'
import path from 'path'
import {
  readClawmasterSettings,
  writeClawmasterSettings,
  type ClawmasterSettingsContext,
} from './clawmasterSettings.js'

export type OpenclawProfileKind = 'default' | 'dev' | 'named'

export interface OpenclawProfileSelection {
  kind: OpenclawProfileKind
  name?: string
}

type PlatformPath = Pick<typeof path, 'join' | 'dirname'>

export interface OpenclawProfileContext {
  homeDir?: string
  settingsPath?: string
  platform?: string
}

export function getOpenclawPathModule(platformName: string = process.platform): PlatformPath {
  return platformName === 'win32' ? path.win32 : path.posix
}

function resolveHomeDir(homeDir?: string): string {
  return homeDir ?? os.homedir()
}

function sanitizeProfileName(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Profile name is required')
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error('Profile name may only contain letters, numbers, dot, underscore, and hyphen')
  }
  if (trimmed === 'default') {
    throw new Error('Use the default profile option instead of the reserved name "default"')
  }
  return trimmed
}

export function normalizeOpenclawProfileSelection(
  selection?: Partial<OpenclawProfileSelection> | null
): OpenclawProfileSelection {
  if (!selection?.kind || selection.kind === 'default') {
    return { kind: 'default' }
  }
  if (selection.kind === 'dev') {
    return { kind: 'dev' }
  }
  if (selection.kind === 'named') {
    return {
      kind: 'named',
      name: sanitizeProfileName(selection.name ?? ''),
    }
  }
  throw new Error('Unsupported OpenClaw profile kind')
}

export function getOpenclawProfileSelection(
  context: OpenclawProfileContext = {}
): OpenclawProfileSelection {
  return normalizeOpenclawProfileSelection(
    readClawmasterSettings(context as ClawmasterSettingsContext).openclawProfile
  )
}

export function setOpenclawProfileSelection(
  selection?: Partial<OpenclawProfileSelection> | null,
  context: OpenclawProfileContext = {}
): OpenclawProfileSelection {
  const normalized = normalizeOpenclawProfileSelection(selection)
  if (normalized.kind === 'default') {
    clearOpenclawProfileSelection(context)
    return normalized
  }

  const next = readClawmasterSettings(context)
  next.openclawProfile = normalized
  writeClawmasterSettings(next, context as ClawmasterSettingsContext)
  return normalized
}

export function clearOpenclawProfileSelection(
  context: OpenclawProfileContext = {}
): void {
  const next = readClawmasterSettings(context as ClawmasterSettingsContext)
  delete next.openclawProfile
  writeClawmasterSettings(next, context as ClawmasterSettingsContext)
}

export function getOpenclawProfileArgs(
  selection: OpenclawProfileSelection = getOpenclawProfileSelection()
): string[] {
  if (selection.kind === 'dev') {
    return ['--dev']
  }
  if (selection.kind === 'named' && selection.name) {
    return ['--profile', selection.name]
  }
  return []
}

export function getOpenclawDataDirForProfile(
  selection: OpenclawProfileSelection,
  context: OpenclawProfileContext = {}
): string | null {
  const pathModule = getOpenclawPathModule(context.platform)
  const homeDir = resolveHomeDir(context.homeDir)
  if (selection.kind === 'dev') {
    return pathModule.join(homeDir, '.openclaw-dev')
  }
  if (selection.kind === 'named' && selection.name) {
    return pathModule.join(homeDir, `.openclaw-${selection.name}`)
  }
  return null
}
