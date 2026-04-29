import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { registerDomainRoutes, registerDomainJsonRoutes, attachLogsStreamServer } from './routes/index.js'
import { requireServiceAuth } from './serviceAuth.js'
import { syncInstalledBundledSkills } from './services/bundledSkills.js'
import { isGatewayWatchdogEnabledByEnv, startGatewayWatchdog, stopGatewayWatchdog } from './services/gatewayService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLAWPROBE_COST_DIGEST_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/clawprobe-cost-digest')
const ERNIE_IMAGE_PLUGIN_ROOT = path.resolve(__dirname, '../../../plugins/openclaw-ernie-image')
const CONTENT_DRAFT_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/content-draft')
const ERNIE_IMAGE_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/ernie-image')
const MODELS_DEV_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/models-dev')
const PACKAGE_DOWNLOAD_TRACKER_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/package-download-tracker')
const PADDLEOCR_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/paddleocr-doc-parsing')

if (fs.existsSync(path.join(CLAWPROBE_COST_DIGEST_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_CLAWPROBE_COST_DIGEST_SKILL_ROOT = CLAWPROBE_COST_DIGEST_SKILL_ROOT
}
if (fs.existsSync(path.join(CONTENT_DRAFT_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT = CONTENT_DRAFT_SKILL_ROOT
}
if (fs.existsSync(path.join(ERNIE_IMAGE_PLUGIN_ROOT, 'openclaw.plugin.json'))) {
  process.env.CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT = ERNIE_IMAGE_PLUGIN_ROOT
}
if (fs.existsSync(path.join(ERNIE_IMAGE_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT = ERNIE_IMAGE_SKILL_ROOT
}
if (fs.existsSync(path.join(MODELS_DEV_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT = MODELS_DEV_SKILL_ROOT
}
if (fs.existsSync(path.join(PACKAGE_DOWNLOAD_TRACKER_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_PACKAGE_DOWNLOAD_TRACKER_SKILL_ROOT = PACKAGE_DOWNLOAD_TRACKER_SKILL_ROOT
}
if (fs.existsSync(path.join(PADDLEOCR_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT = PADDLEOCR_SKILL_ROOT
}

export function resolveFrontendDistDir(): string | null {
  const explicit = process.env['CLAWMASTER_FRONTEND_DIST']?.trim()
  const candidates = [
    explicit || null,
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'packages/web/dist'),
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate
    }
  }

  return null
}

export function createApp() {
  const app = express()

  registerDomainJsonRoutes(app)
  app.use(express.json())
  app.use('/api', requireServiceAuth)
  registerDomainRoutes(app)

  const frontendDist = resolveFrontendDistDir()
  if (frontendDist) {
    app.use(express.static(frontendDist))
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'))
    })
  }

  return app
}

export function startServer() {
  try {
    const syncedSkills = syncInstalledBundledSkills()
    if (syncedSkills.length > 0) {
      console.log(`ClawMaster refreshed bundled skills: ${syncedSkills.join(', ')}`)
    }
  } catch (error) {
    console.warn(
      `ClawMaster skipped bundled skill refresh: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const app = createApp()
  const port = Number.parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? '16224', 10)
  const host = process.env.BACKEND_HOST ?? '127.0.0.1'
  const frontendDist = resolveFrontendDistDir()

  const server = app.listen(port, host, () => {
    const uiStatus = frontendDist
      ? `serving UI from ${frontendDist}`
      : 'UI assets not found; API only'
    console.log(`ClawMaster service listening on http://${host}:${port} (${uiStatus})`)
  })

  if (isGatewayWatchdogEnabledByEnv()) {
    const status = startGatewayWatchdog()
    console.log(`ClawMaster OpenClaw gateway safeguard enabled (interval ${status.intervalMs}ms)`)
    server.once('close', () => {
      stopGatewayWatchdog()
    })
  }

  attachLogsStreamServer(server)
  return server
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer()
}
