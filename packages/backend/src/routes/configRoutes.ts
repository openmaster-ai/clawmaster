import fs from 'node:fs'
import path from 'node:path'
import type express from 'express'
import { getConfig, saveConfig, setConfigPath } from '../services/configService.js'

const PACKAGED_PLUGIN_ENV_BY_ID: Record<string, string> = {
  'memory-clawmaster-powermem': 'CLAWMASTER_PACKAGED_MEMORY_PLUGIN_ROOT',
  'openclaw-ernie-image': 'CLAWMASTER_PACKAGED_ERNIE_IMAGE_PLUGIN_ROOT',
}

function pluginManifestMatchesId(pluginRoot: string, pluginId: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(pluginRoot, 'openclaw.plugin.json'), 'utf8')
    const parsed = JSON.parse(raw) as { id?: unknown }
    return typeof parsed.id === 'string' && parsed.id.trim() === pluginId
  } catch {
    return false
  }
}

function resolvePluginRoot(pluginId: string, candidates: string[] = []): string | null {
  const envKey = PACKAGED_PLUGIN_ENV_BY_ID[pluginId]
  if (!envKey) {
    throw new Error(`Unsupported plugin id: ${pluginId}`)
  }

  const envRoot = process.env[envKey]?.trim()
  const searchRoots = [...candidates, envRoot || ''].filter(Boolean)
  for (const candidate of searchRoots) {
    if (pluginManifestMatchesId(candidate, pluginId)) {
      return candidate
    }
  }

  return null
}

export function registerConfigRoutes(app: express.Express): void {
  app.get('/api/config', (_req, res) => {
    res.json(getConfig())
  })

  app.post('/api/config/resolve-plugin-root', (req, res) => {
    const body = req.body as { pluginId?: unknown; candidates?: unknown } | undefined
    const pluginId = typeof body?.pluginId === 'string' ? body.pluginId.trim() : ''
    const candidates = Array.isArray(body?.candidates)
      ? body.candidates.filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      : []

    if (!pluginId || !/^[a-zA-Z0-9._-]+$/.test(pluginId)) {
      res.status(400).type('text').send('Invalid plugin id')
      return
    }

    try {
      res.json({ path: resolvePluginRoot(pluginId, candidates) })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      const status = msg.startsWith('Unsupported plugin id:') ? 400 : 500
      res.status(status).type('text').send(msg)
    }
  })

  app.put('/api/config', (req, res) => {
    try {
      saveConfig(req.body)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg === 'Body must be a JSON object') {
        res.status(400).type('text').send(msg)
      } else {
        res.status(500).type('text').send(msg)
      }
    }
  })

  app.use(async (req, res, next) => {
    if (req.method !== 'POST') return next()
    if (!req.path.startsWith('/api/config/')) return next()
    const pathKey = decodeURIComponent(req.path.slice('/api/config/'.length))
    if (!pathKey) return next()
    const value = (req.body as { value?: unknown })?.value
    try {
      await setConfigPath(pathKey, value)
      return res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      const status = msg.startsWith('Unsafe config path segment:') ? 400 : 500
      return res.status(status).type('text').send(msg)
    }
  })
}
