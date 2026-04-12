import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
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
const ARTIFACT_DIR = process.env.CLAWMASTER_DESKTOP_ARTIFACT_DIR
  ? path.resolve(process.env.CLAWMASTER_DESKTOP_ARTIFACT_DIR)
  : path.join(os.tmpdir(), 'clawmaster-desktop-artifacts')

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

    await driver.wait(
      until.elementLocated(By.css('.app-shell, .fullscreen-shell')),
      APP_READY_TIMEOUT_MS,
    )

    const body = await driver.findElement(By.css('body')).getText()
    assert.match(body, /(ClawMaster|龙虾管理大师)/)

    const appShell = await driver.findElements(By.css('.app-shell'))
    if (appShell.length > 0) {
      await runPaletteNavigation(driver, {
        query: 'settings',
        expectedPath: '/settings',
        expectedTitle: /(Settings|设置|設定)/,
      })
      await runPaletteNavigation(driver, {
        query: 'profile',
        expectedPath: '/settings',
        expectedHash: '#settings-profile',
        expectedTitle: /(Settings|设置|設定)/,
        expectedAnchorId: 'settings-profile',
      })
      await verifyDesktopSettingsSurface(driver)
      await verifyDangerZoneConfirmation(driver)
      await runPaletteNavigation(driver, {
        query: 'verify',
        expectedPath: '/capabilities',
        expectedHash: '#capability-runtime',
        expectedTitle: /(Capability Center|能力中心|機能センター)/,
        expectedAnchorId: 'capability-runtime',
      })
      await clickSidebarLink(driver, '/gateway')
      await waitForLocation(driver, '/gateway')
      await driver.wait(until.elementLocated(By.id('gateway-runtime')), NAVIGATION_TIMEOUT_MS)

      const titleText = await readTopbarTitle(driver)
      assert.match(titleText, /(Gateway|网关|ゲートウェイ)/)
      await captureDriverArtifacts(driver, 'desktop-shell-validated', {
        mode: 'webdriver',
        page: 'gateway',
        title: titleText,
      })

      return {
        mode: 'webdriver',
        details: `validated desktop shell navigation, desktop settings, and danger gating (${titleText})`,
        logs: tauriDriver.getLogs(),
      }
    }

    const startupCopy = await driver.findElement(By.css('.fullscreen-shell')).getText()
    assert.match(
      startupCopy,
      /(ClawMaster|OpenClaw|检测|Detect|Install|安装|Take over|接管)/,
    )
    await captureDriverArtifacts(driver, 'desktop-startup-shell', {
      mode: 'webdriver',
      page: 'startup',
    })

    return {
      mode: 'webdriver',
      details: 'reached desktop startup shell on a clean runtime',
      logs: tauriDriver.getLogs(),
    }
  } catch (error) {
    if (driver) {
      await captureDriverArtifacts(driver, 'desktop-smoke-failure', {
        mode: 'webdriver',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    await persistDriverLogs(tauriDriver.getLogs(), 'desktop-smoke-failure')
    throw error
  } finally {
    if (driver) {
      await settleWithin(driver.quit(), CLEANUP_TIMEOUT_MS)
    }
    await settleWithin(terminateChild(tauriDriver.child), CLEANUP_TIMEOUT_MS)
  }
}

async function openCommandPalette(driver) {
  await driver.findElement(By.css('.app-command-trigger')).click()
  await driver.wait(until.elementLocated(By.css('.command-palette-panel')), NAVIGATION_TIMEOUT_MS)
  return driver.findElement(By.css('.command-palette-input'))
}

async function waitForLocation(driver, expectedPath, expectedHash) {
  await driver.wait(async () => {
    const location = await driver.executeScript(() => ({
      pathname: window.location.pathname,
      hash: window.location.hash,
    }))
    return location.pathname === expectedPath && (expectedHash == null || location.hash === expectedHash)
  }, NAVIGATION_TIMEOUT_MS)
}

async function readTopbarTitle(driver) {
  const title = await driver.wait(
    until.elementLocated(By.css('.app-topbar-title')),
    NAVIGATION_TIMEOUT_MS,
  )
  return title.getText()
}

async function scrollElementIntoView(driver, element) {
  await driver.executeScript(
    'arguments[0].scrollIntoView({ behavior: "auto", block: "center" })',
    element,
  )
}

async function waitForAnchorInView(driver, anchorId) {
  await driver.wait(async () => {
    const result = await driver.executeScript((targetId) => {
      const target = document.getElementById(targetId)
      if (!target) return false

      const rect = target.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      return rect.top >= -24 && rect.top <= viewportHeight * 0.6
    }, anchorId)
    return result === true
  }, NAVIGATION_TIMEOUT_MS)
}

async function runPaletteNavigation(driver, options) {
  const {
    query,
    expectedPath,
    expectedHash,
    expectedTitle,
    expectedAnchorId,
  } = options

  const input = await openCommandPalette(driver)
  await input.clear()
  await input.sendKeys(query, Key.ENTER)
  await waitForLocation(driver, expectedPath, expectedHash)

  const titleText = await readTopbarTitle(driver)
  assert.match(titleText, expectedTitle)

  if (expectedAnchorId) {
    await driver.wait(until.elementLocated(By.id(expectedAnchorId)), NAVIGATION_TIMEOUT_MS)
    await waitForAnchorInView(driver, expectedAnchorId)
  }
}

async function clickSidebarLink(driver, href) {
  const link = await driver.wait(
    until.elementLocated(By.css(`.app-sidebar .app-nav-link[href="${href}"]`)),
    NAVIGATION_TIMEOUT_MS,
  )
  await link.click()
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
  const binaryPath = await ensureDesktopBinary()
  const mode = getSmokeMode()

  if (mode === 'launch') {
    return runLaunchSmoke(binaryPath)
  }

  return runWebdriverSmoke(binaryPath)
}
