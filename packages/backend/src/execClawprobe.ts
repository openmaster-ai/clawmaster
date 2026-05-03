import { execFile, execFileSync } from 'node:child_process'
import fs, { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getClawmasterRuntimeSelection } from './clawmasterSettings.js'
import { resolveNpmExecFileCommand, needsShellOnWindows } from './execOpenclaw.js'
import { getOpenclawDataDir } from './paths.js'
import { normalizeLoginShellWhichLine } from './shellWhichNormalize.js'
import { readFreshModelsDevCustomPrices, type ClawprobeCustomPrice } from './services/modelsDevPricing.js'
import {
  getWslHomeDirSync,
  getWslRuntimeUnavailableMessage,
  readTextFileInWslSync,
  requireSelectedWslDistroSync,
  resolveCommandInWslSync,
  runWslShell,
  runWslShellSync,
  shellEscapePosixArg,
  shouldUseWslRuntime,
  writeTextFileInWslSync,
} from './wslRuntime.js'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)

export type ClawprobeUnavailableReason = 'not-installed' | 'not-visible'

export class ClawprobeUnavailableError extends Error {
  code = 'CLAWPROBE_UNAVAILABLE'
  reason: ClawprobeUnavailableReason

  constructor(reason: ClawprobeUnavailableReason = 'not-installed') {
    const message =
      reason === 'not-visible'
        ? 'ClawProbe appears to be installed, but the backend cannot resolve its executable path'
        : 'ClawProbe is not installed'
    super(message)
    this.reason = reason
    this.name = 'ClawprobeUnavailableError'
  }
}

export interface ClawprobeCommandOutput {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export interface ClawprobeExecutionOptions {
  useModelsDevPricing?: boolean
}

type ClawprobeCommandResolution = {
  cmd: string
  argsPrefix: string[]
  source: 'local-package' | 'global-package' | 'login-shell' | 'bare'
  globalInstallDetected: boolean
}

type PreparedClawprobeExecution = {
  cmd?: string
  args?: string[]
  env?: NodeJS.ProcessEnv
  cleanup?: () => Promise<void> | void
}

function getClawprobePackageRoot(): string | null {
  try {
    const pkgJson = require.resolve('clawprobe/package.json')
    return path.dirname(pkgJson)
  } catch {
    return null
  }
}

function getGlobalNpmRoot(): string | null {
  try {
    const out = execFileSync(resolveNpmExecFileCommand(), ['root', '-g'], {
      encoding: 'utf8',
      env: process.env,
      shell: needsShellOnWindows('npm'),
      windowsHide: true,
    }).trim()
    return out || null
  } catch {
    return null
  }
}

function getGlobalClawprobePackageRoot(): string | null {
  const globalRoot = getGlobalNpmRoot()
  if (!globalRoot) {
    return null
  }
  const candidate = path.join(globalRoot, 'clawprobe')
  return existsSync(candidate) ? candidate : null
}

function getClawprobeEntryFromPackageRoot(root: string | null): string | null {
  if (!root) {
    return null
  }
  const entry = path.join(root, 'dist', 'index.js')
  return existsSync(entry) ? entry : null
}

function resolveBareClawprobeInLoginShell(): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('cmd', ['/c', 'where clawprobe'], {
        encoding: 'utf8',
        windowsHide: true,
      })
      const line = out.trim().split(/\r?\n/)[0]?.trim()
      return line && line.length > 0 ? line : null
    }
    if (process.platform === 'darwin') {
      let line: string | undefined
      try {
        const out = execFileSync('/bin/zsh', ['-ilc', 'whence -p clawprobe'], {
          encoding: 'utf8',
          env: process.env,
        })
        line = out.trim().split(/\r?\n/)[0]?.trim()
      } catch {
        /* fall through */
      }
      if (!line) {
        const out = execFileSync('/bin/zsh', ['-ilc', 'command -v clawprobe'], {
          encoding: 'utf8',
          env: process.env,
        })
        line =
          normalizeLoginShellWhichLine(out.trim().split(/\r?\n/)[0]) ??
          out.trim().split(/\r?\n/)[0]?.trim()
      }
      return line && line.length > 0 ? line : null
    }
    let line: string | undefined
    try {
      const out = execFileSync('/bin/bash', ['--login', '-c', 'type -P clawprobe'], {
        encoding: 'utf8',
        env: process.env,
      })
      line = out.trim().split(/\r?\n/)[0]?.trim()
    } catch {
      /* fall through */
    }
    if (!line) {
      const out = execFileSync('/bin/bash', ['--login', '-c', 'command -v clawprobe'], {
        encoding: 'utf8',
        env: process.env,
      })
      line =
        normalizeLoginShellWhichLine(out.trim().split(/\r?\n/)[0]) ??
        out.trim().split(/\r?\n/)[0]?.trim()
    }
    return line && line.length > 0 ? line : null
  } catch {
    return null
  }
}

