import assert from 'node:assert/strict'
import test from 'node:test'

import { listProviderModels } from './providerCatalogService.js'

test('listProviderModels keeps OpenAI fine-tuned chat models from live catalogs', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [
      { id: 'ft:gpt-4o-mini:team:custom-123', name: 'Team Fine-Tune' },
      { id: 'text-embedding-3-large', name: 'Embedding' },
    ],
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  try {
    const result = await listProviderModels({
      providerId: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    })

    assert.deepEqual(result, [
      { id: 'ft:gpt-4o-mini:team:custom-123', name: 'Team Fine-Tune' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('listProviderModels normalizes custom OpenAI-compatible chat completions base URLs', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({
      data: [
        { id: 'glm-5.1', name: 'glm-5.1' },
      ],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const result = await listProviderModels({
      providerId: 'custom-openai-compatible',
      apiKey: 'glm-key',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    })

    assert.equal(requestedUrl, 'https://open.bigmodel.cn/api/paas/v4/models')
    assert.deepEqual(result, [
      { id: 'glm-5.1', name: 'glm-5.1' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('listProviderModels uses the native Z.AI GLM catalog endpoint', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  let requestedAuthorization = ''

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input)
    requestedAuthorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '')
    return new Response(JSON.stringify({
      data: [
        { id: 'glm-5.1', name: 'GLM-5.1' },
        { id: 'embedding-3', name: 'Embedding' },
      ],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const result = await listProviderModels({
      providerId: 'zai',
      apiKey: 'zai-key',
    })

    assert.equal(requestedUrl, 'https://api.z.ai/api/paas/v4/models')
    assert.equal(requestedAuthorization, 'Bearer zai-key')
    assert.deepEqual(result, [
      { id: 'glm-5.1', name: 'GLM-5.1' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('listProviderModels uses the Baidu BCE Qianfan coding catalog endpoint', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  let requestedAuthorization = ''

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input)
    requestedAuthorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '')
    return new Response(JSON.stringify({
      data: [
        { id: 'ernie-4.5-turbo-128k', name: 'ERNIE 4.5 Turbo' },
        { id: 'qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B' },
        { id: 'qwen3-embedding-4b', name: 'Qwen3 Embedding' },
      ],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const result = await listProviderModels({
      providerId: 'baiduqianfancodingplan',
      apiKey: 'bce-key',
    })

    assert.equal(requestedUrl, 'https://qianfan.baidubce.com/v2/coding/models')
    assert.equal(requestedAuthorization, 'Bearer bce-key')
    assert.deepEqual(result, [
      { id: 'qianfan-code-latest', name: 'Qianfan Code Latest' },
      { id: 'qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
