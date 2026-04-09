import fs from 'fs'
import { getClawmasterRuntimeSelection } from './clawmasterSettings.js'
import { getOpenclawConfigPath, ensureConfigDir } from './paths.js'
import {
  getWslOpenclawProbeSync,
  readTextFileInWslSync,
  resolveSelectedWslDistroSync,
  shouldUseWslRuntime,
  writeTextFileInWslSync,
} from './wslRuntime.js'

/**
 * Same behavior as web `unwrapDoubleNestedModelsInRoot`: fix when the whole `{"models":{...}}`
 * block was pasted into the models editor by mistake.
 */
export function unwrapDoubleNestedModelsInRoot(
  root: Record<string, unknown>
): Record<string, unknown> {
  const m = root.models
  if (m === undefined || typeof m !== 'object' || m === null || Array.isArray(m)) {
    return root
  }
  const o = m as Record<string, unknown>
  const keys = Object.keys(o)
  if (
    keys.length === 1 &&
    keys[0] === 'models' &&
    typeof o.models === 'object' &&
    o.models !== null &&
    !Array.isArray(o.models)
  ) {
    const inner = o.models as Record<string, unknown>
    if ('providers' in inner || 'mode' in inner) {
      return { ...root, models: { ...inner } }
    }
  }
  return root
}

export function readConfigJson(): Record<string, unknown> | null {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    const distro = resolveSelectedWslDistroSync(runtimeSelection)
    if (!distro) return null
    const configPath = getWslOpenclawProbeSync(distro).configPath
    const raw = readTextFileInWslSync(distro, configPath)
    if (!raw) return null
    try {
      const data = JSON.parse(raw) as unknown
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as Record<string, unknown>
      }
      return null
    } catch {
      return null
    }
  }

  const p = getOpenclawConfigPath()
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const data = JSON.parse(raw) as unknown
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/** Treat missing or invalid config file as `{}` so the manager UI can load on first visit. */
export function readConfigJsonOrEmpty(): Record<string, unknown> {
  const raw = readConfigJson() ?? {}
  const fixed = unwrapDoubleNestedModelsInRoot({ ...raw })
  const rawM = JSON.stringify(raw.models)
  const fixedM = JSON.stringify(fixed.models)
  if (rawM !== fixedM) {
    writeConfigJson(fixed)
  }
  return fixed
}

export function writeConfigJson(config: Record<string, unknown>): void {
  const out = unwrapDoubleNestedModelsInRoot({ ...config })
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    const distro = resolveSelectedWslDistroSync(runtimeSelection)
    if (!distro) {
      throw new Error('WSL2 runtime selected but no distro could be resolved')
    }
    const configPath = getWslOpenclawProbeSync(distro).configPath
    writeTextFileInWslSync(distro, configPath, `${JSON.stringify(out, null, 2)}\n`)
    return
  }

  ensureConfigDir()
  const p = getOpenclawConfigPath()
  fs.writeFileSync(p, JSON.stringify(out, null, 2), 'utf-8')
}

let configUpdateQueue: Promise<void> = Promise.resolve()

/**
 * Serialize config read-modify-write operations to avoid lost updates.
 */
export function updateConfigJson<T>(
  updater: (config: Record<string, unknown>) => T | Promise<T>
): Promise<T> {
  const run = configUpdateQueue.then(async () => {
    const config = readConfigJsonOrEmpty()
    const result = await updater(config)
    writeConfigJson(config)
    return result
  })
  configUpdateQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Dot-path writes aligned with web setConfig and Tauri save_config. */
export function setConfigAtPath(
  root: Record<string, unknown>,
  pathStr: string,
  value: unknown
): void {
  const keys = pathStr.split('.').filter(Boolean)
  if (keys.length === 0) return
  let obj: Record<string, unknown> = root
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const next = obj[k]
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      obj = next as Record<string, unknown>
    } else {
      const nested: Record<string, unknown> = {}
      obj[k] = nested
      obj = nested
    }
  }
  obj[keys[keys.length - 1]] = value as unknown
}
