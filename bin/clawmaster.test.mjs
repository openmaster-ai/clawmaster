import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile as execFileCallback, spawn } from 'node:child_process'
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

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
    }
  }
  return new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', reject)
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

test('buildServiceLaunchUrl appends the service token for browser auto-open', () => {
  assert.equal(
    cliModule.buildServiceLaunchUrl('http://127.0.0.1:3001', 'secret-token'),
    'http://127.0.0.1:3001/?serviceToken=secret-token',
  )
})

test('resolveBrowserOpenCommand picks the native opener for each platform', () => {
  assert.deepEqual(
    cliModule.resolveBrowserOpenCommand('http://127.0.0.1:3001', { platform: 'darwin' }),
    { command: 'open', args: ['http://127.0.0.1:3001'] },
  )
  assert.deepEqual(
    cliModule.resolveBrowserOpenCommand('http://127.0.0.1:3001', { platform: 'linux' }),
    { command: 'xdg-open', args: ['http://127.0.0.1:3001'] },
  )
  assert.deepEqual(
    cliModule.resolveBrowserOpenCommand('http://127.0.0.1:3001', { platform: 'win32' }),
    { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', 'http://127.0.0.1:3001'] },
  )
})

test('isCliEntryInvocation treats npm-installed symlinks as the CLI entry', () => {
  assert.equal(
    cliModule.isCliEntryInvocation('/opt/homebrew/bin/clawmaster', {
      cliEntryPath: '/opt/homebrew/lib/node_modules/clawmaster/bin/clawmaster.mjs',
      realCliEntryPath: '/opt/homebrew/lib/node_modules/clawmaster/bin/clawmaster.mjs',
      resolvePath: (value) => value,
      realpath: (value) => value === '/opt/homebrew/bin/clawmaster'
        ? '/opt/homebrew/lib/node_modules/clawmaster/bin/clawmaster.mjs'
        : value,
    }),
    true,
  )
})

test('isCliEntryInvocation rejects unrelated binaries', () => {
  assert.equal(
    cliModule.isCliEntryInvocation('/opt/homebrew/bin/not-clawmaster', {
      cliEntryPath: '/opt/homebrew/lib/node_modules/clawmaster/bin/clawmaster.mjs',
      realCliEntryPath: '/opt/homebrew/lib/node_modules/clawmaster/bin/clawmaster.mjs',
      resolvePath: (value) => value,
      realpath: () => '/opt/homebrew/lib/node_modules/other/bin/not-clawmaster.mjs',
    }),
    false,
  )
})

test('renderServeBanner falls back to compact plain text on narrow terminals', () => {
  assert.equal(
    cliModule.renderServeBanner({
      color: false,
      columns: 20,
      version: '9.9.9',
    }),
    'CLAWMASTER v9.9.9',
  )
})

test('renderServeBanner can render a plain-text full banner without ANSI escapes', () => {
  const banner = cliModule.renderServeBanner({
    color: false,
    columns: 120,
    version: '9.9.9',
  })

  assert.match(banner, /v9\.9\.9/)
  assert.ok(banner.split('\n').length >= 13)
  assert.doesNotMatch(banner, /\x1b\[/)
})

test('formatServeReadyMessage clearly reports the console and bind addresses', () => {
  const message = cliModule.formatServeReadyMessage({
    daemon: true,
    urls: cliModule.resolveServiceUrls('0.0.0.0', '3001'),
    token: 'secret-token',
    browserRequested: true,
    ready: true,
  })

  assert.match(message, /ClawMaster service ready\./)
  assert.match(message, /web console:\s+http:\/\/127\.0\.0\.1:3001/)
  assert.match(message, /bind:\s+0\.0\.0\.0:3001/)
  assert.match(message, /token:\s+secret-token/)
  assert.match(message, /browser:\s+opening the default browser/)
  assert.match(message, /next:\s+clawmaster status \| clawmaster stop/)
})

test('formatServeReadyMessage describes deferred foreground browser launch without skipping it', () => {
  const message = cliModule.formatServeReadyMessage({
    daemon: false,
    urls: cliModule.resolveServiceUrls('127.0.0.1', '3001'),
    token: 'secret-token',
    browserRequested: true,
    ready: false,
  })

  assert.match(message, /ClawMaster service is starting\./)
  assert.match(message, /browser:\s+opening when the web console becomes reachable/)
  assert.match(message, /next:\s+Ctrl\+C to stop/)
  assert.doesNotMatch(message, /skipped/i)
})

test('resolveServiceStatePaths prefers an explicit Windows HOME override', () => {
  assert.deepEqual(
    cliModule.resolveServiceStatePaths({
      platform: 'win32',
      homeDir: 'C:\\Temp\\clawmaster-home',
      fallbackHomeDir: 'C:\\Users\\real-user',
    }),
    {
      serviceStateDir: 'C:\\Temp\\clawmaster-home\\.clawmaster\\service',
      serviceStateFile: 'C:\\Temp\\clawmaster-home\\.clawmaster\\service\\service-state.json',
    },
  )
})

test('resolveServiceStatePaths ignores non-native Windows HOME overrides', () => {
  assert.deepEqual(
    cliModule.resolveServiceStatePaths({
      platform: 'win32',
      homeDir: '/c/Users/alice',
      fallbackHomeDir: 'C:\\Users\\alice',
    }),
    {
      serviceStateDir: 'C:\\Users\\alice\\.clawmaster\\service',
      serviceStateFile: 'C:\\Users\\alice\\.clawmaster\\service\\service-state.json',
    },
  )
})

test('resolveServiceStatePaths accepts Windows UNC HOME overrides written with forward slashes', () => {
  assert.deepEqual(
    cliModule.resolveServiceStatePaths({
      platform: 'win32',
      homeDir: '//server/share/portable-home',
      fallbackHomeDir: 'C:\\Users\\alice',
    }),
    {
      serviceStateDir: '\\\\server\\share\\portable-home\\.clawmaster\\service',
      serviceStateFile: '\\\\server\\share\\portable-home\\.clawmaster\\service\\service-state.json',
    },
  )
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

test('waitForUrlReady succeeds when the web console url responds even if detect would be slower', async () => {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/api/system/detect')) {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ runtime: { mode: 'native' } }))
      }, 500)
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><title>ClawMaster</title>')
  })

  try {
    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()))
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')

    const ready = await cliModule.waitForUrlReady(
      `http://127.0.0.1:${address.port}/?serviceToken=secret-token`,
      {
        retries: 2,
        retryDelayMs: 10,
        timeoutMs: 100,
      },
    )

    assert.equal(ready, true)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
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
  assert.equal(options.windowsHide, true)
  closeSync(options.stdio[1])
  closeSync(options.stdio[2])

  rmSync(tempHome, { recursive: true, force: true })
})

