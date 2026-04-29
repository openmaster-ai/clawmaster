#!/usr/bin/env node

import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { spawn, execFile as execFileCallback, execFileSync } from 'node:child_process'
import { dirname, join, posix as pathPosix, resolve, win32 as pathWin32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import os from 'node:os'

const execFile = promisify(execFileCallback)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const cliEntryPath = fileURLToPath(import.meta.url)
const require = createRequire(import.meta.url)
const pkg = require(resolve(root, 'package.json'))
const realCliEntryPath = resolveRealPath(cliEntryPath)
const SERVICE_READY_RETRIES = 40
const SERVICE_READY_RETRY_DELAY_MS = 250
const SERVICE_READY_TIMEOUT_MS = 1000
const DEFAULT_SERVICE_PORT = '16223'
const BANNER_PRIMARY = '\x1b[1;38;2;35;214;171m'
const BANNER_SECONDARY = '\x1b[1;38;2;71;198;255m'
const BANNER_VERSION = '\x1b[38;2;35;214;171m'
const ANSI_RESET = '\x1b[0m'
const SERVE_BANNER_LINES = [
  ' ██████╗ ██╗      █████╗ ██╗    ██╗',
  '██╔════╝ ██║     ██╔══██╗██║    ██║',
  '██║      ██║     ███████║██║ █╗ ██║',
  '██║      ██║     ██╔══██║██║███╗██║',
  '╚██████╗ ███████╗██║  ██║╚███╔███╔╝',
  ' ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ',
  '███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗ ',
  '████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗',
  '██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝',
  '██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗',
  '██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║',
  '╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝',
]

function getServiceStatePathModule(platform = process.platform) {
  return platform === 'win32' ? pathWin32 : pathPosix
}

function normalizeHomePath(homeDir, platform = process.platform) {
  const normalized = String(homeDir ?? '').trim()
  if (!normalized) return ''
  return getServiceStatePathModule(platform).normalize(normalized)
}

function isNativeAbsoluteHomePath(homeDir, platform = process.platform) {
  const normalized = String(homeDir ?? '').trim()
  if (!normalized) return false
  if (platform !== 'win32') {
    return normalized.startsWith('/')
  }
  return /^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith('\\\\') || normalized.startsWith('//')
}

function resolveEffectiveHomeContext(options = {}) {
  const platform = options.platform ?? process.platform
  const homeOverride = String(options.homeDir ?? process.env.HOME ?? '').trim()
  const fallbackHomeDir = normalizeHomePath(options.fallbackHomeDir ?? os.homedir(), platform)
  const overrideActive = isNativeAbsoluteHomePath(homeOverride, platform)
  return {
    homeDir: overrideActive ? normalizeHomePath(homeOverride, platform) : fallbackHomeDir,
    overrideActive,
    platform,
  }
}

export function resolveServiceStatePaths(options = {}) {
  const { homeDir, platform } = resolveEffectiveHomeContext(options)
  const pathModule = getServiceStatePathModule(platform)
  const serviceStateDir = pathModule.join(homeDir, '.clawmaster', 'service')
  return {
    serviceStateDir,
    serviceStateFile: pathModule.join(serviceStateDir, 'service-state.json'),
  }
}

function printHelp() {
  console.log(`
ClawMaster v${pkg.version}

Usage:
  clawmaster serve [--host 127.0.0.1] [--port ${DEFAULT_SERVICE_PORT}] [--daemon] [--token <token>] [--silent] [--no-gateway-watchdog]
  clawmaster status [--url http://127.0.0.1:${DEFAULT_SERVICE_PORT}] [--token <token>]
  clawmaster stop
  clawmaster doctor
  clawmaster --version
  clawmaster --help

Commands:
  serve    Start the ClawMaster service and open the web console, or run it in the background with --daemon.
  status   Check whether a running ClawMaster service is reachable.
  stop     Stop the background ClawMaster service recorded in the local state file.
  doctor   Inspect local runtime prerequisites and packaged build assets.

Notes:
  The service expects built backend and frontend assets.
  clawmaster serve protects the web UI with a service token by default.
  clawmaster serve keeps the OpenClaw gateway running by default; pass --no-gateway-watchdog to opt out.
  clawmaster serve opens the web console in your default browser unless you pass --silent.
  For local source checkouts, run:
    npm run build:backend
    npm run build
`)
}

function parseFlagValue(args, name, fallback) {
  const longFlag = `--${name}`
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === longFlag) {
      return args[index + 1] ?? fallback
    }
    if (arg.startsWith(`${longFlag}=`)) {
      return arg.slice(longFlag.length + 1) || fallback
    }
  }
  return fallback
}

