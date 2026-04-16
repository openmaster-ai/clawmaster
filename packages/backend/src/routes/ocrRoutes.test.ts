import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'

import { registerOcrRoutes } from './ocrRoutes.js'

test('registerOcrRoutes returns 400 for invalid JSON bodies', async () => {
  const app = express()
  app.use(express.json({ limit: '40mb' }))
  registerOcrRoutes(app)

  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/ocr/paddleocr/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    })

    assert.equal(response.status, 400)
    assert.equal(await response.text(), 'Body must be JSON')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
})

test('registerOcrRoutes returns 400 for plain-English OCR validation errors', async () => {
  const app = express()
  app.use(express.json({ limit: '40mb' }))
  app.post('/api/ocr/paddleocr/test', (_req, res) => {
    const error = new Error('Missing PaddleOCR endpoint')
    error.name = 'PaddleOcrValidationError'
    res.status(400).type('text').send(error.message)
  })

  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/ocr/paddleocr/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: '', accessToken: '' }),
    })

    assert.equal(response.status, 400)
    assert.equal(await response.text(), 'Missing PaddleOCR endpoint')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
})
