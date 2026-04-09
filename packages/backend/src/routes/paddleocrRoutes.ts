import type express from 'express'

import {
  clearPaddleOcr,
  getPaddleOcrStatus,
  PADDLEOCR_DOC_SKILL_ID,
  PADDLEOCR_TEXT_SKILL_ID,
  previewPaddleOcr,
  setupPaddleOcr,
} from '../services/paddleocrService.js'
import { isRecord } from '../serverUtils.js'

export function registerPaddleOcrRoutes(app: express.Express): void {
  app.get('/api/paddleocr/status', (_req, res) => {
    try {
      res.json(getPaddleOcrStatus())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(message)
    }
  })

  app.post('/api/paddleocr/setup', async (req, res) => {
    const body = req.body
    if (
      !isRecord(body) ||
      typeof body.moduleId !== 'string' ||
      typeof body.apiUrl !== 'string' ||
      typeof body.accessToken !== 'string'
    ) {
      return res
        .status(400)
        .type('text')
        .send(
          'Body must be JSON: { "moduleId": "paddleocr-text-recognition" | "paddleocr-doc-parsing", "apiUrl": string, "accessToken": string }',
        )
    }

    if (
      body.moduleId !== PADDLEOCR_TEXT_SKILL_ID &&
      body.moduleId !== PADDLEOCR_DOC_SKILL_ID
    ) {
      return res
        .status(400)
        .type('text')
        .send('moduleId must be "paddleocr-text-recognition" or "paddleocr-doc-parsing".')
    }

    try {
      const status = await setupPaddleOcr({
        moduleId: body.moduleId,
        apiUrl: body.apiUrl,
        accessToken: body.accessToken,
      })
      res.json(status)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const statusCode =
        /required|valid|must be|rejected the access token/i.test(message)
          ? 400
          : /quota/i.test(message)
            ? 429
            : /unavailable|timed out|failed/i.test(message)
              ? 502
              : 500
      res.status(statusCode).type('text').send(message)
    }
  })

  app.post('/api/paddleocr/preview', async (req, res) => {
    const body = req.body
    if (
      !isRecord(body) ||
      typeof body.moduleId !== 'string' ||
      typeof body.apiUrl !== 'string' ||
      typeof body.accessToken !== 'string'
    ) {
      return res
        .status(400)
        .type('text')
        .send(
          'Body must be JSON: { "moduleId": "paddleocr-text-recognition" | "paddleocr-doc-parsing", "apiUrl": string, "accessToken": string }',
        )
    }

    if (
      body.moduleId !== PADDLEOCR_TEXT_SKILL_ID &&
      body.moduleId !== PADDLEOCR_DOC_SKILL_ID
    ) {
      return res
        .status(400)
        .type('text')
        .send('moduleId must be "paddleocr-text-recognition" or "paddleocr-doc-parsing".')
    }

    try {
      const preview = await previewPaddleOcr({
        moduleId: body.moduleId,
        apiUrl: body.apiUrl,
        accessToken: body.accessToken,
      })
      res.json(preview)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const statusCode =
        /required|valid|must be|rejected the access token/i.test(message)
          ? 400
          : /quota/i.test(message)
            ? 429
            : /unavailable|timed out|failed/i.test(message)
              ? 502
              : 500
      res.status(statusCode).type('text').send(message)
    }
  })

  app.post('/api/paddleocr/clear', async (req, res) => {
    const body = req.body
    if (!isRecord(body) || typeof body.moduleId !== 'string') {
      return res
        .status(400)
        .type('text')
        .send(
          'Body must be JSON: { "moduleId": "paddleocr-text-recognition" | "paddleocr-doc-parsing" }',
        )
    }

    if (
      body.moduleId !== PADDLEOCR_TEXT_SKILL_ID &&
      body.moduleId !== PADDLEOCR_DOC_SKILL_ID
    ) {
      return res
        .status(400)
        .type('text')
        .send('moduleId must be "paddleocr-text-recognition" or "paddleocr-doc-parsing".')
    }

    try {
      const status = await clearPaddleOcr({ moduleId: body.moduleId })
      res.json(status)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(message)
    }
  })
}
