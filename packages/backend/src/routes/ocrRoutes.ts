import type express from 'express'
import {
  parsePaddleOcrDocument,
  testPaddleOcrConnection,
  type PaddleOcrParseRequest,
  type PaddleOcrTestRequest,
} from '../services/ocrService.js'
import { isRecord } from '../serverUtils.js'

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function parseFileType(value: unknown): 0 | 1 | undefined {
  return value === 0 || value === 1 ? value : undefined
}

function parseBaseRequest(body: Record<string, unknown>) {
  return {
    endpoint: typeof body.endpoint === 'string' ? body.endpoint : '',
    accessToken: typeof body.accessToken === 'string' ? body.accessToken : '',
    fileType: parseFileType(body.fileType),
    useDocOrientationClassify: parseBoolean(body.useDocOrientationClassify),
    useDocUnwarping: parseBoolean(body.useDocUnwarping),
    useLayoutDetection: parseBoolean(body.useLayoutDetection),
    useChartRecognition: parseBoolean(body.useChartRecognition),
    restructurePages: parseBoolean(body.restructurePages),
    mergeTables: parseBoolean(body.mergeTables),
    relevelTitles: parseBoolean(body.relevelTitles),
    prettifyMarkdown: parseBoolean(body.prettifyMarkdown),
    visualize: parseBoolean(body.visualize),
  }
}

export function registerOcrRoutes(app: express.Express): void {
  app.post('/api/ocr/paddleocr/test', async (req, res) => {
    if (!isRecord(req.body)) {
      return res.status(400).type('text').send('Body must be JSON')
    }

    const body = req.body as Record<string, unknown>
    const payload: PaddleOcrTestRequest = {
      ...parseBaseRequest(body),
      file: typeof body.file === 'string' ? body.file : undefined,
    }

    try {
      res.json(await testPaddleOcrConnection(payload))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(message)
    }
  })

  app.post('/api/ocr/paddleocr/parse', async (req, res) => {
    if (!isRecord(req.body)) {
      return res.status(400).type('text').send('Body must be JSON')
    }

    const body = req.body as Record<string, unknown>
    const payload: PaddleOcrParseRequest = {
      ...parseBaseRequest(body),
      file: typeof body.file === 'string' ? body.file : '',
    }

    try {
      res.json(await parsePaddleOcrDocument(payload))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(message)
    }
  })
}
