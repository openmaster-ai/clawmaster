import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDefaultPaddleOcrTestFile,
  parsePaddleOcrDocument,
  testPaddleOcrConnection,
} from './ocrService.js'

test('testPaddleOcrConnection posts a sample document with Baidu token auth', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://example.com/layout-parsing')
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'token test-token')

    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(payload.file, getDefaultPaddleOcrTestFile())
    assert.equal(payload.fileType, 1)
    assert.equal(payload.visualize, false)

    return new Response(JSON.stringify({
      errorCode: 0,
      errorMsg: 'Success',
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: '# Sample',
              images: {},
            },
          },
        ],
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }) as typeof fetch

  try {
    const result = await testPaddleOcrConnection({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'test-token',
    })

    assert.deepEqual(result, {
      ok: true,
      sampleFile: getDefaultPaddleOcrTestFile(),
      pageCount: 1,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('parsePaddleOcrDocument returns the OCR result payload', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    errorCode: 0,
    errorMsg: 'Success',
    result: {
      layoutParsingResults: [
        {
          markdown: {
            text: 'hello',
            images: { 'img-1.png': 'abc123' },
          },
          outputImages: { page: 'xyz987' },
        },
      ],
      dataInfo: { pageCount: 1 },
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })) as typeof fetch

  try {
    const result = await parsePaddleOcrDocument({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'test-token',
      file: 'https://example.com/sample.jpg',
      fileType: 1,
      useLayoutDetection: true,
      prettifyMarkdown: true,
    })

    assert.equal(result.layoutParsingResults[0]?.markdown.text, 'hello')
    assert.deepEqual(result.dataInfo, { pageCount: 1 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('parsePaddleOcrDocument surfaces provider-side errors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    errorCode: 401,
    errorMsg: 'Unauthorized',
  }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
    },
  })) as typeof fetch

  try {
    await assert.rejects(
      () => parsePaddleOcrDocument({
        endpoint: 'https://example.com/layout-parsing',
        accessToken: 'bad-token',
        file: 'https://example.com/sample.jpg',
        fileType: 1,
      }),
      /Unauthorized/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
