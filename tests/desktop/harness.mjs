import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { Builder, By, Capabilities, Key, until } from 'selenium-webdriver'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const repoRoot = path.resolve(__dirname, '../..')

const TAURI_DRIVER_PORT = 4444
const BUILD_TIMEOUT_MS = 10 * 60_000
const APP_READY_TIMEOUT_MS = 45_000
const MAC_LAUNCH_SMOKE_MS = 5_000

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
  } finally {
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
  const tauriDriver = await startTauriDriver()
  let driver

  try {
    const capabilities = new Capabilities()
    capabilities.setBrowserName('wry')
    capabilities.set('tauri:options', { application: binaryPath })

    driver = await new Builder()
      .usingServer(`http://127.0.0.1:${TAURI_DRIVER_PORT}`)
      .withCapabilities(capabilities)
      .build()

    await driver.wait(async () => {
      const [shells, fullscreenShells] = await Promise.all([
        driver.findElements(By.css('.app-shell')),
        driver.findElements(By.css('.fullscreen-shell')),
      ])

      return shells.length > 0 || fullscreenShells.length > 0
    }, APP_READY_TIMEOUT_MS)

    const body = await driver.findElement(By.css('body')).getText()
    assert.match(body, /(ClawMaster|龙虾管理大师)/)

    const appShell = await driver.findElements(By.css('.app-shell'))
    if (appShell.length > 0) {
      await driver.findElement(By.css('.app-command-trigger')).click()
      await driver.wait(until.elementLocated(By.css('.command-palette-panel')), 10_000)

      const input = await driver.findElement(By.css('.command-palette-input'))
      await input.sendKeys('settings', Key.ENTER)

      const title = await driver.wait(
        until.elementLocated(By.css('.app-topbar-title')),
        10_000,
      )
      const titleText = await title.getText()
      assert.match(titleText, /(Settings|设置|設定)/)

      return {
        mode: 'webdriver',
        details: `navigated to settings via command palette (${titleText})`,
        logs: tauriDriver.getLogs(),
      }
    }

    const startupCopy = await driver.findElement(By.css('.fullscreen-shell')).getText()
    assert.match(
      startupCopy,
      /(ClawMaster|OpenClaw|检测|Detect|Install|安装|Take over|接管)/,
    )

    return {
      mode: 'webdriver',
      details: 'reached desktop startup shell on a clean runtime',
      logs: tauriDriver.getLogs(),
    }
  } finally {
    if (driver) {
      await driver.quit().catch(() => {})
    }
    await terminateChild(tauriDriver.child)
  }
}

export async function runDesktopSmoke() {
  const binaryPath = await ensureDesktopBinary()
  const mode = getSmokeMode()

  if (mode === 'launch') {
    return runLaunchSmoke(binaryPath)
  }

  return runWebdriverSmoke(binaryPath)
}
