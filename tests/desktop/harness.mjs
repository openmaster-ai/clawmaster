import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { access, chmod, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { Builder, By, Capabilities, Key, until } from 'selenium-webdriver'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const repoRoot = path.resolve(__dirname, '../..')

const TAURI_DRIVER_PORT = 4444
const BUILD_TIMEOUT_MS = 10 * 60_000
const APP_READY_TIMEOUT_MS = 45_000
const MAC_LAUNCH_SMOKE_MS = 5_000
const CLEANUP_TIMEOUT_MS = 10_000
const NAVIGATION_TIMEOUT_MS = 15_000
const WEBDRIVER_SESSION_RETRY_DELAY_MS = 1_500
const WEBDRIVER_SESSION_MAX_ATTEMPTS = 3
const CAPABILITIES_TITLE_PATTERN = /(Capability Center|Assistant Capabilities|能力中心|助手能力|機能センター|アシスタント機能)/
const RETRYABLE_WEBDRIVER_SESSION_ERROR_PATTERNS = [
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /socket hang up/i,
  /Connection refused/i,
]
const ARTIFACT_DIR = process.env.CLAWMASTER_DESKTOP_ARTIFACT_DIR
  ? path.resolve(process.env.CLAWMASTER_DESKTOP_ARTIFACT_DIR)
  : path.join(os.tmpdir(), 'clawmaster-desktop-artifacts')
const OPENCLAW_BOOTSTRAP_DIR = process.env.CLAWMASTER_DESKTOP_OPENCLAW_BOOTSTRAP_DIR
  ? path.resolve(process.env.CLAWMASTER_DESKTOP_OPENCLAW_BOOTSTRAP_DIR)
  : path.join(os.tmpdir(), 'clawmaster-desktop-openclaw-bootstrap')
const SEEDED_OPENCLAW_CONFIG = {
  models: {
    providers: {
      desktopSmoke: {
        apiKey: 'desktop-smoke-token',
        baseUrl: 'http://127.0.0.1:11434/v1',
        models: [
          {
            id: 'desktop-smoke-model',
            name: 'Desktop Smoke Model',
          },
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: {
        primary: 'desktopSmoke/desktop-smoke-model',
      },
    },
    list: [
      {
        id: 'desktop-smoke',
        name: 'Desktop Smoke',
        model: 'desktopSmoke/desktop-smoke-model',
      },
    ],
  },
}

function resolveCommand(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function resolveCargoBinary(name) {
  const extension = process.platform === 'win32' ? '.exe' : ''
  return path.join(os.homedir(), '.cargo', 'bin', `${name}${extension}`)
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function ensureArtifactDir() {
  await mkdir(ARTIFACT_DIR, { recursive: true })
  return ARTIFACT_DIR
}

function readCommandOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && /\.cmd$/i.test(command),
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
        return
      }
      reject(new Error(stderr.trim() || `${command} ${args.join(' ')} failed with ${code}`))
    })
  })
}

async function findFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  return null
}

async function resolveOpenclawEntrypointFromPrefix(prefix) {
  if (!prefix) {
    return null
  }
  const candidates = process.platform === 'win32'
    ? [path.join(prefix, 'node_modules', 'openclaw', 'openclaw.mjs')]
    : [
        path.join(prefix, 'lib', 'node_modules', 'openclaw', 'openclaw.mjs'),
        path.join(prefix, 'node_modules', 'openclaw', 'openclaw.mjs'),
      ]
  return findFirstExistingPath(candidates)
}

