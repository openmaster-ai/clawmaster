import type express from 'express'
import { detectSystemInfo } from '../services/systemService.js'

export function registerSystemRoutes(app: express.Express): void {
  app.get('/api/system/detect', async (_req, res) => {
    try {
      res.json(await detectSystemInfo())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
