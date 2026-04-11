import type express from 'express'

import {
  getMcpServersState,
  listMcpImportCandidatesState,
  persistMcpServers,
  readMcpImportFile,
  type McpServerConfig,
  type McpServersMap,
} from '../services/mcpService.js'
import { isRecord } from '../serverUtils.js'

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function normalizeMcpServerConfig(value: unknown): McpServerConfig | null {
  if (!isRecord(value)) return null

  const enabled = value.enabled !== false
  const env = isStringRecord(value.env) ? value.env : {}
  const meta = isRecord(value.meta) ? value.meta : undefined

  if ((value.transport === 'http' || value.transport === 'sse') && typeof value.url === 'string') {
    return {
      transport: value.transport,
      url: value.url,
      headers: isStringRecord(value.headers) ? value.headers : {},
      env,
      enabled,
      meta: meta
        ? {
            source: typeof meta.source === 'string' ? meta.source as 'catalog' | 'manual' | 'import' : undefined,
            importPath: typeof meta.importPath === 'string' ? meta.importPath : undefined,
            managedPackage: typeof meta.managedPackage === 'string' ? meta.managedPackage : undefined,
          }
        : undefined,
    }
  }

  if (typeof value.command !== 'string') return null
  return {
    transport: 'stdio',
    command: value.command,
    args: Array.isArray(value.args) ? value.args.map((item) => String(item)) : [],
    env,
    enabled,
    meta: meta
      ? {
          source: typeof meta.source === 'string' ? meta.source as 'catalog' | 'manual' | 'import' : undefined,
          importPath: typeof meta.importPath === 'string' ? meta.importPath : undefined,
          managedPackage: typeof meta.managedPackage === 'string' ? meta.managedPackage : undefined,
        }
      : undefined,
  }
}

function normalizeMcpServersMap(value: unknown): McpServersMap | null {
  if (!isRecord(value)) return null
  const out: McpServersMap = {}
  for (const [id, config] of Object.entries(value)) {
    const normalized = normalizeMcpServerConfig(config)
    if (!normalized) {
      return null
    }
    out[id] = normalized
  }
  return out
}

export function registerMcpRoutes(app: express.Express): void {
  app.get('/api/mcp/servers', (_req, res) => {
    try {
      res.json(getMcpServersState())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.put('/api/mcp/servers', async (req, res) => {
    try {
      const servers = normalizeMcpServersMap(req.body)
      if (!servers) {
        return res.status(400).type('text').send('Body must be a JSON object of MCP servers')
      }
      await persistMcpServers(servers)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.get('/api/mcp/import-candidates', (_req, res) => {
    try {
      res.json(listMcpImportCandidatesState())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/mcp/read-text', (req, res) => {
    const body = req.body
    if (!isRecord(body) || typeof body.path !== 'string' || !body.path.trim()) {
      res.status(400).type('text').send('Body must include a path string')
      return
    }
    try {
      res.json(readMcpImportFile(body.path))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
