import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const smokePort = String(Number.parseInt(process.env.CLAWMASTER_SMOKE_PORT ?? '3411', 10))
const smokeToken = process.env.CLAWMASTER_SMOKE_TOKEN?.trim() || 'ci-install-smoke-token'
const smokeUrl = `http://127.0.0.1:${smokePort}`

function getNpmExecOptions() {
  return {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }
}

function getBinaryExecOptions(env) {
  return {
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    windowsHide: true,
  }
}

function resolveInstalledBinary() {
  if (process.env.CLAWMASTER_BINARY?.trim()) {
    return process.env.CLAWMASTER_BINARY.trim()
  }
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const prefix = execFileSync(npmCommand, ['prefix', '-g'], getNpmExecOptions()).trim()
  return process.platform === 'win32'
    ? path.join(prefix, 'clawmaster.cmd')
    : path.join(prefix, 'bin', 'clawmaster')
}

function formatCommand(binary, args) {
  return [binary, ...args].join(' ')
}

function assertSuccess(result, binary, args) {
  assert.equal(
    result.status,
    0,
    `${formatCommand(binary, args)} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
}

function runBinary(binary, args, env) {
  return spawnSync(binary, args, getBinaryExecOptions(env))
}

async function waitForHealthyStatus(binary, env) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = runBinary(binary, ['status', '--url', smokeUrl, '--token', smokeToken], env)
    if (result.status === 0) {
      return result.stdout
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${smokeUrl} to become reachable.`)
}

const binary = resolveInstalledBinary()
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-install-smoke-'))
const env = {
  ...process.env,
  HOME: tempHome,
  USERPROFILE: tempHome,
}

if (process.platform === 'win32') {
  env.APPDATA = path.win32.join(tempHome, 'AppData', 'Roaming')
  env.LOCALAPPDATA = path.win32.join(tempHome, 'AppData', 'Local')
}

try {
  const versionResult = runBinary(binary, ['--version'], env)
  assertSuccess(versionResult, binary, ['--version'])
  assert.match(versionResult.stdout, new RegExp(`ClawMaster v${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

  const helpResult = runBinary(binary, ['--help'], env)
  assertSuccess(helpResult, binary, ['--help'])
  assert.match(helpResult.stdout, /--silent/)

  const doctorResult = runBinary(binary, ['doctor'], env)
  assertSuccess(doctorResult, binary, ['doctor'])
  assert.doesNotMatch(doctorResult.stdout, /missing build output/i)

  const serveArgs = ['serve', '--daemon', '--silent', '--host', '127.0.0.1', '--port', smokePort, '--token', smokeToken]
  const serveResult = runBinary(binary, serveArgs, env)
  assertSuccess(serveResult, binary, serveArgs)
  assert.match(serveResult.stdout, new RegExp(`web console:\\s+${smokeUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.match(serveResult.stdout, new RegExp(`token:\\s+${smokeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.doesNotMatch(serveResult.stdout, /browser:\s+/)

  const statusOutput = await waitForHealthyStatus(binary, env)
  assert.match(statusOutput, new RegExp(`ClawMaster service is reachable at ${smokeUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

  const stopResult = runBinary(binary, ['stop'], env)
  assertSuccess(stopResult, binary, ['stop'])
  assert.match(stopResult.stdout, /Stopped ClawMaster service/)
} finally {
  runBinary(binary, ['stop'], env)
  fs.rmSync(tempHome, { recursive: true, force: true })
}
