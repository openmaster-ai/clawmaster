import express from 'express'
import {
  assistWithWiki,
  evolveWiki,
  getWikiPage,
  getWikiStatus,
  ingestWikiSource,
  lintWiki,
  listWikiPages,
  planWikiLinkChoice,
  queryWiki,
  searchWiki,
  synthesizeWiki,
  type WikiIngestInput,
  type WikiSynthesizeInput,
} from '../services/wikiService.js'

const WRITE_ROUTE_CONTEXT = { autoEvolveOnWrite: true } as const

function parseLimit(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(50, Math.floor(parsed))
}

function sendWikiError(res: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const status = /not found/i.test(message) ? 404 : /required|invalid/i.test(message) ? 400 : 500
  res.status(status).type('text').send(message)
}

export function registerWikiRoutes(app: express.Express): void {
  app.get('/api/wiki/status', async (_req, res) => {
    try {
      res.json(await getWikiStatus())
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.get('/api/wiki/pages', async (_req, res) => {
    try {
      res.json(await listWikiPages())
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.get('/api/wiki/pages/:id', async (req, res) => {
    try {
      res.json(await getWikiPage(req.params.id))
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/search', express.json(), async (req, res) => {
    const body = req.body as { query?: string; limit?: number }
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) {
      return res.status(400).type('text').send('Body must be JSON: { "query": string }')
    }
    try {
      res.json(await searchWiki(query, { limit: parseLimit(body.limit, 12) }))
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/ingest', express.json({ limit: '2mb' }), async (req, res) => {
    const body = req.body as WikiIngestInput
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).type('text').send('Body must be JSON')
    }
    try {
      res.json(await ingestWikiSource(body, WRITE_ROUTE_CONTEXT))
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/query', express.json(), async (req, res) => {
    const body = req.body as { query?: string; limit?: number }
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) {
      return res.status(400).type('text').send('Body must be JSON: { "query": string }')
    }
    try {
      res.json(await queryWiki(query, { limit: parseLimit(body.limit, 6) }))
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/assist', express.json(), async (req, res) => {
    const body = req.body as { question?: string; query?: string; limit?: number }
    const question =
      typeof body?.question === 'string'
        ? body.question.trim()
        : typeof body?.query === 'string'
          ? body.query.trim()
          : ''
    if (!question) {
      return res.status(400).type('text').send('Body must be JSON: { "question": string }')
    }
    try {
      res.json(await assistWithWiki(question, { limit: parseLimit(body.limit, 6) }))
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/link-choice', express.json(), async (req, res) => {
    const body = req.body as { input?: string; text?: string }
    const input =
      typeof body?.input === 'string'
        ? body.input
        : typeof body?.text === 'string'
          ? body.text
          : ''
    if (!input.trim()) {
      return res.status(400).type('text').send('Body must be JSON: { "input": string }')
    }
    res.json(planWikiLinkChoice(input))
  })

  app.post('/api/wiki/synthesize', express.json(), async (req, res) => {
    const body = req.body as WikiSynthesizeInput
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) {
      return res.status(400).type('text').send('Body must be JSON: { "query": string }')
    }
    try {
      res.json(await synthesizeWiki({
        query,
        title: typeof body.title === 'string' ? body.title : undefined,
        limit: parseLimit(body.limit, 5),
      }, WRITE_ROUTE_CONTEXT))
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/lint', async (_req, res) => {
    try {
      res.json(await lintWiki())
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })

  app.post('/api/wiki/evolve', async (_req, res) => {
    try {
      res.json(await evolveWiki())
    } catch (error: unknown) {
      sendWikiError(res, error)
    }
  })
}
