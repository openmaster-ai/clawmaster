import fs from 'fs'
import {
  execOpenclaw,
  invalidateOpenclawBinCache,
  spawnOpenclawGatewayStart,
} from './execOpenclaw.js'
import { writeConfigJson } from './configJson.js'
import { ensureConfigDir, getOpenclawConfigPath } from './paths.js'

export interface DoctorFixResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export interface GatewayStartBootstrapResult {
  ok: boolean
  error?: string
}

export interface BootstrapAfterInstallResult {
  doctorFix: DoctorFixResult
  gatewayStart: GatewayStartBootstrapResult
}

const DOCTOR_FIX_TIMEOUT_MS = 30_000
const GATEWAY_START_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * After CLI install/reinstall: ensure openclaw.json exists → doctor --fix → try gateway start.
 * Same idea as ClawPanel init/doctor to avoid broken empty configs right after install.
 */
export async function bootstrapOpenclawAfterInstall(): Promise<BootstrapAfterInstallResult> {
  invalidateOpenclawBinCache()
  ensureConfigDir()
  const p = getOpenclawConfigPath()
  if (!fs.existsSync(p)) {
    writeConfigJson({})
  }

  const doctor = await execOpenclaw(['doctor', '--fix'], { timeoutMs: DOCTOR_FIX_TIMEOUT_MS })

  let gatewayOk = false
  let gatewayError: string | undefined
  try {
    await withTimeout(
      spawnOpenclawGatewayStart(),
      GATEWAY_START_TIMEOUT_MS,
      'openclaw gateway start',
    )
    gatewayOk = true
  } catch (e) {
    gatewayError = e instanceof Error ? e.message : String(e)
  }

  return {
    doctorFix: {
      ok: doctor.code === 0,
      code: doctor.code,
      stdout: doctor.stdout,
      stderr: doctor.stderr,
    },
    gatewayStart: {
      ok: gatewayOk,
      error: gatewayError,
    },
  }
}
