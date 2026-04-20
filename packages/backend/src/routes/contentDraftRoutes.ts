import type express from 'express'
import {
  deleteContentDraftVariant,
  listContentDraftVariants,
  readContentDraftImageFile,
  readContentDraftTextFile,
} from '../services/contentDraftsService.js'

function readPathFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = (body as Record<string, unknown>).path
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function registerContentDraftRoutes(app: express.Express): void {
  app.get('/api/content-drafts', (_req, res) => {
    try {
      res.json(listContentDraftVariants())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/content-drafts/read-text', (req, res) => {
    const targetPath = readPathFromBody(req.body)
    if (!targetPath) {
      res.status(400).type('text').send('Body must include a path string')
      return
    }
    try {
      res.json(readContentDraftTextFile(targetPath))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/content-drafts/read-image', (req, res) => {
    const targetPath = readPathFromBody(req.body)
    if (!targetPath) {
      res.status(400).type('text').send('Body must include a path string')
      return
    }
    try {
      res.json(readContentDraftImageFile(targetPath))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/content-drafts/delete', (req, res) => {
    const targetPath = readPathFromBody(req.body)
    if (!targetPath) {
      res.status(400).type('text').send('Body must include a path string')
      return
    }
    try {
      res.json(deleteContentDraftVariant(targetPath))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