function hasFlag(args, name) {
  const longFlag = `--${name}`
  return args.includes(longFlag)
}

function hasValueFlag(args, name) {
  const longFlag = `--${name}`
  return args.some((arg) => arg === longFlag || arg.startsWith(`${longFlag}=`))
}

function supportsColor(stream = process.stdout, env = process.env) {
  return Boolean(stream?.isTTY) && env.NO_COLOR === undefined && env.TERM !== 'dumb'
}

export function renderServeBanner(options = {}) {
  const version = String(options.version ?? pkg.version)
  const stream = options.stream ?? process.stdout
  const env = options.env ?? process.env
  const color = options.color ?? supportsColor(stream, env)
  const maxWidth = SERVE_BANNER_LINES.reduce((width, line) => Math.max(width, line.length), 0)
  const columns = Number(options.columns ?? stream?.columns ?? 0)
  const compact = columns > 0 && columns < maxWidth + 4

  if (compact) {
    if (!color) {
      return `CLAWMASTER v${version}`
    }
    return `${BANNER_PRIMARY}CLAWMASTER${ANSI_RESET} ${BANNER_SECONDARY}v${version}${ANSI_RESET}`
  }

  const versionLine = `v${version}`.padStart(maxWidth)
  const lines = [...SERVE_BANNER_LINES, versionLine]
  if (!color) {
    return lines.join('\n')
  }

  return lines
    .map((line, index) => {
      if (index < 6) return `${BANNER_PRIMARY}${line}${ANSI_RESET}`
      if (index < 12) return `${BANNER_SECONDARY}${line}${ANSI_RESET}`
      return `${BANNER_VERSION}${line}${ANSI_RESET}`
    })
    .join('\n')
}

function printServeBanner() {
  console.log(renderServeBanner())
}

function resolveRealPath(pathToResolve) {
  try {
    return realpathSync(pathToResolve)
  } catch {
    return null
  }
}

function normalizeServiceUrl(value) {
  return String(value ?? '').replace(/\/+$/, '')
}

function isWildcardHost(host) {
  const normalized = String(host ?? '').trim()
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]'
}

function getReachableHost(host) {
  const normalized = String(host ?? '').trim()
  if (normalized === '0.0.0.0') return '127.0.0.1'
  if (normalized === '::' || normalized === '[::]') return '[::1]'
  return normalized
}

function formatHttpHost(host) {
  const normalized = String(host ?? '').trim()
  if (!normalized) return '127.0.0.1'
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return normalized
  }
  return normalized.includes(':') ? `[${normalized}]` : normalized
}

function buildHttpUrl(host, port) {
  return `http://${formatHttpHost(host)}:${port}`
}

export function resolveServiceUrls(host, port) {
  const bindHost = String(host ?? '').trim() || '127.0.0.1'
  const reachableHost = getReachableHost(bindHost)
  return {
    bindHost,
    port: String(port),
    url: buildHttpUrl(reachableHost, port),
    wildcard: isWildcardHost(bindHost),
  }
}

export function isCliEntryInvocation(entryPath, options = {}) {
  if (!entryPath) return false
  const cliPath = options.cliEntryPath ?? cliEntryPath
  const realCliPath = options.realCliEntryPath ?? realCliEntryPath
  const resolvePath = options.resolvePath ?? resolve
  const realpath = options.realpath ?? resolveRealPath
  const resolvedEntryPath = resolvePath(entryPath)

  if (resolvedEntryPath === cliPath) {
    return true
  }

  const realEntryPath = realpath(resolvedEntryPath)
  return Boolean(realEntryPath && realCliPath && realEntryPath === realCliPath)
}

export function buildServiceLaunchUrl(baseUrl, token) {
  const url = new URL(normalizeServiceUrl(baseUrl))
  const normalizedToken = String(token ?? '').trim()
  if (normalizedToken) {
    url.searchParams.set('serviceToken', normalizedToken)
  }
  return url.toString()
}

