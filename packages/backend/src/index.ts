import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { registerDomainRoutes, registerDomainJsonRoutes, attachLogsStreamServer } from './routes/index.js'
import { requireServiceAuth } from './serviceAuth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ERNIE_IMAGE_PLUGIN_ROOT = path.resolve(__dirname, '../../../plugins/openclaw-ernie-image')
const ERNIE_IMAGE_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/ernie-image')
const PADDLEOCR_SKILL_ROOT = path.resolve(__dirname, '../../../bundled-skills/paddleocr-doc-parsing')

if (fs.existsSync(path.join(ERNIE_IMAGE_PLUGIN_ROOT, 'openclaw.plugin.json'))) {
  process.env.CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT = ERNIE_IMAGE_PLUGIN_ROOT
}
if (fs.existsSync(path.join(ERNIE_IMAGE_SKILL_ROOT, 'SKILL.md'))) {
  process.env.CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT = ERNIE_IMAGE_SKILL_ROOT
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
  const app = createApp()
  const port = Number.parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? '3001', 10)
  const host = process.env.BACKEND_HOST ?? '127.0.0.1'
  const frontendDist = resolveFrontendDistDir()

  const server = app.listen(port, host, () => {
    const uiStatus = frontendDist
      ? `serving UI from ${frontendDist}`
      : 'UI assets not found; API only'
    console.log(`OpenClaw Manager Service on http://${host}:${port} (${uiStatus})`)
  })

  attachLogsStreamServer(server)
  return server
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer()
}