async function resolveOpenclawEntrypoint() {
  const diagnostics = {}

  try {
    const npmRoot = await readCommandOutput(resolveCommand('npm'), ['root', '-g'])
    diagnostics.npmRoot = npmRoot
    const fromRoot = await findFirstExistingPath([path.join(npmRoot, 'openclaw', 'openclaw.mjs')])
    if (fromRoot) {
      return {
        entrypoint: fromRoot,
        diagnostics: { ...diagnostics, strategy: 'npm-root' },
      }
    }
  } catch (error) {
    diagnostics.npmRootError = String(error)
  }

  try {
    const prefix = await readCommandOutput(resolveCommand('npm'), ['config', 'get', 'prefix'])
    diagnostics.npmPrefix = prefix
    const fromPrefix = await resolveOpenclawEntrypointFromPrefix(prefix)
    if (fromPrefix) {
      return {
        entrypoint: fromPrefix,
        diagnostics: { ...diagnostics, strategy: 'npm-prefix' },
      }
    }
  } catch (error) {
    diagnostics.npmPrefixError = String(error)
  }

  try {
    const nativeOpenclaw = await readCommandOutput(resolveCommand('openclaw'), ['--version'])
    diagnostics.nativeVersion = nativeOpenclaw
  } catch {
    // ignore
  }

  const bootstrapDir = OPENCLAW_BOOTSTRAP_DIR
  const bootstrapEntrypoint = path.join(bootstrapDir, 'node_modules', 'openclaw', 'openclaw.mjs')
  if (await pathExists(bootstrapEntrypoint)) {
    return {
      entrypoint: bootstrapEntrypoint,
      diagnostics: { ...diagnostics, strategy: 'bootstrap-cache', bootstrapDir },
    }
  }

  await rm(bootstrapDir, { recursive: true, force: true })
  await mkdir(bootstrapDir, { recursive: true })
  await runCommand(resolveCommand('npm'), ['install', '--prefix', bootstrapDir, 'openclaw@2026.4.11'], {
    timeout: 5 * 60_000,
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
    },
  })

  if (await pathExists(bootstrapEntrypoint)) {
    return {
      entrypoint: bootstrapEntrypoint,
      diagnostics: { ...diagnostics, strategy: 'bootstrap-install', bootstrapDir },
    }
  }

  return {
    entrypoint: null,
    diagnostics: {
      ...diagnostics,
      strategy: 'missing',
      bootstrapDir,
      bootstrapEntrypoint,
    },
  }
}

async function writeOpenclawShim(targetPath, entrypoint) {
  await mkdir(path.dirname(targetPath), { recursive: true })
  if (process.platform === 'win32') {
    await writeFile(
      targetPath,
      `@echo off\r\nnode "${entrypoint}" %*\r\n`,
      'utf8',
    )
    return
  }

  await writeFile(
    targetPath,
    `#!/usr/bin/env sh\nnode "${entrypoint}" "$@"\n`,
    'utf8',
  )
  await chmod(targetPath, 0o755)
}

async function installStableOpenclawShims(entrypoint) {
  const shimPaths = []

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    const stableShim = path.join(appData, 'npm', 'openclaw.cmd')
    await writeOpenclawShim(stableShim, entrypoint)
    shimPaths.push(stableShim)
    return shimPaths
  }

  for (const dir of [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), 'bin')]) {
    const stableShim = path.join(dir, 'openclaw')
    await writeOpenclawShim(stableShim, entrypoint)
    shimPaths.push(stableShim)
  }

  return shimPaths
}

async function ensureOpenclawShim() {
  try {
    const existing = await readCommandOutput(resolveCommand('openclaw'), ['--version'])
    return { strategy: 'native', version: existing }
  } catch {
    // continue to shim fallback
  }

  const resolution = await resolveOpenclawEntrypoint()
  if (!resolution.entrypoint) {
    return resolution.diagnostics
  }
  const entrypoint = resolution.entrypoint

  const shimDir = path.join(await ensureArtifactDir(), 'bin')
  await mkdir(shimDir, { recursive: true })
  const shimPath = path.join(shimDir, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
  await writeOpenclawShim(shimPath, entrypoint)
  const stableShimPaths = await installStableOpenclawShims(entrypoint)

  const pathEntries = [
    ...new Set([
      shimDir,
      ...stableShimPaths.map((item) => path.dirname(item)),
      process.env.PATH ?? '',
    ].filter(Boolean)),
  ]
  process.env.PATH = pathEntries.join(path.delimiter)
  process.env.CLAWMASTER_OPENCLAW_BIN = shimPath

  const version = await readCommandOutput(resolveCommand('openclaw'), ['--version'])
  return {
    ...resolution.diagnostics,
    strategy: 'shim',
    entrypoint,
    shimDir,
    shimPath,
    stableShimPaths,
    resolvedEntrypoint: await realpath(entrypoint).catch(() => entrypoint),
    version,
  }
}

async function seedDesktopSmokeProfile() {
  if (process.env.CLAWMASTER_DESKTOP_SEED_PROFILE !== '1') {
    return {
      restore: async () => {},
      info: null,
    }
  }

  const configDir = path.join(os.homedir(), '.openclaw')
  const configPath = path.join(configDir, 'openclaw.json')
  const hadExistingConfig = await pathExists(configPath)
  const existingConfig = hadExistingConfig ? await readFile(configPath, 'utf8') : null

  await mkdir(configDir, { recursive: true })
  await writeFile(`${configPath}.desktop-smoke-backup`, existingConfig ?? '', 'utf8')
  await writeFile(`${configPath}`, `${JSON.stringify(SEEDED_OPENCLAW_CONFIG, null, 2)}\n`, 'utf8')

  return {
    info: {
      enabled: true,
      homeDir: os.homedir(),
      configDir,
      configPath,
      hadExistingConfig,
      seededConfigPreview: JSON.stringify(SEEDED_OPENCLAW_CONFIG).slice(0, 500),
    },
    restore: async () => {
      if (hadExistingConfig && existingConfig !== null) {
        await writeFile(configPath, existingConfig, 'utf8')
      } else {
        await rm(configPath, { force: true })
      }
      await rm(`${configPath}.desktop-smoke-backup`, { force: true })
    },
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeout
    const commandRequiresShell = process.platform === 'win32' && /\.cmd$/i.test(command)
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: commandRequiresShell,
      ...options,
    })

    let timeoutHandle
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`))
    })
  })
}

function waitForPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    function attempt() {
      const socket = net.createConnection({ host: '127.0.0.1', port })

      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })

      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`))
          return
        }

        setTimeout(attempt, 250)
      })
    }

    attempt()
  })
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function normalizeProcessMatchPath(targetPath) {
  return process.platform === 'win32'
    ? path.normalize(targetPath).toLowerCase()
    : targetPath
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function collectNewProcessIds(previousPids, currentPids) {
  const knownPids = new Set(previousPids)
  return currentPids.filter((pid) => !knownPids.has(pid))
}

export function isRetryableWebdriverSessionError(error) {
  const details = error instanceof Error
    ? [error.message, error.stack].filter(Boolean).join('\n')
    : String(error)
  return RETRYABLE_WEBDRIVER_SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(details))
}