export function resolveClawprobeCommandForTest(options: {
  localPackageRoot?: string | null
  globalPackageRoot?: string | null
  loginShellPath?: string | null
  processExecPath?: string
}): ClawprobeCommandResolution {
  const localEntry = getClawprobeEntryFromPackageRoot(options.localPackageRoot ?? null)
  if (localEntry) {
    return {
      cmd: options.processExecPath ?? process.execPath,
      argsPrefix: [localEntry],
      source: 'local-package',
      globalInstallDetected: Boolean(options.globalPackageRoot),
    }
  }

  const globalEntry = getClawprobeEntryFromPackageRoot(options.globalPackageRoot ?? null)
  if (globalEntry) {
    return {
      cmd: options.processExecPath ?? process.execPath,
      argsPrefix: [globalEntry],
      source: 'global-package',
      globalInstallDetected: true,
    }
  }

  const loginShellPath = options.loginShellPath?.trim()
  if (loginShellPath) {
    return {
      cmd: loginShellPath,
      argsPrefix: [],
      source: 'login-shell',
      globalInstallDetected: Boolean(options.globalPackageRoot),
    }
  }

  return {
    cmd: 'clawprobe',
    argsPrefix: [],
    source: 'bare',
    globalInstallDetected: Boolean(options.globalPackageRoot),
  }
}

function resolveClawprobeCommand(): ClawprobeCommandResolution {
  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    const distro = requireSelectedWslDistroSync(runtimeSelection)
    return {
      cmd: 'wsl.exe',
      argsPrefix: ['-d', distro, '--', resolveCommandInWslSync(distro, 'clawprobe') ?? 'clawprobe'],
      source: 'bare',
      globalInstallDetected: false,
    }
  }

  return resolveClawprobeCommandForTest({
    localPackageRoot: getClawprobePackageRoot(),
    globalPackageRoot: getGlobalClawprobePackageRoot(),
    loginShellPath: resolveBareClawprobeInLoginShell(),
    processExecPath: process.execPath,
  })
}

function isClawprobeUnavailableFailure(
  error: NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
): boolean {
  if (error.code === 'ENOENT') {
    return true
  }
  const combined = [
    error.message,
    error.stdout ? String(error.stdout) : '',
    error.stderr ? String(error.stderr) : '',
  ]
    .join('\n')
    .trim()
  return /command not found|cannot find module|not recognized as an internal or external command|spawn .* ENOENT/i.test(
    combined
  )
}

function getUnavailableReason(
  resolution: ClawprobeCommandResolution,
  error: NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer; code?: string | number }
): ClawprobeUnavailableReason {
  if (resolution.globalInstallDetected) {
    return 'not-visible'
  }
  const combined = [
    error.message,
    error.stdout ? String(error.stdout) : '',
    error.stderr ? String(error.stderr) : '',
  ]
    .join('\n')
    .trim()
  if (/not available in path|command not found|spawn .* ENOENT/i.test(combined)) {
    return 'not-visible'
  }
  return 'not-installed'
}

