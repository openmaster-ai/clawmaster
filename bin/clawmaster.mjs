#!/usr/bin/env node

import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { spawn, execFile as execFileCallback, execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import os from 'node:os'

const execFile = promisify(execFileCallback)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const cliEntryPath = fileURLToPath(import.meta.url)
const require = createRequire(import.meta.url)
const pkg = require(resolve(root, 'package.json'))
const serviceStateDir = join(os.homedir(), '.clawmaster', 'service')
const serviceStateFile = join(serviceStateDir, 'service-state.json')

function printHelp() {
  console.log(`
ClawMaster v${pkg.version}

Usage:
  clawmaster serve [--host 127.0.0.1] [--port 3001] [--daemon] [--token <token>]
  clawmaster status [--url http://127.0.0.1:3001] [--token <token>]
  clawmaster stop
  clawmaster doctor
  clawmaster --version
  clawmaster --help

Commands:
  serve    Start the ClawMaster service in the foreground, or in the background with --daemon.
  status   Check whether a running ClawMaster service is reachable.
  stop     Stop the background ClawMaster service recorded in the local state file.
  doctor   Inspect local runtime prerequisites and packaged build assets.

Notes:
  The service expects built backend and frontend assets.
  clawmaster serve protects the web UI with a service token by default.
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

function getServiceUrl(args = []) {
  const stored = readServiceState()
  return parseFlagValue(args, 'url', stored?.url ?? 'http://127.0.0.1:3001')
}

function getBackendHost(args = []) {
  return parseFlagValue(args, 'host', '127.0.0.1')
}

function getBackendPort(args = []) {
  const raw = parseFlagValue(args, 'port', '3001')
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
  mkdirSync(serviceStateDir, { recursive: true })
}

function readServiceState() {
  try {
    return JSON.parse(readFileSync(serviceStateFile, 'utf8'))
  } catch {
    return null
  }
}

function writeServiceState(state) {
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
  const storedState = await getRunningServiceState({ allowUnreachable: false })
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`ClawMaster service is not reachable at ${baseUrl}: ${message}`)
    process.exitCode = 1
  }
}

async function runStop() {
  const state = await getRunningServiceState({ allowUnreachable: false })
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
  stdoutLog,
  stderrLog,
  workingDir = process.cwd(),
}) {
  return {
    cwd: workingDir,
    stdio: daemon
      ? ['ignore', openSync(stdoutLog, 'a'), openSync(stderrLog, 'a')]
      : 'inherit',
    env: {
      ...process.env,
      BACKEND_HOST: host,
      BACKEND_PORT: port,
      CLAWMASTER_FRONTEND_DIST: assets.frontendDist,
      CLAWMASTER_SERVICE_TOKEN: token,
    },
    detached: daemon,
    shell: false,
  }
}

async function runServe(args) {
  const host = getBackendHost(args)
  const port = getBackendPort(args)
  const daemon = hasFlag(args, 'daemon')
  const token = getServiceToken(args)
  const assets = resolveServiceAssets()
  const urls = resolveServiceUrls(host, port)
  const url = urls.url
  const running = await getRunningServiceState({ allowUnreachable: false })
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

  ensureServiceStateDir()
  const child = spawn(
    process.execPath,
    [assets.backendEntry],
    buildServiceSpawnOptions({
      assets,
      daemon,
      host,
      port,
      token,
      stdoutLog,
      stderrLog,
    }),
  )

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
    try {
      await fetchServiceInfo(url, { retries: 40, retryDelayMs: 250, timeoutMs: 1000, token })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        process.kill(child.pid, 'SIGTERM')
      } catch {
        // ignore cleanup failure here
      }
      const stderrTail = readLogTail(stderrLog).trim()
      clearServiceState()
      console.error(`ClawMaster service failed to become ready at ${url}: ${message}`)
      if (stderrTail) {
        console.error('')
        console.error('Recent stderr:')
        console.error(stderrTail)
      }
      process.exit(1)
    }

    child.unref()
    console.log(`Started ClawMaster service in the background at ${url}`)
    if (urls.wildcard) {
      console.log(`bound: ${host}:${port}`)
    }
    console.log(`pid: ${child.pid}`)
    console.log(`token: ${token}`)
    console.log('Use `clawmaster status` to inspect it and `clawmaster stop` to stop it.')
    return
  }

  console.log(`Starting ClawMaster service on ${url}`)
  if (urls.wildcard) {
    console.log(`bound: ${host}:${port}`)
  }
  console.log(`token: ${token}`)
  console.log('Press Ctrl+C to stop.')

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

if (process.argv[1] && resolve(process.argv[1]) === cliEntryPath) {
  void main()
}
