import express from 'express'
import {
  deleteOpenclawMemoryFile,
  getOpenclawMemorySearchCapability,
  getOpenclawMemoryStatusPayload,
  listOpenclawMemoryFiles,
  reindexOpenclawMemory,
  searchOpenclawMemoryJson,
} from '../services/memoryOpenclaw.js'
import { sendOpenclawFailure } from '../serverUtils.js'

function parseLimit(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(200, n)
}

export function registerMemoryRoutes(app: express.Express): void {
  app.get('/api/memory/openclaw/status', async (_req, res) => {
    try {
      const payload = await getOpenclawMemoryStatusPayload()
      res.json(payload)
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.get('/api/memory/openclaw/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) {
      return res.json([])
    }
    const agent = typeof req.query.agent === 'string' ? req.query.agent : undefined
    const maxResults = parseLimit(req.query.max, 20)
    try {
      const hits = await searchOpenclawMemoryJson(q, { agent, maxResults })
      res.json(hits)
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.get('/api/memory/openclaw/search-capability', async (_req, res) => {
    try {
      const payload = await getOpenclawMemorySearchCapability()
      res.json(payload)
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/memory/openclaw/reindex', async (_req, res) => {
    try {
      const payload = await reindexOpenclawMemory()
      res.json(payload)
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.get('/api/memory/openclaw/files', async (_req, res) => {
    try {
      const payload = await listOpenclawMemoryFiles()
      res.json(payload)
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/memory/openclaw/files/delete', express.json(), async (req, res) => {
    const relativePath = (req.body as { relativePath?: string })?.relativePath
    if (!relativePath || typeof relativePath !== 'string') {
      return res.status(400).type('text').send('Body must be JSON: { "relativePath": string }')
    }
    try {
      await deleteOpenclawMemoryFile(relativePath)
      res.status(204).end()
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })
}
