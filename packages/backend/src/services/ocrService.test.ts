import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDefaultPaddleOcrTestFile,
  parsePaddleOcrDocument,
  testPaddleOcrConnection,
} from './ocrService.js'

test('testPaddleOcrConnection posts a sample document with Baidu token auth', async () => {
  const originalFetch = globalThis.fetch
  let callCount = 0
  globalThis.fetch = (async (input, init) => {
    callCount += 1
    if (callCount === 1) {
      assert.equal(String(input), getDefaultPaddleOcrTestFile())
      return new Response(Uint8Array.from([1, 2, 3]), { status: 200 })
    }

    assert.equal(String(input), 'https://example.com/layout-parsing')
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'token test-token')

    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(payload.file, Buffer.from(Uint8Array.from([1, 2, 3])).toString('base64'))
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

test('parsePaddleOcrDocument fetches remote URLs and forwards base64 to PaddleOCR', async () => {
  const originalFetch = globalThis.fetch
  let callCount = 0
  globalThis.fetch = (async (input, init) => {
    callCount += 1
    if (callCount === 1) {
      assert.equal(String(input), 'https://example.com/sample.jpg')
      return new Response(Uint8Array.from([4, 5, 6]), { status: 200 })
    }

    assert.equal(String(input), 'https://example.com/layout-parsing')
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(payload.file, Buffer.from(Uint8Array.from([4, 5, 6])).toString('base64'))
    assert.equal(payload.fileType, 1)

    return new Response(JSON.stringify({
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
    })
  }) as typeof fetch

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

test('parsePaddleOcrDocument strips data URL prefixes before forwarding payloads', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://example.com/layout-parsing')
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(payload.file, 'prefixed-base64')

    return new Response(JSON.stringify({
      errorCode: 0,
      errorMsg: 'Success',
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: 'hello',
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
    const result = await parsePaddleOcrDocument({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'test-token',
      file: 'data:application/pdf;base64,prefixed-base64',
      fileType: 0,
    })
    assert.equal(result.layoutParsingResults[0]?.markdown.text, 'hello')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('parsePaddleOcrDocument keeps direct base64 payloads unchanged', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), 'https://example.com/layout-parsing')
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    assert.equal(payload.file, 'already-base64')

    return new Response(JSON.stringify({
      errorCode: 0,
      errorMsg: 'Success',
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: 'hello',
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
    const result = await parsePaddleOcrDocument({
      endpoint: 'https://example.com/layout-parsing',
      accessToken: 'test-token',
      file: 'already-base64',
      fileType: 1,
    })
    assert.equal(result.layoutParsingResults[0]?.markdown.text, 'hello')
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
        file: 'already-base64',
        fileType: 1,
      }),
      /Unauthorized/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('parsePaddleOcrDocument marks missing endpoint as a validation error', async () => {
  await assert.rejects(
    () => parsePaddleOcrDocument({
      endpoint: '',
      accessToken: 'token',
      file: 'already-base64',
      fileType: 1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.name, 'PaddleOcrValidationError')
      assert.match(error.message, /Missing PaddleOCR endpoint/)
      return true
    },
  )
})
