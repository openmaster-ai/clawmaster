import fs from 'fs'
import { execOpenclaw, spawnOpenclawGatewayStart } from './execOpenclaw.js'
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

/**
 * After CLI install/reinstall: ensure openclaw.json exists → doctor --fix → try gateway start.
 * Same idea as ClawPanel init/doctor to avoid broken empty configs right after install.
 */
export async function bootstrapOpenclawAfterInstall(): Promise<BootstrapAfterInstallResult> {
  ensureConfigDir()
  const p = getOpenclawConfigPath()
  if (!fs.existsSync(p)) {
    writeConfigJson({})
  }

  const doctor = await execOpenclaw(['doctor', '--fix'])

  let gatewayOk = false
  let gatewayError: string | undefined
  try {
    await spawnOpenclawGatewayStart()
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
