import { describe, expect, it } from 'vitest'
import {
  normalizeOpenAiCompatibleBaseUrl,
  normalizeProviderCatalogResponse,
} from './providerCatalog'

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

  describe('normalizeOpenAiCompatibleBaseUrl', () => {
    it('strips /chat/completions suffix pasted from vendor docs', () => {
      expect(
        normalizeOpenAiCompatibleBaseUrl('https://open.bigmodel.cn/api/paas/v4/chat/completions'),
      ).toBe('https://open.bigmodel.cn/api/paas/v4')
    })

    it('strips /chat/completions with trailing slash', () => {
      expect(
        normalizeOpenAiCompatibleBaseUrl('https://open.bigmodel.cn/api/paas/v4/chat/completions/'),
      ).toBe('https://open.bigmodel.cn/api/paas/v4')
    })

    it('strips /v1/chat/completions to /v1 base', () => {
      expect(
        normalizeOpenAiCompatibleBaseUrl('https://api.openai.com/v1/chat/completions'),
      ).toBe('https://api.openai.com/v1')
    })

    it('strips legacy /completions suffix', () => {
      expect(normalizeOpenAiCompatibleBaseUrl('https://api.example.com/v1/completions')).toBe(
        'https://api.example.com/v1',
      )
    })

    it('leaves a clean base URL untouched', () => {
      expect(normalizeOpenAiCompatibleBaseUrl('https://api.deepseek.com/v1')).toBe(
        'https://api.deepseek.com/v1',
      )
    })

    it('trims trailing slashes and whitespace', () => {
      expect(normalizeOpenAiCompatibleBaseUrl('  https://api.deepseek.com/v1/  ')).toBe(
        'https://api.deepseek.com/v1',
      )
    })

    it('returns empty string for nullish or blank input', () => {
      expect(normalizeOpenAiCompatibleBaseUrl(undefined)).toBe('')
      expect(normalizeOpenAiCompatibleBaseUrl(null)).toBe('')
      expect(normalizeOpenAiCompatibleBaseUrl('   ')).toBe('')
    })

    it('is case-insensitive on the suffix match', () => {
      expect(
        normalizeOpenAiCompatibleBaseUrl('https://api.example.com/v1/CHAT/Completions'),
      ).toBe('https://api.example.com/v1')
    })
  })
})