export async function buildWebdriverSessionWithRetry(options) {
  const {
    build,
    reset,
    onRetry,
    maxAttempts = WEBDRIVER_SESSION_MAX_ATTEMPTS,
    retryDelayMs = WEBDRIVER_SESSION_RETRY_DELAY_MS,
  } = options

  assert.equal(typeof build, 'function', 'buildWebdriverSessionWithRetry requires a build function')

  let attempt = 0
  let lastError

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      return await build()
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts || !isRetryableWebdriverSessionError(error)) {
        throw error
      }

      await onRetry?.({
        attempt,
        maxAttempts,
        delayMs: retryDelayMs,
        error,
      })
      await reset?.({
        attempt,
        maxAttempts,
        error,
      })
      await sleep(retryDelayMs)
    }
  }

  throw lastError
}

async function listDesktopAppProcessIds(binaryPath) {
  const normalizedBinaryPath = normalizeProcessMatchPath(binaryPath)

  if (process.platform === 'win32') {
    const output = await readCommandOutput('pwsh', [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      [
        `$target = ${quotePowerShellLiteral(normalizedBinaryPath)}`,
        'Get-CimInstance Win32_Process |',
        'Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLowerInvariant() -eq $target } |',
        'ForEach-Object { $_.ProcessId }',
      ].join(' '),
    ]).catch(() => '')

    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0)
      .sort((left, right) => left - right)
  }

  const output = await readCommandOutput('ps', ['-ax', '-o', 'pid=', '-o', 'command=']).catch(() => '')
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter(Boolean)
    .filter((match) => {
      const command = match[2].trim()
      return command === binaryPath || command.startsWith(`${binaryPath} `)
    })
    .map((match) => Number.parseInt(match[1], 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
    .sort((left, right) => left - right)
}

async function terminateProcessId(pid, options = {}) {
  const { force = false } = options

  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T']
    if (force) {
      args.push('/F')
    }
    await readCommandOutput('taskkill', args).catch((error) => {
      const details = error instanceof Error ? error.message : String(error)
      if (!/not found|no running instance|cannot find/i.test(details)) {
        throw error
      }
    })
    return
  }

  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error
    }
  }
}

async function cleanupRetriedDesktopAppProcesses(binaryPath, previousPids) {
  const currentPids = await listDesktopAppProcessIds(binaryPath)
  const launchedPids = collectNewProcessIds(previousPids, currentPids)

  if (launchedPids.length === 0) {
    return { terminatedPids: [], survivingPids: [] }
  }

  for (const pid of launchedPids) {
    await terminateProcessId(pid)
  }

  await sleep(500)

  let survivingPids = collectNewProcessIds(previousPids, await listDesktopAppProcessIds(binaryPath))
  for (const pid of survivingPids) {
    await terminateProcessId(pid, { force: true })
  }

  await sleep(500)
  survivingPids = collectNewProcessIds(previousPids, await listDesktopAppProcessIds(binaryPath))

  if (survivingPids.length > 0) {
    throw new Error(
      `Failed to terminate retried desktop app process(es): ${survivingPids.join(', ')}`,
    )
  }

  return {
    terminatedPids: launchedPids,
    survivingPids,
  }
}