function isClawprobeJsonError(v: unknown): v is { ok: false; error?: string; message?: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'ok' in v &&
    (v as { ok: unknown }).ok === false
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw?.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return isObjectRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function buildClawprobeConfigOverrideForTest(
  baseConfig: Record<string, unknown>,
  customPrices: Record<string, ClawprobeCustomPrice>
): Record<string, unknown> {
  const currentCost = isObjectRecord(baseConfig.cost) ? baseConfig.cost : {}
  const currentPrices = isObjectRecord(currentCost.customPrices) ? currentCost.customPrices : {}
  return {
    ...baseConfig,
    cost: {
      ...currentCost,
      customPrices: {
        ...customPrices,
        ...currentPrices,
      },
    },
  }
}

export function buildClawprobeHomeOverrideEnvForTest(
  homeDir: string,
  openclawDir: string,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    HOME: homeDir,
    OPENCLAW_DIR: openclawDir,
  }
  if (process.platform === 'win32') {
    env.USERPROFILE = homeDir
  }
  return env
}

export function mirrorClawprobeFilesForOverrideForTest(
  sourceProbeDir: string,
  targetProbeDir: string
): void {
  if (!fs.existsSync(sourceProbeDir)) {
    return
  }
  for (const entry of fs.readdirSync(sourceProbeDir)) {
    if (entry === 'config.json') {
      continue
    }
    const sourcePath = path.join(sourceProbeDir, entry)
    const targetPath = path.join(targetProbeDir, entry)
    const stat = fs.statSync(sourcePath)
    if (stat.isFile()) {
      try {
        fs.linkSync(sourcePath, targetPath)
      } catch {
        fs.copyFileSync(sourcePath, targetPath)
      }
      continue
    }
    fs.mkdirSync(targetPath, { recursive: true })
    mirrorClawprobeFilesForOverrideForTest(sourcePath, targetPath)
  }
}

export function withTempHomeDirForOverride<T>(callback: (tempHome: string) => T): T {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-clawprobe-home-'))
  try {
    return callback(tempHome)
  } catch (error) {
    fs.rmSync(tempHome, { recursive: true, force: true })
    throw error
  }
}

function prepareLocalClawprobeExecution(
  customPrices: Record<string, ClawprobeCustomPrice>
): PreparedClawprobeExecution {
  return withTempHomeDirForOverride((tempHome) => {
    const realProbeDir = path.join(os.homedir(), '.clawprobe')
    const tempProbeDir = path.join(tempHome, '.clawprobe')
    fs.mkdirSync(tempProbeDir, { recursive: true })
    mirrorClawprobeFilesForOverrideForTest(realProbeDir, tempProbeDir)

    const baseConfig =
      readJsonObject(
        fs.existsSync(path.join(realProbeDir, 'config.json'))
          ? fs.readFileSync(path.join(realProbeDir, 'config.json'), 'utf8')
          : null
      ) ?? {}
    const mergedConfig = buildClawprobeConfigOverrideForTest(baseConfig, customPrices)
    fs.writeFileSync(
      path.join(tempProbeDir, 'config.json'),
      `${JSON.stringify(mergedConfig, null, 2)}\n`,
      'utf8'
    )

    return {
      env: buildClawprobeHomeOverrideEnvForTest(tempHome, getOpenclawDataDir()),
      cleanup: () => {
        fs.rmSync(tempHome, { recursive: true, force: true })
      },
    }
  })
}

export function buildWslClawprobeCommandScriptForTest(
  tempHome: string,
  openclawDir: string,
  clawprobePath: string,
  args: string[],
): string {
  return [
    `HOME=${shellEscapePosixArg(tempHome)}`,
    `OPENCLAW_DIR=${shellEscapePosixArg(openclawDir)}`,
    [clawprobePath, ...args].map((value) => shellEscapePosixArg(value)).join(' '),
  ].join(' ')
}

