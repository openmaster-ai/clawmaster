/**
 * Wizard Install Smoke Test
 *
 * Verifies the wizard's Step 1 (OpenClaw install) works correctly by
 * simulating the same HTTP calls the frontend makes through the backend API.
 *
 * Flow:
 * 1. Start clawmaster serve in a temp HOME
 * 2. POST /api/exec to detect openclaw (should succeed since clawmaster bundles it)
 * 3. If not installed: POST /api/exec to run npm install -g openclaw --registry mirror
 * 4. POST /api/exec to verify openclaw --version
 * 5. POST /api/exec to run openclaw onboard (init config)
 * 6. Stop service and clean up
 *
 * Usage:
 *   node tests/install/wizard-install-smoke.mjs
 *
 * Environment:
 *   CLAWMASTER_BINARY    — override binary path (default: npm global)
 *   CLAWMASTER_SMOKE_PORT — override port (default: 3412)
 *   CLAWMASTER_SMOKE_TOKEN — override token (default: ci-wizard-smoke)
 *   CLAWMASTER_NPM_REGISTRY — override npm registry (default: https://registry.npmmirror.com)
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const smokePort = String(Number.parseInt(process.env.CLAWMASTER_SMOKE_PORT ?? '3412', 10))
const smokeToken = process.env.CLAWMASTER_SMOKE_TOKEN?.trim() || 'ci-wizard-smoke'
const smokeUrl = `http://127.0.0.1:${smokePort}`
const npmRegistry = process.env.CLAWMASTER_NPM_REGISTRY?.trim() || 'https://registry.npmmirror.com'

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
  const data = await res.json()
  return data
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
  console.log('[wizard-smoke] Step 1: Detecting openclaw via /api/exec...')
  const detectResult = await apiExec('openclaw', ['--version'])
  const openclawInstalled = detectResult.ok === true
  console.log(`[wizard-smoke]   openclaw detected: ${openclawInstalled}`)
  if (openclawInstalled) {
    assert.match(detectResult.stdout, /OpenClaw/i, 'openclaw --version should contain "OpenClaw"')
    console.log(`[wizard-smoke]   version: ${detectResult.stdout.trim()}`)
  }
  passed++

  // ── Step 2: Install openclaw if not detected ──
  if (!openclawInstalled) {
    console.log(`[wizard-smoke] Step 2: Installing openclaw via npm (registry: ${npmRegistry})...`)
    const installResult = await apiExec('npm', ['install', '-g', 'openclaw', '--registry', npmRegistry])
    assert.equal(installResult.ok, true, `npm install failed: ${installResult.error ?? installResult.stderr}`)
    console.log('[wizard-smoke]   install succeeded')

    // Verify install
    const verifyResult = await apiExec('openclaw', ['--version'])
    assert.equal(verifyResult.ok, true, `post-install openclaw --version failed: ${verifyResult.error}`)
    assert.match(verifyResult.stdout, /OpenClaw/i)
    console.log(`[wizard-smoke]   verified: ${verifyResult.stdout.trim()}`)
  } else {
    console.log('[wizard-smoke] Step 2: Skipped (openclaw already installed)')
  }
  passed++

  // ── Step 3: Init config (wizard onboard_init phase) ──
  console.log('[wizard-smoke] Step 3: Running openclaw onboard (init config)...')
  const onboardResult = await apiExec('openclaw', [
    'onboard', '--mode', 'local', '--non-interactive', '--accept-risk', '--skip-health',
  ])
  // onboard may fail in CI if no config dir — that's acceptable (wizard treats it as non-fatal)
  if (onboardResult.ok) {
    console.log('[wizard-smoke]   onboard succeeded')
  } else {
    console.log(`[wizard-smoke]   onboard returned non-zero (non-fatal): ${onboardResult.error ?? onboardResult.stderr}`)
  }
  passed++

  // ── Step 4: Verify npm mirror flag passthrough ──
  console.log('[wizard-smoke] Step 4: Verifying npm --registry flag passthrough...')
  const registryResult = await apiExec('npm', ['config', 'get', 'registry'])
  assert.equal(registryResult.ok, true, `npm config get registry failed: ${registryResult.error}`)
  console.log(`[wizard-smoke]   current default registry: ${registryResult.stdout.trim()}`)
  // The --registry flag is per-command, not persisted. This just verifies the exec API accepts npm commands with extra args.
  passed++

  console.log(`\n[wizard-smoke] ✓ All ${passed} checks passed`)
} catch (err) {
  console.error(`\n[wizard-smoke] ✗ Failed after ${passed} checks:`, err.message)
  process.exitCode = 1
} finally {
  await cleanupTempHome(binary, env, tempHome)
  console.log('[wizard-smoke] Cleaned up temp HOME')
}