async function ensureDesktopBinary() {
  if (process.env.CLAWMASTER_DESKTOP_SKIP_BUILD === '1' && await pathExists(getDesktopBinaryPath())) {
    return getDesktopBinaryPath()
  }

  await runCommand(resolveCommand('npx'), ['tauri', 'build', '--debug', '--no-bundle'], {
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
    },
    timeout: BUILD_TIMEOUT_MS,
  })

  const binaryPath = getDesktopBinaryPath()
  assert.ok(await pathExists(binaryPath), `Desktop binary not found at ${binaryPath}`)
  return binaryPath
}

export function getDesktopBinaryPath() {
  const extension = process.platform === 'win32' ? '.exe' : ''
  return path.join(repoRoot, 'src-tauri', 'target', 'debug', `app${extension}`)
}

function getSmokeMode() {
  const forced = process.env.CLAWMASTER_DESKTOP_SMOKE_MODE
  if (forced === 'webdriver' || forced === 'launch') {
    return forced
  }

  return process.platform === 'darwin' ? 'launch' : 'webdriver'
}

async function terminateChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return

  child.kill(signal)

  await new Promise((resolve) => {
    const handle = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
      }
      resolve()
    }, 3_000)

    child.once('exit', () => {
      clearTimeout(handle)
      resolve()
    })
  })
}

async function settleWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve()
    }, timeoutMs)

    Promise.resolve(promise)
      .catch(() => {})
      .finally(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      })
  })
}

async function runLaunchSmoke(binaryPath) {
  const stdout = []
  const stderr = []
  const child = spawn(binaryPath, [], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (chunk) => stdout.push(String(chunk)))
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))

  try {
    await new Promise((resolve, reject) => {
      const earlyExit = (code, signal) => {
        reject(new Error(`Desktop app exited early during launch smoke with ${signal ?? code}`))
      }

      child.once('exit', earlyExit)
      setTimeout(() => {
        child.off('exit', earlyExit)
        resolve()
      }, MAC_LAUNCH_SMOKE_MS)
    })

    return {
      mode: 'launch',
      details: `desktop app stayed alive for ${MAC_LAUNCH_SMOKE_MS}ms`,
      stdout: stdout.join(''),
      stderr: stderr.join(''),
    }
  } catch (error) {
    await persistTextArtifacts('desktop-launch-failure', {
      mode: 'launch',
      error: error instanceof Error ? error.message : String(error),
      stdout: stdout.join(''),
      stderr: stderr.join(''),
    })
    throw error
  } finally {
    await persistTextArtifacts('desktop-launch-smoke', {
      mode: 'launch',
      stdout: stdout.join(''),
      stderr: stderr.join(''),
    })
    await terminateChild(child)
  }
}

async function startTauriDriver() {
  const binary = resolveCargoBinary('tauri-driver')
  assert.ok(
    await pathExists(binary),
    `tauri-driver was not found at ${binary}. Install it with \`cargo install tauri-driver --locked\`.`,
  )

  const child = spawn(binary, [], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk)
    process.stdout.write(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
    process.stderr.write(chunk)
  })

  try {
    await waitForPort(TAURI_DRIVER_PORT, 15_000)
    return {
      child,
      getLogs() {
        return { stdout, stderr }
      },
    }
  } catch (error) {
    await terminateChild(child)
    throw error
  }
}

