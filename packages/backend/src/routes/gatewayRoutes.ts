import type express from 'express'
import { getGatewayStatus, restartGateway, startGateway, stopGateway } from '../services/gatewayService.js'

export function registerGatewayRoutes(app: express.Express): void {
  app.get('/api/gateway/status', async (_req, res) => {
    try {
      res.json(await getGatewayStatus())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/gateway/start', async (_req, res) => {
    try {
      await startGateway()
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/gateway/stop', async (_req, res) => {
    try {
      await stopGateway()
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/gateway/restart', async (_req, res) => {
    try {
      await restartGateway()
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
