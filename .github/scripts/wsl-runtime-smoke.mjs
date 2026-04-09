import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const port = Number.parseInt(process.env.BACKEND_PORT ?? '3001', 10)
const distro = process.env.DISTRO_NAME ?? 'Ubuntu-24.04'
const baseUrl = `http://127.0.0.1:${port}`
const smokeMarker = process.env.WSL_SMOKE_MARKER ?? 'WSL-SMOKE-MARKER'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}: ${raw}`)
  }
  return raw ? JSON.parse(raw) : null
}

async function requestVoid(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}: ${raw}`)
  }
}

async function waitForJson(path, predicate, attempts = 20, delayMs = 1500) {
  let lastValue
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastValue = await requestJson(path)
      if (!predicate || predicate(lastValue)) {
        return lastValue
      }
    } catch (error) {
      lastError = error
    }
    await sleep(delayMs)
  }
  if (lastError) {
    throw lastError
  }
  throw new Error(`Condition not met for ${path}: ${JSON.stringify(lastValue, null, 2)}`)
}

function shellEscapePosix(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`
}

function runWslShell(script) {
  return execFileSync(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-lc', script],
    { encoding: 'utf8' }
  )
}

function readWslFile(path) {
  return runWslShell(`cat ${shellEscapePosix(path)}`)
}

const baseline = await waitForJson('/api/system/detect', (value) => value?.runtime?.hostPlatform === 'win32')
assert.equal(baseline.runtime.mode, 'native')
assert.equal(baseline.runtime.wslAvailable, true)

await requestJson('/api/settings/runtime', {
  method: 'POST',
  body: JSON.stringify({
    mode: 'wsl2',
    wslDistro: distro,
  }),
})

const storedRuntime = await requestJson('/api/settings/runtime')
assert.equal(storedRuntime.mode, 'wsl2')
assert.equal(storedRuntime.wslDistro, distro)

const detect = await waitForJson(
  '/api/system/detect',
  (value) =>
    value?.runtime?.mode === 'wsl2' &&
    value?.runtime?.selectedDistro === distro &&
    value?.runtime?.selectedDistroExists === true &&
    value?.openclaw?.installed === true
)

assert.equal(detect.runtime.hostPlatform, 'win32')
assert.equal(detect.runtime.mode, 'wsl2')
assert.equal(detect.runtime.selectedDistro, distro)
assert.equal(detect.runtime.selectedDistroExists, true)
assert.ok(detect.openclaw.configPath.startsWith('/'), detect.openclaw.configPath)
assert.ok(detect.openclaw.dataDir.startsWith('/'), detect.openclaw.dataDir)

const npmExec = await requestJson('/api/exec', {
  method: 'POST',
  body: JSON.stringify({
    cmd: 'npm',
    args: ['--version'],
  }),
})
assert.equal(npmExec.ok, true, JSON.stringify(npmExec))
assert.match(npmExec.stdout, /\d+\.\d+\.\d+/)

const openclawExec = await requestJson('/api/exec', {
  method: 'POST',
  body: JSON.stringify({
    cmd: 'openclaw',
    args: ['--version'],
  }),
})
assert.equal(openclawExec.ok, true, JSON.stringify(openclawExec))
assert.match(openclawExec.stdout, /openclaw|^\d{4}\./i)

const initialConfig = await requestJson('/api/config')
assert.equal(initialConfig.gateway?.port, 18789)

await requestVoid('/api/config/gateway.port', {
  method: 'POST',
  body: JSON.stringify({ value: 19001 }),
})

const updatedConfig = await requestJson('/api/config')
assert.equal(updatedConfig.gateway?.port, 19001)

const wslConfigRaw = readWslFile(detect.openclaw.configPath)
const wslConfig = JSON.parse(wslConfigRaw)
assert.equal(wslConfig.gateway?.port, 19001)

const logs = await requestJson('/api/logs?lines=20')
assert.ok(Array.isArray(logs))
assert.ok(
  logs.some((entry) => typeof entry?.message === 'string' && entry.message.includes(smokeMarker)),
  JSON.stringify(logs, null, 2)
)

console.log(JSON.stringify({
  runtime: detect.runtime,
  openclaw: {
    version: detect.openclaw.version,
    configPath: detect.openclaw.configPath,
    dataDir: detect.openclaw.dataDir,
  },
  npmVersion: npmExec.stdout.trim(),
  smokeMarker,
}, null, 2))
