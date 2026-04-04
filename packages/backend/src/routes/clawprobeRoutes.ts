import type express from 'express'
import { clawprobeBootstrap, clawprobeConfig, clawprobeCost, clawprobeStatus, clawprobeSuggest } from '../services/clawprobeService.js'

export function registerClawprobeRoutes(app: express.Express): void {
  app.get('/api/clawprobe/status', async (_req, res) => {
    try {
      res.json(await clawprobeStatus())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/clawprobe/cost', async (req, res) => {
    try {
      const period = String(req.query.period ?? 'week')
      res.json(await clawprobeCost(period))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('period must be')) {
        res.status(400).type('text').send(msg)
      } else {
        res.status(500).type('text').send(msg)
      }
    }
  })

  app.get('/api/clawprobe/suggest', async (_req, res) => {
    try {
      res.json(await clawprobeSuggest())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/clawprobe/config', async (_req, res) => {
    try {
      res.json(await clawprobeConfig())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/clawprobe/bootstrap', async (_req, res) => {
    try {
      res.json(await clawprobeBootstrap())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