async function prepareWslClawprobeExecution(
  args: string[],
  customPrices: Record<string, ClawprobeCustomPrice>
): Promise<PreparedClawprobeExecution> {
  const runtimeSelection = getClawmasterRuntimeSelection()
  const distro = requireSelectedWslDistroSync(runtimeSelection)
  const homeDir = getWslHomeDirSync(distro)
  const realProbeDir = path.posix.join(homeDir, '.clawprobe')
  const tempHomeResult = runWslShellSync(distro, 'mktemp -d /tmp/clawmaster-clawprobe-home-XXXXXX')
  if (tempHomeResult.code !== 0 || !tempHomeResult.stdout.trim()) {
    throw new Error(tempHomeResult.stderr || 'Failed to create temporary clawprobe HOME in WSL')
  }

  const tempHome = tempHomeResult.stdout.trim()
  try {
    const tempProbeDir = path.posix.join(tempHome, '.clawprobe')
    const mirrorScript = [
      `mkdir -p ${shellEscapePosixArg(tempProbeDir)}`,
      `if [ -d ${shellEscapePosixArg(realProbeDir)} ]; then cp -al ${shellEscapePosixArg(`${realProbeDir}/.`)} ${shellEscapePosixArg(`${tempProbeDir}/`)} 2>/dev/null || cp -a ${shellEscapePosixArg(`${realProbeDir}/.`)} ${shellEscapePosixArg(`${tempProbeDir}/`)}; fi`,
      `rm -f ${shellEscapePosixArg(path.posix.join(tempProbeDir, 'config.json'))}`,
    ].join(' && ')
    const mirrorResult = runWslShellSync(distro, mirrorScript)
    if (mirrorResult.code !== 0) {
      throw new Error(mirrorResult.stderr || 'Failed to mirror clawprobe files in WSL')
    }

    const baseConfig =
      readJsonObject(readTextFileInWslSync(distro, path.posix.join(realProbeDir, 'config.json'))) ?? {}
    const mergedConfig = buildClawprobeConfigOverrideForTest(baseConfig, customPrices)
    writeTextFileInWslSync(
      distro,
      path.posix.join(tempProbeDir, 'config.json'),
      `${JSON.stringify(mergedConfig, null, 2)}\n`
    )

    const clawprobePath = resolveCommandInWslSync(distro, 'clawprobe') ?? 'clawprobe'
    const commandScript = buildWslClawprobeCommandScriptForTest(
      tempHome,
      getOpenclawDataDir(),
      clawprobePath,
      args,
    )

    return {
      cmd: 'wsl.exe',
      args: ['-d', distro, '--', 'bash', '-lc', commandScript],
      env: process.env,
      cleanup: async () => {
        await runWslShell(distro, `rm -rf ${shellEscapePosixArg(tempHome)}`)
      },
    }
  } catch (error) {
    await runWslShell(distro, `rm -rf ${shellEscapePosixArg(tempHome)}`)
    throw error
  }
}

async function prepareClawprobeExecution(
  args: string[],
  options: ClawprobeExecutionOptions
): Promise<PreparedClawprobeExecution | null> {
  if (!options.useModelsDevPricing) {
    return null
  }

  const customPrices = readFreshModelsDevCustomPrices()
  if (!customPrices || Object.keys(customPrices).length === 0) {
    return null
  }

  const runtimeSelection = getClawmasterRuntimeSelection()
  if (shouldUseWslRuntime(runtimeSelection)) {
    return prepareWslClawprobeExecution(args, customPrices)
  }
  return prepareLocalClawprobeExecution(customPrices)
}