async function runWebdriverSmoke(binaryPath) {
  const tauriDriverAttempts = []
  let tauriDriver = await startTauriDriver()
  let driver
  let currentStep = 'starting webdriver session'
  let desktopAppPidsBeforeAttempt = []

  const setStep = (step) => {
    currentStep = step
    console.log(`[desktop-smoke] step=${step}`)
  }

  const flushTauriDriverLogs = (driverHandle = tauriDriver) => {
    if (!driverHandle) {
      return
    }
    tauriDriverAttempts.push(driverHandle.getLogs())
  }

  const getCombinedTauriDriverLogs = (includeCurrent = false) => {
    const entries = includeCurrent && tauriDriver
      ? [...tauriDriverAttempts, tauriDriver.getLogs()]
      : tauriDriverAttempts

    return {
      stdout: entries
        .map((entry, index) => `--- tauri-driver attempt ${index + 1} stdout ---\n${entry.stdout ?? ''}`)
        .join('\n'),
      stderr: entries
        .map((entry, index) => `--- tauri-driver attempt ${index + 1} stderr ---\n${entry.stderr ?? ''}`)
        .join('\n'),
    }
  }

  try {
    setStep('building webdriver capabilities')
    const capabilities = new Capabilities()
    capabilities.setBrowserName('wry')
    capabilities.set('tauri:options', { application: binaryPath })

    setStep('connecting webdriver session')
    driver = await buildWebdriverSessionWithRetry({
      async build() {
        desktopAppPidsBeforeAttempt = await listDesktopAppProcessIds(binaryPath)
        return new Builder()
          .usingServer(`http://127.0.0.1:${TAURI_DRIVER_PORT}`)
          .withCapabilities(capabilities)
          .build()
      },
      async reset() {
        const appCleanup = await cleanupRetriedDesktopAppProcesses(
          binaryPath,
          desktopAppPidsBeforeAttempt,
        )
        if (appCleanup.terminatedPids.length > 0) {
          console.warn(
            `[desktop-smoke] terminated retried desktop app process(es): ${appCleanup.terminatedPids.join(', ')}`,
          )
        }
        const previousTauriDriver = tauriDriver
        flushTauriDriverLogs(previousTauriDriver)
        tauriDriver = null
        await settleWithin(terminateChild(previousTauriDriver.child), CLEANUP_TIMEOUT_MS)
        tauriDriver = await startTauriDriver()
      },
      async onRetry({ attempt, maxAttempts, delayMs, error }) {
        const details = error instanceof Error ? error.message : String(error)
        setStep(`retrying webdriver session ${attempt + 1}/${maxAttempts}`)
        console.warn(
          `[desktop-smoke] webdriver session attempt ${attempt}/${maxAttempts} failed with retryable bootstrap error: ${details}. Retrying in ${delayMs}ms.`,
        )
      },
    })

    setStep('waiting for initial shell')
    await driver.wait(
      until.elementLocated(By.css('.app-shell, .fullscreen-shell')),
      APP_READY_TIMEOUT_MS,
    )

    const body = await driver.findElement(By.css('body')).getText()
    assert.match(body, /(ClawMaster|龙虾管理大师)/)

    const appShell = await driver.findElements(By.css('.app-shell'))
    if (appShell.length > 0) {
      setStep('dismissing command shortcut hint')
      await dismissCommandPaletteHintIfPresent(driver)
      setStep('opening settings from palette')
      await runPaletteNavigation(driver, {
        query: 'settings',
        expectedPath: '/settings',
        expectedTitle: /(Settings|设置|設定)/,
      })
      setStep('jumping to settings profile section')
      await runPaletteNavigation(driver, {
        query: 'profile',
        expectedPath: '/settings',
        expectedHash: '#settings-profile',
        expectedTitle: /(Settings|设置|設定)/,
        expectedAnchorId: 'settings-profile',
      })
      setStep('verifying desktop local data controls')
      await verifyDesktopSettingsSurface(driver)
      setStep('verifying danger confirmation dialog')
      await verifyDangerZoneConfirmation(driver)
      setStep('opening capability runtime from palette')
      await runPaletteNavigation(driver, {
        query: 'verify',
        expectedPath: '/capabilities',
        expectedHash: '#capability-runtime',
        expectedTitle: CAPABILITIES_TITLE_PATTERN,
        expectedAnchorId: 'capability-runtime',
      })
      setStep('opening gateway from sidebar')
      await clickSidebarLink(driver, '/gateway')
      await waitForLocation(driver, '/gateway')
      await driver.wait(until.elementLocated(By.id('gateway-runtime')), NAVIGATION_TIMEOUT_MS)

      const titleText = await readPageTitle(driver)
      assert.match(titleText, /(Gateway|网关|ゲートウェイ)/)
      await captureDriverArtifacts(driver, 'desktop-shell-validated', {
        mode: 'webdriver',
        page: 'gateway',
        title: titleText,
      })

      return {
        mode: 'webdriver',
        details: `validated desktop shell navigation, desktop settings, and danger gating (${titleText})`,
        logs: getCombinedTauriDriverLogs(true),
      }
    }

    const startupCopy = await driver.findElement(By.css('.fullscreen-shell')).getText()
    const startupDiagnostics = await collectWindowDiagnostics(driver)
    setStep('attempting setup wizard continuation')
    const resumedFromSetup = await tryContinueFromSetupWizard(driver)
    if (resumedFromSetup) {
      await driver.wait(until.elementLocated(By.css('.app-shell')), NAVIGATION_TIMEOUT_MS)
      setStep('dismissing command shortcut hint after setup continuation')
      await dismissCommandPaletteHintIfPresent(driver)
      const resumedLocation = await readLocation(driver)
      if (resumedLocation.pathname !== '/settings') {
        setStep('opening settings from sidebar after setup continuation')
        await clickSidebarLink(driver, '/settings')
        await waitForLocation(driver, '/settings')
      } else {
        setStep('using settings page opened by setup continuation')
      }
      setStep('jumping to settings profile section after setup continuation')
      await runPaletteNavigation(driver, {
        query: 'profile',
        expectedPath: '/settings',
        expectedHash: '#settings-profile',
        expectedTitle: /(Settings|设置|設定)/,
      })
      setStep('verifying desktop local data controls after setup continuation')
      await verifyDesktopSettingsSurface(driver)
      setStep('verifying danger confirmation dialog after setup continuation')
      await verifyDangerZoneConfirmation(driver)
      setStep('opening capability runtime from palette after setup continuation')
      await runPaletteNavigation(driver, {
        query: 'verify',
        expectedPath: '/capabilities',
        expectedHash: '#capability-runtime',
        expectedTitle: CAPABILITIES_TITLE_PATTERN,
        expectedAnchorId: 'capability-runtime',
      })
      setStep('opening gateway from sidebar after setup continuation')
      await clickSidebarLink(driver, '/gateway')
      await waitForLocation(driver, '/gateway')
      await driver.wait(until.elementLocated(By.id('gateway-runtime')), NAVIGATION_TIMEOUT_MS)

      const titleText = await readPageTitle(driver)
      assert.match(titleText, /(Gateway|网关|ゲートウェイ)/)
      await captureDriverArtifacts(driver, 'desktop-shell-validated', {
        mode: 'webdriver',
        page: 'gateway',
        resumedFromSetup: true,
        title: titleText,
      })

      return {
        mode: 'webdriver',
        details: `continued from setup wizard into desktop shell and validated settings gating (${titleText})`,
        logs: getCombinedTauriDriverLogs(true),
      }
    }

    assert.match(
      startupCopy,
      /(ClawMaster|OpenClaw|检测|Detect|Install|安装|Take over|接管)/,
    )
    await captureDriverArtifacts(driver, 'desktop-startup-shell', {
      mode: 'webdriver',
      page: 'startup',
      startupCopy,
      diagnostics: startupDiagnostics,
    })

    return {
      mode: 'webdriver',
      details: 'reached desktop startup shell on a clean runtime',
      logs: getCombinedTauriDriverLogs(true),
    }
  } catch (error) {
    if (driver) {
      const diagnostics = await collectWindowDiagnostics(driver).catch((diagnosticError) => ({
        error: String(diagnosticError),
      }))
      await captureDriverArtifacts(driver, 'desktop-smoke-failure', {
        mode: 'webdriver',
        step: currentStep,
        error: error instanceof Error ? error.message : String(error),
        diagnostics,
      })
    }
    await persistDriverLogs(getCombinedTauriDriverLogs(true), 'desktop-smoke-failure')
    throw error
  } finally {
    if (driver) {
      await settleWithin(driver.quit(), CLEANUP_TIMEOUT_MS)
    }
    if (tauriDriver) {
      await settleWithin(terminateChild(tauriDriver.child), CLEANUP_TIMEOUT_MS)
    }
  }
}

