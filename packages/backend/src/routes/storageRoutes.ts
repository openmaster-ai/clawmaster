import type express from 'express'
import { detectSystemInfo } from '../services/systemService.js'
import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import { getOpenclawProfileSelection } from '../openclawProfile.js'
import {
  createFallbackFileStore,
  resolveLocalDataHostEngineRoot,
  resolveLocalDataStatus,
  type LocalDataDocument,
  type LocalDataStatus,
} from '../storage.js'
import {
  getWslHomeDirSync,
  resolveSelectedWslDistroSync,
  shouldUseWslRuntime,
} from '../wslRuntime.js'

type StorageContext = {
  status: LocalDataStatus
  selectedDistro: string | null
}

let cachedContext: { key: string; expiresAt: number; value: StorageContext } | null = null
const STORAGE_CONTEXT_CACHE_MS = 10_000

function resolveStorageContext(): StorageContext {
  const runtimeSelection = getClawmasterRuntimeSelection()
  const profileSelection = getOpenclawProfileSelection()
  const selectedDistro = shouldUseWslRuntime(runtimeSelection)
    ? resolveSelectedWslDistroSync(runtimeSelection)
    : null
  const key = JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    runtimeSelection,
    profileSelection,
    selectedDistro,
  })
  const now = Date.now()
  if (cachedContext && cachedContext.key === key && cachedContext.expiresAt > now) {
    return cachedContext.value
  }

  const wslHomeDir = selectedDistro ? getWslHomeDirSync(selectedDistro) : null
  const status = resolveLocalDataStatus({
    runtimeSelection,
    profileSelection,
    hostPlatform: process.platform,
    hostArch: process.arch,
    nodeInstalled: true,
    nodeVersion: process.version,
    selectedWslDistro: selectedDistro,
    wslHomeDir,
  })
  const value = { status, selectedDistro }
  cachedContext = { key, expiresAt: now + STORAGE_CONTEXT_CACHE_MS, value }
  return value
}

function getStore() {
  const context = resolveStorageContext()
  if (context.status.state === 'blocked' || !context.status.engineRoot) {
    throw new Error(context.status.reasonCode ?? 'Local data store is unavailable')
  }
  const hostRoot = resolveLocalDataHostEngineRoot(context.status, {
    wslDistro: context.selectedDistro,
  })
  return createFallbackFileStore(context.status, hostRoot)
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
      const body = req.body as {
        documents?: LocalDataDocument[]
        replace?: { module?: string; sourceType?: string }
      }
      if (!Array.isArray(body.documents)) {
        res.status(400).type('text').send('documents must be an array')
        return
      }
      const store = await getStore()
      if (typeof body.replace?.module === 'string' && body.replace.module.trim()) {
        res.json(store.replaceDocuments(body.documents, {
          module: body.replace.module,
          sourceType: body.replace.sourceType,
        }))
        return
      }
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