export async function runClawprobeJson(
  args: string[],
  options: ClawprobeExecutionOptions = {}
): Promise<unknown> {
  const resolution = resolveClawprobeCommand()
  let cmd = resolution.cmd
  let cmdArgs = [...resolution.argsPrefix, ...args]
  let env = process.env
  let cleanup: PreparedClawprobeExecution['cleanup']

  const prepared = await prepareClawprobeExecution(args, options)
  if (prepared) {
    cmd = prepared.cmd ?? cmd
    cmdArgs = prepared.args ?? cmdArgs
    env = prepared.env ?? env
    cleanup = prepared.cleanup
  }

  let stdout = ''
  let stderr = ''
  let exitCode = 0
  try {
    const out = await execFileAsync(cmd, cmdArgs, {
      maxBuffer: 20 * 1024 * 1024,
      env,
      shell: process.platform === 'win32',
    })
    stdout = String(out.stdout ?? '').trim()
    stderr = String(out.stderr ?? '').trim()
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: Buffer
      stderr?: Buffer
      code?: string | number
    }
    if (isClawprobeUnavailableFailure(err)) {
      throw new ClawprobeUnavailableError(getUnavailableReason(resolution, err))
    }
    stdout = err.stdout ? String(err.stdout).trim() : ''
    stderr = err.stderr ? String(err.stderr).trim() : ''
    exitCode = typeof err.code === 'number' ? err.code : 1
  } finally {
    await cleanup?.()
  }

  if (!stdout && exitCode !== 0) {
    throw new Error(stderr || `clawprobe exited with code ${exitCode}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout || '{}')
  } catch {
    throw new Error(
      stderr || stdout.slice(0, 400) || `clawprobe: expected JSON on stdout (exit ${exitCode})`
    )
  }

  if (isClawprobeJsonError(parsed)) {
    throw new Error(parsed.message ?? parsed.error ?? 'clawprobe failed')
  }

  if (exitCode !== 0) {
    throw new Error(stderr || `clawprobe exited with code ${exitCode}`)
  }

  return parsed
}

export async function runClawprobeCommand(
  args: string[],
  options: ClawprobeExecutionOptions = {}
): Promise<ClawprobeCommandOutput> {
  let resolution: ClawprobeCommandResolution
  try {
    resolution = resolveClawprobeCommand()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === getWslRuntimeUnavailableMessage()) {
      return {
        ok: false,
        code: 1,
        stdout: '',
        stderr: error.message,
      }
    }
    throw error
  }

  let cmd = resolution.cmd
  let cmdArgs = [...resolution.argsPrefix, ...args]
  let env = process.env
  let cleanup: PreparedClawprobeExecution['cleanup']

  try {
    const prepared = await prepareClawprobeExecution(args, options)
    if (prepared) {
      cmd = prepared.cmd ?? cmd
      cmdArgs = prepared.args ?? cmdArgs
      env = prepared.env ?? env
      cleanup = prepared.cleanup
    }
  } catch (error: unknown) {
    return {
      ok: false,
      code: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }
  }

  try {
    const out = await execFileAsync(cmd, cmdArgs, {
      maxBuffer: 20 * 1024 * 1024,
      env,
      shell: process.platform === 'win32',
    })
    return {
      ok: true,
      code: 0,
      stdout: String(out.stdout ?? '').trim(),
      stderr: String(out.stderr ?? '').trim(),
    }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: Buffer
      stderr?: Buffer
      code?: string | number
    }
    if (isClawprobeUnavailableFailure(err)) {
      const reason = getUnavailableReason(resolution, err)
      return {
        ok: false,
        code: 127,
        stdout: '',
        stderr:
          reason === 'not-visible'
            ? 'ClawProbe appears to be installed, but the backend cannot resolve its executable path'
            : 'ClawProbe is not installed',
      }
    }
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ? String(err.stdout).trim() : '',
      stderr: err.stderr ? String(err.stderr).trim() : '',
    }
  } finally {
    await cleanup?.()
  }
}
