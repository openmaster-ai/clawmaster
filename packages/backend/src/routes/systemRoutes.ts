import type express from 'express'
import { detectSystemInfo } from '../services/systemService.js'
import { probeHttpStatus } from '../services/httpProbeService.js'
import { isRecord } from '../serverUtils.js'

export function registerSystemRoutes(app: express.Express): void {
  app.get('/api/system/detect', async (_req, res) => {
    try {
      res.json(await detectSystemInfo())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/system/probe-http', async (req, res) => {
    const body = req.body
    if (!isRecord(body) || typeof body.url !== 'string') {
      res.status(400).type('text').send('Body must include a url string')
      return
    }
    try {
      res.json(await probeHttpStatus({
        url: body.url,
        method: body.method === 'POST' ? 'POST' : 'GET',
        headers: isRecord(body.headers)
          ? Object.fromEntries(Object.entries(body.headers).map(([key, value]) => [key, String(value)]))
          : undefined,
        body: typeof body.body === 'string' ? body.body : undefined,
        timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      }))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