export function resolveBrowserOpenCommand(targetUrl, options = {}) {
  const platform = options.platform ?? process.platform
  if (platform === 'darwin') {
    return { command: 'open', args: [targetUrl] }
  }
  if (platform === 'win32') {
    return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', targetUrl] }
  }
  return { command: 'xdg-open', args: [targetUrl] }
}

function requestBrowserOpen(targetUrl, options = {}) {
  const spawnImpl = options.spawnImpl ?? spawn
  const opener = resolveBrowserOpenCommand(targetUrl, options)
  try {
    const child = spawnImpl(opener.command, opener.args, {
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
  } catch {
    // best effort
  }
}

function isServeSilent(args = []) {
  return hasFlag(args, 'silent') || hasFlag(args, 'quiet')
}

function formatServeStatusLine(label, value) {
  return `${label.padEnd(13)}${value}`
}

export function formatServeReadyMessage({
  daemon = false,
  urls,
  token,
  browserRequested = false,
  gatewayWatchdog = true,
  ready = true,
}) {
  const lines = [
    ready ? 'ClawMaster service ready.' : 'ClawMaster service is starting.',
    formatServeStatusLine('web console:', urls.url),
    formatServeStatusLine('bind:', `${urls.bindHost}:${urls.port}`),
    formatServeStatusLine('token:', token),
    formatServeStatusLine('gateway:', gatewayWatchdog ? 'safeguard enabled (auto-restart)' : 'safeguard disabled'),
  ]
  if (browserRequested) {
    lines.push(formatServeStatusLine(
      'browser:',
      ready ? 'opening the default browser' : 'opening when the web console becomes reachable',
    ))
  }
  lines.push(formatServeStatusLine(
    'next:',
    daemon ? 'clawmaster status | clawmaster stop' : 'Ctrl+C to stop',
  ))
  return lines.join('\n')
}

function getServiceUrl(args = []) {
  const stored = readServiceState()
  return parseFlagValue(args, 'url', stored?.url ?? `http://127.0.0.1:${DEFAULT_SERVICE_PORT}`)
}

function getBackendHost(args = []) {
  return parseFlagValue(args, 'host', '127.0.0.1')
}

function getBackendPort(args = []) {
  const raw = parseFlagValue(args, 'port', DEFAULT_SERVICE_PORT)
  const parsed = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid --port value: ${raw}`)
  }
  return String(parsed)
}

function getServiceToken(args = []) {
  const provided = parseFlagValue(args, 'token', '').trim()
  return provided || randomBytes(24).toString('base64url')
}

function resolveServiceAssets() {
  const backendEntry = resolve(root, 'packages/backend/dist/index.js')
  const frontendDist = resolve(root, 'packages/web/dist')
  const frontendIndex = resolve(frontendDist, 'index.html')

  return {
    backendEntry,
    frontendDist,
    frontendIndex,
    backendReady: existsSync(backendEntry),
    frontendReady: existsSync(frontendIndex),
  }
}

function ensureServiceStateDir() {
  const { serviceStateDir } = resolveServiceStatePaths()
  mkdirSync(serviceStateDir, { recursive: true })
}

function readServiceState() {
  const { serviceStateFile } = resolveServiceStatePaths()
  try {
    return JSON.parse(readFileSync(serviceStateFile, 'utf8'))
  } catch {
    return null
  }
}

function writeServiceState(state) {
  const { serviceStateFile } = resolveServiceStatePaths()
  ensureServiceStateDir()
  writeFileSync(serviceStateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  try {
    chmodSync(serviceStateFile, 0o600)
  } catch {
    // best effort
  }
}

function readLogTail(pathToFile, maxChars = 1200) {
  try {
    const content = readFileSync(pathToFile, 'utf8')
    return content.length > maxChars ? content.slice(-maxChars) : content
  } catch {
    return ''
  }
}

function clearServiceState() {
  const { serviceStateFile } = resolveServiceStatePaths()
  rmSync(serviceStateFile, { force: true })
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function firstCommandPath(whereOutput) {
  return String(whereOutput ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null
}

export function resolveCommandProbePath(command, options = {}) {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') {
    return command
  }
  if (typeof options.whereOutput === 'string') {
    return firstCommandPath(options.whereOutput) ?? command
  }
  try {
    const output = execFileSync('where', [command], {
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
    })
    return firstCommandPath(output) ?? command
  } catch {
    return command
  }
}

export function getCommandProbeExecOptions(options = {}) {
  const platform = options.platform ?? process.platform
  return {
    shell: platform === 'win32',
    windowsHide: true,
  }
}

async function probeCommand(command, args) {
  try {
    const resolvedCommand = resolveCommandProbePath(command)
    const { stdout } = await execFile(resolvedCommand, args, getCommandProbeExecOptions())
    return { ok: true, output: stdout.trim() }
  } catch (error) {
    return {
      ok: false,
      output: error instanceof Error ? error.message : String(error),
    }
  }
}

async function fetchServiceInfo(baseUrl, options = {}) {
  const {
    retries = 1,
    retryDelayMs = 250,
    token = '',
    timeoutMs = 5000,
  } = options

  let lastError = null
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${baseUrl}/api/system/detect`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new Error('unknown service probe failure')
}

async function fetchGatewayStatus(baseUrl, options = {}) {
  const {
    token = '',
    timeoutMs = 10_000,
  } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/api/gateway/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export function formatGatewayWatchdogStatus(watchdog) {
  if (!watchdog || typeof watchdog !== 'object') {
    return 'unknown'
  }
  if (watchdog.enabled !== true) {
    return 'disabled'
  }
  const state = String(watchdog.state ?? 'unknown')
  const restarts = Number.isFinite(Number(watchdog.restartCount))
    ? Number(watchdog.restartCount)
    : 0
  const suffix = restarts === 1 ? '1 restart' : `${restarts} restarts`
  return `${state}, auto-restart enabled, ${suffix}`
}

export async function waitForUrlReady(targetUrl, options = {}) {
  const {
    retries = SERVICE_READY_RETRIES,
    retryDelayMs = SERVICE_READY_RETRY_DELAY_MS,
    timeoutMs = SERVICE_READY_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(targetUrl, {
        signal: controller.signal,
      })
      if (response.ok) {
        return true
      }
    } catch {
      // ignore transient startup failures
    } finally {
      clearTimeout(timer)
    }

    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  return false
}

function openBrowserWhenReady(targetUrl, options = {}) {
  void (async () => {
    const ready = await waitForUrlReady(targetUrl, options)
    if (ready) {
      requestBrowserOpen(targetUrl, options)
    }
  })()
}

export async function validateServiceState(state, options = {}) {
  if (!state) return null
  if (!isProcessAlive(Number(state.pid))) {
    return null
  }

  const fetcher = options.fetcher ?? fetchServiceInfo
  try {
    await fetcher(normalizeServiceUrl(state.url), {
      retries: 1,
      retryDelayMs: 0,
      timeoutMs: options.timeoutMs ?? 750,
      token: typeof state.token === 'string' ? state.token : '',
    })
    return state
  } catch {
    return options.allowUnreachable === false ? null : state
  }
}

export function getSignalExitCode(signal) {
  if (signal === 'SIGINT') return 130
  if (signal === 'SIGTERM') return 143
  return 1
}

async function getRunningServiceState(options = {}) {
  const state = readServiceState()
  if (!state) return null
  if (!isProcessAlive(Number(state.pid))) {
    clearServiceState()
    return null
  }
  const valid = await validateServiceState(state, {
    allowUnreachable: options.allowUnreachable ?? false,
    timeoutMs: options.timeoutMs,
    fetcher: options.fetcher,
  })
  if (valid) {
    return valid
  }
  clearServiceState()
  return null
}

async function runDoctor() {
  const assets = resolveServiceAssets()
  const nodeVersion = process.version
  const npm = await probeCommand('npm', ['--version'])
  const openclaw = await probeCommand('openclaw', ['--version'])

  console.log('ClawMaster doctor')
  console.log('')
  console.log(`node:       ${nodeVersion}`)
  console.log(`npm:        ${npm.ok ? npm.output : `missing (${npm.output})`}`)
  console.log(`openclaw:   ${openclaw.ok ? openclaw.output : `missing (${openclaw.output})`}`)
  console.log(`backend:    ${assets.backendReady ? assets.backendEntry : 'missing build output'}`)
  console.log(`frontend:   ${assets.frontendReady ? assets.frontendIndex : 'missing build output'}`)
  console.log('')

  if (!assets.backendReady || !assets.frontendReady) {
    console.log('Build assets are missing. Run `npm run build:backend` and `npm run build` before `clawmaster serve`.')
    process.exitCode = 1
    return
  }
}

async function runStatus(args) {
  const baseUrl = normalizeServiceUrl(getServiceUrl(args))
  const storedState = await getRunningServiceState({ allowUnreachable: true })
  const explicitUrl = hasValueFlag(args, 'url')
  const state = storedState && (!explicitUrl || normalizeServiceUrl(storedState.url) === baseUrl)
    ? storedState
    : null
  const token = parseFlagValue(args, 'token', state?.token ?? '')
  try {
    const data = await fetchServiceInfo(baseUrl, { retries: 8, retryDelayMs: 250, token })
    console.log(`ClawMaster service is reachable at ${baseUrl}`)
    if (state) {
      console.log(`pid:      ${state.pid}`)
      console.log(`started:  ${state.startedAt}`)
    }
    console.log(`openclaw: ${data?.openclaw?.installed ? data.openclaw.version || 'installed' : 'not detected'}`)
    console.log(`config:   ${data?.openclaw?.configPath ?? 'unknown'}`)
    console.log(`runtime:  ${data?.runtime?.mode ?? 'unknown'}`)
    try {
      const gateway = await fetchGatewayStatus(baseUrl, { token })
      if (typeof gateway?.running === 'boolean') {
        console.log(`gateway:  ${gateway.running ? 'running' : 'stopped'}${gateway.port ? ` on port ${gateway.port}` : ''}`)
        console.log(formatServeStatusLine('safeguard:', formatGatewayWatchdogStatus(gateway.watchdog)))
      }
    } catch {
      // Older services do not expose gateway status; keep status compatible.
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`ClawMaster service is not reachable at ${baseUrl}: ${message}`)
    process.exitCode = 1
  }
}

async function runStop() {
  const state = await getRunningServiceState({ allowUnreachable: true })
  if (!state) {
    console.error('No running ClawMaster background service was found.')
    process.exitCode = 1
    return
  }

  try {
    process.kill(Number(state.pid), 'SIGTERM')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Failed to stop ClawMaster service: ${message}`)
    process.exitCode = 1
    return
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessAlive(Number(state.pid))) {
      clearServiceState()
      console.log(`Stopped ClawMaster service (pid ${state.pid}).`)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  console.error(`Timed out waiting for ClawMaster service pid ${state.pid} to stop.`)
  process.exitCode = 1
}

export function buildServiceSpawnOptions({
  assets,
  daemon,
  host,
  port,
  token,
  gatewayWatchdog = true,
  stdoutLog,
  stderrLog,
  workingDir = process.cwd(),
  platform = process.platform,
  homeDir = process.env.HOME,
  fallbackHomeDir = os.homedir(),
}) {
  const homeContext = resolveEffectiveHomeContext({
    platform,
    homeDir,
    fallbackHomeDir,
  })
  const env = {
    ...process.env,
    BACKEND_HOST: host,
    BACKEND_PORT: port,
    CLAWMASTER_FRONTEND_DIST: assets.frontendDist,
    CLAWMASTER_SERVICE_TOKEN: token,
    CLAWMASTER_GATEWAY_WATCHDOG: gatewayWatchdog ? '1' : '0',
  }
  if (homeContext.platform === 'win32' && homeContext.overrideActive) {
    env.HOME = homeContext.homeDir
    env.USERPROFILE = homeContext.homeDir
    env.APPDATA = pathWin32.join(homeContext.homeDir, 'AppData', 'Roaming')
    env.LOCALAPPDATA = pathWin32.join(homeContext.homeDir, 'AppData', 'Local')
  }
  return {
    cwd: workingDir,
    stdio: daemon
      ? ['ignore', openSync(stdoutLog, 'a'), openSync(stderrLog, 'a')]
      : 'inherit',
    env,
    detached: daemon,
    shell: false,
    windowsHide: true,
  }
}

async function runServe(args) {
  const host = getBackendHost(args)
  const port = getBackendPort(args)
  const daemon = hasFlag(args, 'daemon')
  const silent = isServeSilent(args)
  const gatewayWatchdog = !hasFlag(args, 'no-gateway-watchdog')
  const token = getServiceToken(args)
  const assets = resolveServiceAssets()
  const urls = resolveServiceUrls(host, port)
  const url = urls.url
  const launchUrl = buildServiceLaunchUrl(url, token)
  const running = await getRunningServiceState({ allowUnreachable: false })
  const { serviceStateDir } = resolveServiceStatePaths()
  const stdoutLog = join(serviceStateDir, 'service.stdout.log')
  const stderrLog = join(serviceStateDir, 'service.stderr.log')

  if (!assets.backendReady || !assets.frontendReady) {
    console.error('ClawMaster service assets are missing.')
    console.error('Expected:')
    console.error(`  backend: ${assets.backendEntry}`)
    console.error(`  frontend: ${assets.frontendIndex}`)
    console.error('')
    console.error('Run `npm run build:backend` and `npm run build`, or install the published npm package.')
    process.exit(1)
  }

  if (running) {
    console.error(`ClawMaster service is already running at ${running.url} (pid ${running.pid}).`)
    console.error('Use `clawmaster status` to inspect it or `clawmaster stop` to stop it first.')
    process.exit(1)
  }

  if (!silent) {
    printServeBanner()
  }

  ensureServiceStateDir()
  const spawnOptions = buildServiceSpawnOptions({
    assets,
    daemon,
    host,
    port,
    token,
    gatewayWatchdog,
    stdoutLog,
    stderrLog,
  })
  const ownedLogFds = Array.isArray(spawnOptions.stdio)
    ? spawnOptions.stdio.filter((entry, index) => index > 0 && typeof entry === 'number')
    : []
  let child
  try {
    child = spawn(
      process.execPath,
      [assets.backendEntry],
      spawnOptions,
    )
  } finally {
    for (const fd of ownedLogFds) {
      try {
        closeSync(fd)
      } catch {
        // best effort
      }
    }
  }

  writeServiceState({
    pid: child.pid,
    host,
    port: Number(port),
    url,
    token,
    startedAt: new Date().toISOString(),
    stdoutLog,
    stderrLog,
  })

  if (daemon) {
    const ready = await waitForUrlReady(url, {
      retries: SERVICE_READY_RETRIES,
      retryDelayMs: SERVICE_READY_RETRY_DELAY_MS,
      timeoutMs: SERVICE_READY_TIMEOUT_MS,
    })
    if (!ready) {
      try {
        process.kill(child.pid, 'SIGTERM')
      } catch {
        // ignore cleanup failure here
      }
      const stderrTail = readLogTail(stderrLog).trim()
      clearServiceState()
      console.error(`ClawMaster web console failed to become ready at ${url}.`)
      if (stderrTail) {
        console.error('')
        console.error('Recent stderr:')
        console.error(stderrTail)
      }
      process.exit(1)
    }

    child.unref()
    console.log(formatServeReadyMessage({
      daemon: true,
      urls,
      token,
      browserRequested: !silent,
      gatewayWatchdog,
      ready: true,
    }))
    if (!silent) {
      requestBrowserOpen(launchUrl)
    }
    return
  }

  const stopChild = (signal) => {
    if (!child.killed) {
      child.kill(signal)
    }
  }

  const handleSigint = () => stopChild('SIGINT')
  const handleSigterm = () => stopChild('SIGTERM')

  process.on('SIGINT', handleSigint)
  process.on('SIGTERM', handleSigterm)
  child.on('exit', (code, signal) => {
    clearServiceState()
    process.off('SIGINT', handleSigint)
    process.off('SIGTERM', handleSigterm)
    if (signal) {
      process.exit(getSignalExitCode(signal))
      return
    }
    process.exit(code ?? 0)
  })

  console.log(formatServeReadyMessage({
    daemon: false,
    urls,
    token,
    browserRequested: !silent,
    gatewayWatchdog,
    ready: false,
  }))
  if (!silent) {
    openBrowserWhenReady(launchUrl)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] ?? 'serve'

  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(`ClawMaster v${pkg.version}`)
    return
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp()
    return
  }

  if (command === 'doctor') {
    await runDoctor()
    return
  }

  if (command === 'status') {
    await runStatus(args.slice(1))
    return
  }

  if (command === 'stop') {
    await runStop()
    return
  }

  if (command === 'serve') {
    await runServe(args.slice(1))
    return
  }

  console.error(`Unknown command: ${command}`)
  console.error('')
  printHelp()
  process.exitCode = 1
}

if (isCliEntryInvocation(process.argv[1])) {
  void main()
}