async function openCommandPalette(driver) {
  await driver.findElement(By.css('.app-command-trigger')).click()
  const panel = await driver.wait(
    until.elementLocated(By.css('.command-palette-panel')),
    NAVIGATION_TIMEOUT_MS,
  )
  const input = await panel.findElement(By.css('.command-palette-input'))
  return { panel, input }
}

function getPaletteTargetSelector(expectedPath, expectedHash) {
  const normalizedHash = expectedHash ? expectedHash.replace(/^#/, '') : ''
  return `.command-palette-item[data-command-path="${expectedPath}"][data-command-hash="${normalizedHash}"]`
}

async function waitForLocation(driver, expectedPath, expectedHash) {
  await driver.wait(async () => {
    const location = await readLocation(driver)
    return location.pathname === expectedPath && (expectedHash == null || location.hash === expectedHash)
  }, NAVIGATION_TIMEOUT_MS)
}

async function readLocation(driver) {
  return driver.executeScript(() => ({
    pathname: window.location.pathname,
    hash: window.location.hash,
  }))
}

async function readPageTitle(driver) {
  const selectors = ['.app-topbar-title', 'h1.page-title', '.fullscreen-shell h1']

  await driver.wait(async () => {
    for (const selector of selectors) {
      const elements = await driver.findElements(By.css(selector))
      for (const element of elements) {
        if ((await element.getText()).trim().length > 0) {
          return true
        }
      }
    }
    return false
  }, NAVIGATION_TIMEOUT_MS)

  for (const selector of selectors) {
    const elements = await driver.findElements(By.css(selector))
    for (const element of elements) {
      const text = (await element.getText()).trim()
      if (text.length > 0) {
        return text
      }
    }
  }

  throw new Error('Unable to resolve a non-empty page title')
}

async function dismissCommandPaletteHintIfPresent(driver) {
  const buttons = await driver.findElements(By.css('.app-command-hint .button-secondary'))
  if (buttons.length === 0) {
    return false
  }

  const hint = await driver.findElement(By.css('.app-command-hint'))
  await buttons[0].click()
  await driver.wait(until.stalenessOf(hint), NAVIGATION_TIMEOUT_MS)
  return true
}

async function scrollElementIntoView(driver, element) {
  await driver.executeScript(
    'arguments[0].scrollIntoView({ behavior: "auto", block: "center" })',
    element,
  )
}

async function runPaletteNavigation(driver, options) {
  const {
    query,
    expectedPath,
    expectedHash,
    expectedTitle,
    expectedAnchorId,
  } = options

  let stage = 'opening command palette'

  try {
    const { panel, input } = await openCommandPalette(driver)
    stage = 'typing palette query'
    await input.clear()
    await input.sendKeys(query)

    const targetSelector = getPaletteTargetSelector(expectedPath, expectedHash)
    stage = `locating palette command ${targetSelector}`
    const targetCommand = await driver.wait(
      until.elementLocated(By.css(targetSelector)),
      NAVIGATION_TIMEOUT_MS,
    )

    stage = 'clicking palette command'
    await targetCommand.click()

    stage = 'waiting for palette dismissal or navigation'
    await driver.wait(async () => {
      const panels = await driver.findElements(By.css('.command-palette-panel'))
      if (panels.length === 0) {
        return true
      }
      const location = await readLocation(driver)
      return location.pathname === expectedPath && (expectedHash == null || location.hash === expectedHash)
    }, NAVIGATION_TIMEOUT_MS)

    stage = 'closing remaining palette panel'
    const remainingPanels = await driver.findElements(By.css('.command-palette-panel'))
    if (remainingPanels.length > 0) {
      await input.sendKeys(Key.ESCAPE).catch(() => {})
      await driver.wait(async () => {
        const panels = await driver.findElements(By.css('.command-palette-panel'))
        return panels.length === 0
      }, 3_000).catch(() => {})
    }

    stage = 'waiting for expected location'
    await waitForLocation(driver, expectedPath, expectedHash)

    stage = 'reading page title'
    const titleText = await readPageTitle(driver)
    assert.match(titleText, expectedTitle)

    if (expectedAnchorId) {
      stage = `locating anchor #${expectedAnchorId}`
      const anchor = await driver.wait(
        until.elementLocated(By.id(expectedAnchorId)),
        NAVIGATION_TIMEOUT_MS,
      )
      await scrollElementIntoView(driver, anchor)
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Palette navigation failed at ${stage}: ${details}`)
  }
}

async function clickSidebarLink(driver, href) {
  const selector = `.app-sidebar .app-nav-link[href="${href}"]`

  const findVisibleLink = async () => {
    const links = await driver.findElements(By.css(selector))
    for (const link of links) {
      if (await link.isDisplayed()) {
        return link
      }
    }
    return null
  }

  let link = await findVisibleLink()
  if (!link) {
    const menuButton = await driver.wait(
      until.elementLocated(By.css('.app-topbar > div > button.app-icon-button')),
      NAVIGATION_TIMEOUT_MS,
    )
    await menuButton.click()
    await driver.wait(async () => (await findVisibleLink()) !== null, NAVIGATION_TIMEOUT_MS)
    link = await findVisibleLink()
  }

  if (!link) {
    throw new Error(`Unable to find a visible sidebar link for ${href}`)
  }

  await link.click()
}

async function tryContinueFromSetupWizard(driver) {
  const buttons = await driver.findElements(By.css('.fullscreen-shell button'))
  for (const button of buttons) {
    const label = (await button.getText()).trim()
    if (!label) continue
    if (!/(进入管理大师|跳过，稍后配置|Enter ClawMaster|Skip, configure later|ClawMasterへ|スキップ、後で設定)/.test(label)) {
      continue
    }

    await button.click()
    await driver.wait(until.elementLocated(By.css('.app-shell, .fullscreen-shell')), NAVIGATION_TIMEOUT_MS)
    const appShell = await driver.findElements(By.css('.app-shell'))
    if (appShell.length > 0) {
      return true
    }
  }

  return false
}

async function verifyDesktopSettingsSurface(driver) {
  const localDataSection = await driver.wait(
    until.elementLocated(By.id('settings-local-data')),
    NAVIGATION_TIMEOUT_MS,
  )
  await scrollElementIntoView(driver, localDataSection)

  const rebuildButton = await localDataSection.findElement(By.css('.button-secondary'))
  const resetButton = await localDataSection.findElement(By.css('.button-danger'))
  assert.equal(await rebuildButton.isEnabled(), false, 'desktop rebuild button should be disabled')
  assert.equal(await resetButton.isEnabled(), false, 'desktop reset button should be disabled')

  const sectionText = await localDataSection.getText()
  assert.match(sectionText, /(Node|worker|桌面|desktop|デスクトップ)/)
}

async function verifyDangerZoneConfirmation(driver) {
  const dangerSection = await driver.wait(
    until.elementLocated(By.xpath("//section[contains(@class,'border-red-500/50')]")),
    NAVIGATION_TIMEOUT_MS,
  )
  await scrollElementIntoView(driver, dangerSection)

  const uninstallButton = await dangerSection.findElement(By.css('.button-danger'))
  await uninstallButton.click()

  const dialog = await driver.wait(
    until.elementLocated(By.css('[role="dialog"][aria-modal="true"]')),
    NAVIGATION_TIMEOUT_MS,
  )
  const dialogTitle = await dialog.findElement(By.css('#confirm-dialog-title')).getText()
  assert.ok(dialogTitle.trim().length > 0, 'danger confirmation should render a title')

  const cancelButton = await dialog.findElement(By.css('.button-secondary'))
  await cancelButton.click()
  await driver.wait(until.stalenessOf(dialog), NAVIGATION_TIMEOUT_MS)
}

async function captureDriverArtifacts(driver, name, metadata = {}) {
  const artifactDir = await ensureArtifactDir()
  const screenshot = await driver.takeScreenshot()
  await writeFile(path.join(artifactDir, `${name}.png`), screenshot, 'base64')
  await writeFile(
    path.join(artifactDir, `${name}.json`),
    JSON.stringify({
      ...metadata,
      capturedAt: new Date().toISOString(),
    }, null, 2),
    'utf8',
  )
}

async function collectWindowDiagnostics(driver) {
  return driver.executeAsyncScript(function () {
    const done = arguments[arguments.length - 1]

    ;(async () => {
      const diagnostics = {
        href: window.location.href,
        pathname: window.location.pathname,
        hash: window.location.hash,
        bodyText: document.body?.innerText?.slice(0, 4000) ?? '',
        tauriGlobals: {
          hasTauri: typeof window.__TAURI__ !== 'undefined',
          hasTauriInternal: typeof window.__TAURI_INTERNALS__ !== 'undefined',
        },
      }

      try {
        const internalInvoke = window.__TAURI_INTERNALS__?.invoke
        if (typeof internalInvoke === 'function') {
          diagnostics.detectSystem = await internalInvoke('detect_system')
          diagnostics.getConfig = await internalInvoke('get_config')
          diagnostics.desktopSmoke = await internalInvoke('desktop_smoke_diagnostics')
        }
      } catch (error) {
        diagnostics.invokeError = String(error)
      }

      done(diagnostics)
    })().catch((error) => {
      done({ error: String(error) })
    })
  })
}

async function persistDriverLogs(logs, name) {
  await persistTextArtifacts(`${name}-driver-logs`, {
    stdout: logs.stdout ?? '',
    stderr: logs.stderr ?? '',
  })
}

async function persistTextArtifacts(name, payload) {
  const artifactDir = await ensureArtifactDir()
  await writeFile(
    path.join(artifactDir, `${name}.log`),
    [`[stdout]`, payload.stdout ?? '', '', `[stderr]`, payload.stderr ?? ''].join('\n'),
    'utf8',
  )
  await writeFile(
    path.join(artifactDir, `${name}.json`),
    JSON.stringify({
      ...payload,
      capturedAt: new Date().toISOString(),
    }, null, 2),
    'utf8',
  )
}

export async function runDesktopSmoke() {
  const seededProfile = await seedDesktopSmokeProfile()
  const openclawBootstrap = await ensureOpenclawShim()
  await persistTextArtifacts(
    'desktop-smoke-bootstrap',
    await collectBootstrapDiagnostics(seededProfile.info, openclawBootstrap),
  )
  const binaryPath = await ensureDesktopBinary()
  const mode = getSmokeMode()

  try {
    if (mode === 'launch') {
      return runLaunchSmoke(binaryPath)
    }

    return runWebdriverSmoke(binaryPath)
  } finally {
    await seededProfile.restore()
  }
}

async function collectBootstrapDiagnostics(seedInfo, openclawBootstrap) {
  const configPath = seedInfo?.configPath ?? path.join(os.homedir(), '.openclaw', 'openclaw.json')
  const configExists = await pathExists(configPath)
  const configContent = configExists ? await readFile(configPath, 'utf8') : ''

  return {
    seedInfo,
    openclawBootstrap,
    env: {
      home: os.homedir(),
      path: process.env.PATH ?? '',
    },
    configExists,
    configPath,
    configPreview: configContent.slice(0, 2000),
  }
}
