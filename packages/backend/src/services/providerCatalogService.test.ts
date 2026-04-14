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
