import { bootstrapOpenclawAfterInstall } from '../openclawBootstrap.js'
import { fetchClawmasterNpmMeta, fetchOpenclawNpmMeta, npmInstallOpenclawFromLocalFile, npmInstallOpenclawGlobal } from '../npmOpenclaw.js'
import { reinstallOpenclawWithBackup, runReinstallBackupStep, runReinstallUninstallStep } from '../reinstallOpenclaw.js'

export async function getNpmOpenclawVersions() {
  return fetchOpenclawNpmMeta()
}

export async function getNpmClawmasterVersions() {
  return fetchClawmasterNpmMeta()
}

export async function installOpenclaw(params: { version?: unknown; localPath?: unknown }) {
  const localPath = typeof params.localPath === 'string' ? params.localPath.trim() : ''
  if (localPath) return npmInstallOpenclawFromLocalFile(localPath)
  const raw = params.version
  const spec = raw === undefined || raw === null ? 'latest' : String(raw)
  return npmInstallOpenclawGlobal(spec)
}

export async function reinstallBackupStep() {
  return runReinstallBackupStep()
}

export async function reinstallUninstallStep() {
  return runReinstallUninstallStep()
}

export async function reinstallOpenclaw(version?: unknown) {
  const spec = version === undefined || version === null ? 'latest' : String(version)
  return reinstallOpenclawWithBackup(spec)
}

export async function bootstrapAfterInstall() {
  return bootstrapOpenclawAfterInstall()
}
