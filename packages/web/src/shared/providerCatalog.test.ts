import { describe, expect, it } from 'vitest'
import { normalizeProviderCatalogResponse } from './providerCatalog'

describe('providerCatalog', () => {
  it('keeps OpenAI fine-tuned chat models in normalized live catalogs', () => {
    const result = normalizeProviderCatalogResponse('openai', {
      data: [
        { id: 'ft:gpt-4o-mini:team:custom-123', name: 'Team Fine-Tune' },
        { id: 'text-embedding-3-large', name: 'Embedding' },
      ],
    })

    expect(result).toEqual([
      { id: 'ft:gpt-4o-mini:team:custom-123', name: 'Team Fine-Tune' },
    ])
  })
})
