import type express from 'express'
import { detectSystemInfo } from '../services/systemService.js'
import {
  createFallbackFileStore,
  resolveLocalDataHostEngineRoot,
  type LocalDataDocument,
} from '../storage.js'

async function getStore() {
  const info = await detectSystemInfo()
  if (info.storage.state === 'blocked' || !info.storage.engineRoot) {
    throw new Error(info.storage.reasonCode ?? 'Local data store is unavailable')
  }
  const hostRoot = resolveLocalDataHostEngineRoot(info.storage, {
    wslDistro: info.runtime.selectedDistro,
  })
  return createFallbackFileStore(info.storage, hostRoot)
}

export function registerStorageRoutes(app: express.Express): void {
  app.get('/api/storage/status', async (_req, res) => {
    try {
      const info = await detectSystemInfo()
      res.json(info.storage)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/storage/stats', async (_req, res) => {
    try {
      const store = await getStore()
      res.json(store.stats())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/storage/documents', async (req, res) => {
    try {
      const body = req.body as { documents?: LocalDataDocument[] }
      if (!Array.isArray(body.documents)) {
        res.status(400).type('text').send('documents must be an array')
        return
      }
      const store = await getStore()
      res.json(store.upsertDocuments(body.documents))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/storage/search', async (req, res) => {
    try {
      const body = req.body as { query?: string; module?: string; limit?: number }
      const query = typeof body.query === 'string' ? body.query : ''
      const module = typeof body.module === 'string' && body.module.trim() ? body.module.trim() : undefined
      const limit = typeof body.limit === 'number' ? body.limit : undefined
      const store = await getStore()
      res.json(store.search({ query, module, limit }))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/storage/rebuild', async (_req, res) => {
    try {
      const store = await getStore()
      res.json(store.rebuild())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/storage/reset', async (_req, res) => {
    try {
      const store = await getStore()
      res.json(store.reset())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
