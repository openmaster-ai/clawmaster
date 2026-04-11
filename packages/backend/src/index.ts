import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { registerDomainRoutes, attachLogsStreamServer } from './routes/index.js'
import { requireServiceAuth } from './serviceAuth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
