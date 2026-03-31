import type express from 'express'
import { getConfig, saveConfig, setConfigPath } from '../services/configService.js'

export function registerConfigRoutes(app: express.Express): void {
  app.get('/api/config', (_req, res) => {
    res.json(getConfig())
  })

  app.put('/api/config', (req, res) => {
    try {
      saveConfig(req.body)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg === 'Body must be a JSON object') {
        res.status(400).type('text').send(msg)
      } else {
        res.status(500).type('text').send(msg)
      }
    }
  })

  app.use(async (req, res, next) => {
    if (req.method !== 'POST') return next()
    if (!req.path.startsWith('/api/config/')) return next()
    const pathKey = decodeURIComponent(req.path.slice('/api/config/'.length))
    if (!pathKey) return next()
    const value = (req.body as { value?: unknown })?.value
    try {
      await setConfigPath(pathKey, value)
      return res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return res.status(500).type('text').send(msg)
    }
  })
}
