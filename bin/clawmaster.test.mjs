import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { closeSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliEntry = path.join(root, 'bin', 'clawmaster.mjs')
const cliModule = await import('./clawmaster.mjs')

function createTempHome() {
  return mkdtempSync(path.join(os.tmpdir(), 'clawmaster-cli-test-'))
}

function writeServiceState(homeDir, state) {
  const dir = path.join(homeDir, '.clawmaster', 'service')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'service-state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function runCli(args, homeDir) {
  return execFile(process.execPath, [cliEntry, ...args], {
    cwd: root,
    env: {
      ...process.env,
      HOME: homeDir,
    },
  })
}

test('published package ships the backend ESM package marker', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.ok(
    Array.isArray(pkg.files) && pkg.files.includes('packages/backend/package.json'),
    'root package must publish packages/backend/package.json so dist/index.js keeps ESM semantics',
  )
})

test('resolveServiceUrls maps wildcard hosts to local probe urls', () => {
  assert.deepEqual(cliModule.resolveServiceUrls('0.0.0.0', '3001'), {
    bindHost: '0.0.0.0',
    port: '3001',
    url: 'http://127.0.0.1:3001',
    wildcard: true,
  })
  assert.deepEqual(cliModule.resolveServiceUrls('::', '3001'), {
    bindHost: '::',
    port: '3001',
    url: 'http://[::1]:3001',
    wildcard: true,
  })
  assert.deepEqual(cliModule.resolveServiceUrls('::1', '3001'), {
    bindHost: '::1',
    port: '3001',
    url: 'http://[::1]:3001',
    wildcard: false,
  })
})

test('validateServiceState preserves recorded daemons while the pid is still alive', async () => {
  const state = {
    pid: process.pid,
    url: 'http://127.0.0.1:3001',
    token: 'stale-token',
  }
  const result = await cliModule.validateServiceState(
    state,
    {
      fetcher: async () => {
        throw new Error('connection refused')
      },
    },
  )

  assert.deepEqual(result, state)
})

test('validateServiceState rejects unreachable recorded daemons when callers require a successful probe', async () => {
  const result = await cliModule.validateServiceState(
    {
      pid: process.pid,
      url: 'http://127.0.0.1:3001',
      token: 'stale-token',
    },
    {
      allowUnreachable: false,
      fetcher: async () => {
        throw new Error('connection refused')
      },
    },
  )

  assert.equal(result, null)
})

test('validateServiceState drops dead recorded daemons', async () => {
  const result = await cliModule.validateServiceState(
    {
      pid: 999999,
      url: 'http://127.0.0.1:3001',
      token: 'dead-token',
    },
    {
      fetcher: async () => ({ ok: true }),
    },
  )

  assert.equal(result, null)
})

test('getSignalExitCode returns conventional shell exit codes for forwarded signals', () => {
  assert.equal(cliModule.getSignalExitCode('SIGINT'), 130)
  assert.equal(cliModule.getSignalExitCode('SIGTERM'), 143)
  assert.equal(cliModule.getSignalExitCode('SIGUSR1'), 1)
})

test('resolveCommandProbePath prefers a Windows where result', () => {
  assert.equal(
    cliModule.resolveCommandProbePath('npm', {
      platform: 'win32',
      whereOutput: 'C:\\Program Files\\nodejs\\npm.cmd\r\n',
    }),
    'C:\\Program Files\\nodejs\\npm.cmd',
  )
})

test('resolveCommandProbePath keeps non-Windows probes unchanged', () => {
  assert.equal(
    cliModule.resolveCommandProbePath('openclaw', {
      platform: 'linux',
    }),
    'openclaw',
  )
})

test('getCommandProbeExecOptions enables the shell for Windows command shims', () => {
  assert.deepEqual(
    cliModule.getCommandProbeExecOptions({ platform: 'win32' }),
    {
      shell: true,
      windowsHide: true,
    },
  )
})

test('getCommandProbeExecOptions keeps direct exec for non-Windows platforms', () => {
  assert.deepEqual(
    cliModule.getCommandProbeExecOptions({ platform: 'linux' }),
    {
      shell: false,
      windowsHide: true,
    },
  )
})

test('buildServiceSpawnOptions preserves the caller working directory', () => {
  const tempHome = createTempHome()
  const workingDir = path.join(tempHome, 'workspace')
  mkdirSync(workingDir, { recursive: true })

  const stdoutLog = path.join(tempHome, 'stdout.log')
  const stderrLog = path.join(tempHome, 'stderr.log')
  const options = cliModule.buildServiceSpawnOptions({
    assets: { frontendDist: '/tmp/frontend-dist' },
    daemon: true,
    host: '127.0.0.1',
    port: '3001',
    token: 'secret-token',
    stdoutLog,
    stderrLog,
    workingDir,
  })

  assert.equal(options.cwd, workingDir)
  assert.equal(options.env.CLAWMASTER_FRONTEND_DIST, '/tmp/frontend-dist')
  assert.equal(options.env.CLAWMASTER_SERVICE_TOKEN, 'secret-token')
  assert.equal(options.env.BACKEND_HOST, '127.0.0.1')
  assert.equal(options.env.BACKEND_PORT, '3001')
  closeSync(options.stdio[1])
  closeSync(options.stdio[2])

  rmSync(tempHome, { recursive: true, force: true })
})

test('status --url does not reuse local daemon token or metadata for a different target', async () => {
  const tempHome = createTempHome()
  const requests = []
  const server = createServer((req, res) => {
    requests.push({
      url: req.url,
      authorization: req.headers.authorization,
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      openclaw: { installed: true, version: '1.2.3', configPath: '/tmp/openclaw.json' },
      runtime: { mode: 'native' },
    }))
  })

  try {
    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()))
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${address.port}`

    writeServiceState(tempHome, {
      pid: process.pid,
      url: 'http://127.0.0.1:3001',
      token: 'local-service-token',
      startedAt: '2026-04-11T00:00:00.000Z',
    })

    const { stdout } = await runCli(['status', '--url', url], tempHome)

    assert.match(stdout, new RegExp(`ClawMaster service is reachable at ${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.doesNotMatch(stdout, /pid:\s+/)
    assert.doesNotMatch(stdout, /started:\s+/)
    assert.equal(requests[0]?.url, '/api/system/detect')
    assert.equal(requests[0]?.authorization, undefined)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    rmSync(tempHome, { recursive: true, force: true })
  }
})

test('status reuses the local daemon token and metadata for the recorded service', async () => {
  const tempHome = createTempHome()
  const requests = []
  const token = 'local-service-token'
  const startedAt = '2026-04-11T00:00:00.000Z'
  const server = createServer((req, res) => {
    requests.push({
      url: req.url,
      authorization: req.headers.authorization,
    })
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      openclaw: { installed: true, version: '1.2.3', configPath: '/tmp/openclaw.json' },
      runtime: { mode: 'native' },
    }))
  })

  try {
    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()))
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${address.port}`

    writeServiceState(tempHome, {
      pid: process.pid,
      url,
      token,
      startedAt,
    })

    const { stdout } = await runCli(['status'], tempHome)

    assert.match(stdout, /ClawMaster service is reachable/)
    assert.match(stdout, new RegExp(`pid:\\s+${process.pid}`))
    assert.match(stdout, new RegExp(`started:\\s+${startedAt}`))
    assert.equal(requests[0]?.url, '/api/system/detect')
    assert.equal(requests[0]?.authorization, `Bearer ${token}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    rmSync(tempHome, { recursive: true, force: true })
  }
})