test('buildServiceSpawnOptions propagates a Windows HOME override to backend env', () => {
  const options = cliModule.buildServiceSpawnOptions({
    assets: { frontendDist: 'C:\\portable-home\\frontend-dist' },
    daemon: false,
    host: '127.0.0.1',
    port: '3001',
    token: 'secret-token',
    stdoutLog: 'ignored.stdout.log',
    stderrLog: 'ignored.stderr.log',
    platform: 'win32',
    homeDir: '//server/share/portable-home',
    fallbackHomeDir: 'C:\\Users\\real-user',
  })

  assert.equal(options.env.HOME, '\\\\server\\share\\portable-home')
  assert.equal(options.env.USERPROFILE, '\\\\server\\share\\portable-home')
  assert.equal(options.env.APPDATA, '\\\\server\\share\\portable-home\\AppData\\Roaming')
  assert.equal(options.env.LOCALAPPDATA, '\\\\server\\share\\portable-home\\AppData\\Local')
})

test('help documents serve silent mode and browser auto-open', async () => {
  const tempHome = createTempHome()
  try {
    const { stdout } = await runCli(['--help'], tempHome)
    assert.match(stdout, /serve \[--host 127\.0\.0\.1] \[--port 3001] \[--daemon] \[--token <token>] \[--silent]/)
    assert.match(stdout, /opens the web console in your default browser unless you pass --silent/i)
  } finally {
    rmSync(tempHome, { recursive: true, force: true })
  }
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

test('stop kills a recorded live daemon even if the service probe is unreachable', async () => {
  const tempHome = createTempHome()
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
  })

  if (process.platform !== 'win32') {
    child.unref()
  }

  writeServiceState(tempHome, {
    pid: child.pid,
    url: 'http://127.0.0.1:9',
    token: 'stale-token',
    startedAt: '2026-04-11T00:00:00.000Z',
  })

  try {
    const { stdout, stderr } = await runCli(['stop'], tempHome)
    assert.equal(stderr, '')
    assert.match(stdout, new RegExp(`Stopped ClawMaster service \\(pid ${child.pid}\\)\\.`))

    const exit = await Promise.race([
      waitForExit(child),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for daemon to stop')), 5000)),
    ])
    assert.ok(exit)
  } finally {
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // best effort in case the CLI already stopped it
    }
    rmSync(tempHome, { recursive: true, force: true })
  }
})
