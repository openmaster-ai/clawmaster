import type express from 'express'

import {
  deleteOllamaModel,
  detectOllamaInstallation,
  getOllamaStatusService,
  installOllamaService,
  isOllamaRunningService,
  listOllamaModels,
  pullOllamaModel,
  startOllamaService,
} from '../services/ollamaService.js'
import { isRecord } from '../serverUtils.js'

export function registerOllamaRoutes(app: express.Express): void {
  app.get('/api/ollama/detect', async (_req, res) => {
    try {
      res.json(await detectOllamaInstallation())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/ollama/status', async (req, res) => {
    const baseUrl = typeof req.query.baseUrl === 'string' && req.query.baseUrl.trim()
      ? req.query.baseUrl.trim()
      : 'http://localhost:11434'
    try {
      res.json(await getOllamaStatusService(baseUrl))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/ollama/models', async (req, res) => {
    const baseUrl = typeof req.query.baseUrl === 'string' && req.query.baseUrl.trim()
      ? req.query.baseUrl.trim()
      : 'http://localhost:11434'
    try {
      res.json(await listOllamaModels(baseUrl))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/ollama/running', async (req, res) => {
    const baseUrl = typeof req.query.baseUrl === 'string' && req.query.baseUrl.trim()
      ? req.query.baseUrl.trim()
      : 'http://localhost:11434'
    try {
      res.json({ running: await isOllamaRunningService(baseUrl) })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/ollama/install', async (_req, res) => {
    try {
      res.json({ status: await installOllamaService() })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/ollama/start', async (_req, res) => {
    try {
      res.json({ status: await startOllamaService() })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/ollama/pull', async (req, res) => {
    const body = req.body
    if (!isRecord(body) || typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).type('text').send('Body must include a model name')
      return
    }
    try {
      res.json({ status: await pullOllamaModel(body.name.trim()) })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/ollama/delete', async (req, res) => {
    const body = req.body
    if (!isRecord(body) || typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).type('text').send('Body must include a model name')
      return
    }
    try {
      res.json({ status: await deleteOllamaModel(body.name.trim()) })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
