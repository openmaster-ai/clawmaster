import type express from 'express'
import { cancelWhatsAppLogin, getWhatsAppLoginStatus, pollWhatsAppLoginStatus, startWhatsAppLogin } from '../services/whatsappLogin.js'
import { deleteBinding, listBindings, upsertBinding } from '../services/bindingsApi.js'

export function registerBindingsAndWhatsAppRoutes(app: express.Express): void {
  app.post('/api/whatsapp/login/start', async (_req, res) => {
    try {
      const out = await startWhatsAppLogin()
      res.json(out)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/whatsapp/login/status', async (_req, res) => {
    try {
      const current = getWhatsAppLoginStatus()
      if (current.status === 'pending') {
        const polled = await pollWhatsAppLoginStatus()
        return res.json(polled)
      }
      res.json(current)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/whatsapp/login/cancel', (_req, res) => {
    try {
      res.json(cancelWhatsAppLogin())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/bindings', (_req, res) => {
    try {
      res.json(listBindings())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/bindings/upsert', async (req, res) => {
    const body = req.body as { channel?: unknown; agentId?: unknown }
    if (typeof body.channel !== 'string' || typeof body.agentId !== 'string') {
      return res.status(400).type('text').send('Body must be JSON: { "channel": string, "agentId": string }')
    }
    try {
      await upsertBinding(body.channel, body.agentId)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(400).type('text').send(msg)
    }
  })

  app.delete('/api/bindings', async (req, res) => {
    const channel = typeof req.query.channel === 'string' ? req.query.channel : ''
    if (!channel.trim()) {
      return res.status(400).type('text').send('Missing query param: channel')
    }
    try {
      await deleteBinding(channel)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(400).type('text').send(msg)
    }
  })
}
