import fs from 'fs'
import os from 'os'
import path from 'path'

export type OpenclawProfileKind = 'default' | 'dev' | 'named'

export interface OpenclawProfileSelection {
  kind: OpenclawProfileKind
  name?: string
}

type ClawmasterSettings = {
  openclawProfile?: OpenclawProfileSelection
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

function getClawmasterSettingsPath(context: OpenclawProfileContext = {}): string {
  if (context.settingsPath) {
    return context.settingsPath
  }
  const pathModule = getOpenclawPathModule(context.platform)
  return pathModule.join(resolveHomeDir(context.homeDir), '.clawmaster', 'settings.json')
}

function readClawmasterSettings(context: OpenclawProfileContext = {}): ClawmasterSettings {
  try {
    const raw = fs.readFileSync(getClawmasterSettingsPath(context), 'utf8')
    const parsed = JSON.parse(raw) as ClawmasterSettings
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeClawmasterSettings(
  settings: ClawmasterSettings,
  context: OpenclawProfileContext = {}
): void {
  const file = getClawmasterSettingsPath(context)
  const pathModule = getOpenclawPathModule(context.platform)
  fs.mkdirSync(pathModule.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
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
  return normalizeOpenclawProfileSelection(readClawmasterSettings(context).openclawProfile)
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
  writeClawmasterSettings(next, context)
  return normalized
}

export function clearOpenclawProfileSelection(
  context: OpenclawProfileContext = {}
): void {
  const next = readClawmasterSettings(context)
  delete next.openclawProfile
  writeClawmasterSettings(next, context)
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
