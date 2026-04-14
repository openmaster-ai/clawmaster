import express from 'express'
import { requireDangerousServiceAuth } from '../serviceAuth.js'
import {
  addManagedMemory,
  deleteManagedMemory,
  getManagedMemoryStatsPayload,
  getManagedMemoryStatusPayload,
  listManagedMemories,
  resetManagedMemory,
  searchManagedMemories,
} from '../services/managedMemory.js'
import {
  getManagedMemoryImportStatus,
  importOpenclawWorkspaceMemories,
} from '../services/managedMemoryImport.js'
import {
  getManagedMemoryBridgeStatusPayload,
  syncManagedMemoryBridge,
} from '../services/managedMemoryBridge.js'
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

function sendManagedMemoryFailure(res: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  res.status(500).type('text').send(message)
}

export function registerMemoryRoutes(app: express.Express): void {
  app.get('/api/memory/managed/status', async (_req, res) => {
    try {
      const payload = await getManagedMemoryStatusPayload()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.get('/api/memory/managed/stats', async (_req, res) => {
    try {
      const payload = await getManagedMemoryStatsPayload()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.get('/api/memory/managed/import/status', async (_req, res) => {
    try {
      const payload = await getManagedMemoryImportStatus()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.post('/api/memory/managed/import/openclaw', async (_req, res) => {
    try {
      const payload = await importOpenclawWorkspaceMemories()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.get('/api/memory/managed/list', async (req, res) => {
    try {
      const payload = await listManagedMemories({
        userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
        agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
        limit: parseLimit(req.query.limit, 20),
        offset:
          typeof req.query.offset === 'string' && Number.isFinite(Number.parseInt(req.query.offset, 10))
            ? Math.max(0, Number.parseInt(req.query.offset, 10))
            : 0,
      })
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.post('/api/memory/managed/search', express.json(), async (req, res) => {
    const body = req.body as {
      query?: string
      userId?: string
      agentId?: string
      limit?: number
    }
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) {
      return res.status(400).type('text').send('Body must be JSON: { "query": string }')
    }

    try {
      const payload = await searchManagedMemories(query, {
        userId: typeof body.userId === 'string' ? body.userId : undefined,
        agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
        limit: parseLimit(body.limit, 20),
      })
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.post('/api/memory/managed/add', express.json(), async (req, res) => {
    const body = req.body as {
      content?: string
      userId?: string
      agentId?: string
      metadata?: Record<string, unknown>
    }
    const content = typeof body?.content === 'string' ? body.content.trim() : ''
    if (!content) {
      return res.status(400).type('text').send('Body must be JSON: { "content": string }')
    }

    try {
      const payload = await addManagedMemory({
        content,
        userId: typeof body.userId === 'string' ? body.userId : undefined,
        agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
        metadata: body.metadata,
      })
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.post('/api/memory/managed/delete', express.json(), async (req, res) => {
    const memoryId = (req.body as { memoryId?: string })?.memoryId
    if (!memoryId || typeof memoryId !== 'string') {
      return res.status(400).type('text').send('Body must be JSON: { "memoryId": string }')
    }

    try {
      const deleted = await deleteManagedMemory(memoryId)
      res.json({ deleted })
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.post('/api/memory/managed/reset', requireDangerousServiceAuth, async (_req, res) => {
    try {
      const payload = await resetManagedMemory()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.get('/api/memory/managed/bridge/status', async (_req, res) => {
    try {
      const payload = await getManagedMemoryBridgeStatusPayload()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

  app.post('/api/memory/managed/bridge/sync', requireDangerousServiceAuth, async (_req, res) => {
    try {
      const payload = await syncManagedMemoryBridge()
      res.json(payload)
    } catch (error: unknown) {
      sendManagedMemoryFailure(res, error)
    }
  })

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
