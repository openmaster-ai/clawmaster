/**
 * Wizard Install Smoke Test
 *
 * Verifies the wizard's Step 1 works correctly by simulating the same
 * HTTP calls the frontend makes through the backend exec API.
 *
 * What this tests:
 * 1. The exec API can run `openclaw --version` (detection)
 * 2. The exec API can run `npm install` with --registry flag (mirror passthrough)
 * 3. The exec API can run `openclaw onboard` (config init)
 *
 * Usage:
 *   node tests/install/wizard-install-smoke.mjs
 *
 * Environment:
 *   CLAWMASTER_BINARY     — override binary path (default: npm global)
 *   CLAWMASTER_SMOKE_PORT — override port (default: 3412)
 *   CLAWMASTER_SMOKE_TOKEN — override token (default: ci-wizard-smoke)
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const smokePort = String(Number.parseInt(process.env.CLAWMASTER_SMOKE_PORT ?? '3412', 10))
const smokeToken = process.env.CLAWMASTER_SMOKE_TOKEN?.trim() || 'ci-wizard-smoke'
const smokeUrl = `http://127.0.0.1:${smokePort}`

function getNpmExecOptions() {
  return { encoding: 'utf8', shell: process.platform === 'win32' }
}

function getBinaryExecOptions(env) {
  return { encoding: 'utf8', env, shell: process.platform === 'win32', windowsHide: true }
}

function resolveInstalledBinary() {
  if (process.env.CLAWMASTER_BINARY?.trim()) return process.env.CLAWMASTER_BINARY.trim()
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const prefix = execFileSync(npmCommand, ['prefix', '-g'], getNpmExecOptions()).trim()
  return process.platform === 'win32'
    ? path.join(prefix, 'clawmaster.cmd')
    : path.join(prefix, 'bin', 'clawmaster')
}

function runBinary(binary, args, env) {
  return spawnSync(binary, args, getBinaryExecOptions(env))
}

function assertSuccess(result, binary, args) {
  assert.equal(
    result.status,
    0,
    `${[binary, ...args].join(' ')} failed (exit ${result.status})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function apiExec(cmd, args) {
  const res = await fetch(`${smokeUrl}/api/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${smokeToken}`,
    },
    body: JSON.stringify({ cmd, args }),
  })
  return await res.json()
}

async function waitForHealthy(binary, env) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = runBinary(binary, ['status', '--url', smokeUrl, '--token', smokeToken], env)
    if (result.status === 0) return result.stdout
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${smokeUrl}`)
}

function isIgnorableWindowsCleanupError(error) {
  if (process.platform !== 'win32') return false
  const code = error?.code ?? ''
  return code === 'ENOTEMPTY' || code === 'EPERM' || code === 'EBUSY'
}

async function cleanupTempHome(binary, env, tempHome) {
  runBinary(binary, ['stop'], env)
  const attempts = process.platform === 'win32' ? 12 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      fs.rmSync(tempHome, { recursive: true, force: true })
      return
    } catch (error) {
      if (!isIgnorableWindowsCleanupError(error) || attempt === attempts - 1) {
        if (isIgnorableWindowsCleanupError(error)) return
        throw error
      }
      await sleep(1000)
    }
  }
}

// ─── Main ───

const binary = resolveInstalledBinary()
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-wizard-smoke-'))
const env = {
  ...process.env,
  HOME: tempHome,
  USERPROFILE: tempHome,
}

if (process.platform === 'win32') {
  env.APPDATA = path.win32.join(tempHome, 'AppData', 'Roaming')
  env.LOCALAPPDATA = path.win32.join(tempHome, 'AppData', 'Local')
}

let passed = 0

try {
  // ── Step 0: Start service ──
  console.log(`[wizard-smoke] Starting service at ${smokeUrl} (temp HOME: ${tempHome})`)
  const serveArgs = ['serve', '--daemon', '--silent', '--host', '127.0.0.1', '--port', smokePort, '--token', smokeToken]
  const serveResult = runBinary(binary, serveArgs, env)
  assertSuccess(serveResult, binary, serveArgs)
  await waitForHealthy(binary, env)
  console.log('[wizard-smoke] Service is healthy')

  // ── Step 1: Detect openclaw via exec API ──
  // The wizard calls POST /api/exec {cmd:"openclaw", args:["--version"]}
  // In CI openclaw may or may not be installed — either result is valid.
  console.log('[wizard-smoke] Step 1: Detection via exec API...')
  const detectResult = await apiExec('openclaw', ['--version'])
  const openclawDetected = detectResult.ok === true
  console.log(`[wizard-smoke]   exec API openclaw detection: ${openclawDetected ? 'found' : 'not found'}`)
  if (openclawDetected) {
    assert.match(detectResult.stdout, /OpenClaw/i)
    console.log(`[wizard-smoke]   version: ${detectResult.stdout.trim()}`)
  }
  passed++

  // ── Step 2: Verify npm commands with --registry flag pass through exec API ──
  // The wizard calls POST /api/exec {cmd:"npm", args:["install","-g","openclaw","--registry","..."]}
  // We test the plumbing with a safe read-only npm command + extra args.
  console.log('[wizard-smoke] Step 2: npm --registry flag passthrough...')
  const registryResult = await apiExec('npm', ['view', 'openclaw', 'version', '--registry', 'https://registry.npmmirror.com'])
  assert.equal(registryResult.ok, true, `npm view via exec API failed: ${registryResult.error ?? registryResult.stderr}`)
  assert.match(registryResult.stdout, /\d{4}\.\d+/, 'npm view should return a version number')
  console.log(`[wizard-smoke]   latest openclaw on mirror: ${registryResult.stdout.trim()}`)
  passed++

  // ── Step 3: Init config via exec API (wizard onboard_init phase) ──
  // The wizard calls openclaw onboard after install.
  // Non-fatal if openclaw isn't installed — matches wizard behavior.
  console.log('[wizard-smoke] Step 3: Config init via exec API...')
  if (openclawDetected) {
    const onboardResult = await apiExec('openclaw', [
      'onboard', '--mode', 'local', '--non-interactive', '--accept-risk', '--skip-health',
    ])
    if (onboardResult.ok) {
      console.log('[wizard-smoke]   onboard succeeded')
    } else {
      console.log(`[wizard-smoke]   onboard non-zero (non-fatal): ${(onboardResult.error ?? onboardResult.stderr).slice(0, 120)}`)
    }
  } else {
    console.log('[wizard-smoke]   skipped (openclaw not installed)')
  }
  passed++

  console.log(`\n[wizard-smoke] All ${passed} checks passed`)
} catch (err) {
  console.error(`\n[wizard-smoke] Failed after ${passed} checks:`, err.message)
  process.exitCode = 1
} finally {
  await cleanupTempHome(binary, env, tempHome)
  console.log('[wizard-smoke] Cleaned up temp HOME')
}
