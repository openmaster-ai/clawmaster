import { describe, expect, it } from 'vitest'
import {
  appendPathToBaseUrl,
  assertSafeProviderCatalogBaseUrl,
  buildProviderCatalogRequest,
  normalizeOpenAiCompatibleBaseUrl,
  normalizeProviderCatalogResponse,
  supportsProviderCatalog,
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

    it('preserves query strings while stripping completions suffixes', () => {
      expect(
        normalizeOpenAiCompatibleBaseUrl(
          'https://example.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21',
        ),
      ).toBe('https://example.openai.azure.com/openai/deployments/test?api-version=2024-10-21')
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

  describe('appendPathToBaseUrl', () => {
    it('inserts path suffixes before query strings', () => {
      expect(
        appendPathToBaseUrl(
          'https://example.openai.azure.com/openai/deployments/test?api-version=2024-10-21',
          '/chat/completions',
        ),
      ).toBe(
        'https://example.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21',
      )
    })
  })

  describe('custom-openai-compatible catalog', () => {
    it('supportsProviderCatalog returns true once a baseUrl is configured', () => {
      expect(supportsProviderCatalog('custom-openai-compatible', undefined)).toBe(false)
      expect(supportsProviderCatalog('custom-openai-compatible', { baseUrl: '' } as any)).toBe(false)
      expect(
        supportsProviderCatalog('custom-openai-compatible', { baseUrl: 'https://open.bigmodel.cn/api/paas/v4' } as any),
      ).toBe(true)
    })

    it('assertSafeProviderCatalogBaseUrl accepts user-supplied http/https endpoints for custom', () => {
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'https://open.bigmodel.cn/api/paas/v4'),
      ).not.toThrow()
    })

    it('assertSafeProviderCatalogBaseUrl rejects non-http(s) and embedded credentials for custom', () => {
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'ftp://example.com/v1'),
      ).toThrow(/http or https/)
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'https://user:pw@example.com/v1'),
      ).toThrow(/credentials/)
    })

    it('assertSafeProviderCatalogBaseUrl blocks private/loopback hosts to prevent SSRF', () => {
      // cloud metadata
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'http://169.254.169.254/latest/meta-data'),
      ).toThrow(/loopback, private, or link-local/)
      // loopback
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'http://127.0.0.1:8000/v1'),
      ).toThrow(/loopback, private, or link-local/)
      // RFC1918
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'http://10.0.0.1/v1'),
      ).toThrow(/loopback, private, or link-local/)
      expect(() =>
        assertSafeProviderCatalogBaseUrl('custom-openai-compatible', 'http://192.168.1.1/v1'),
      ).toThrow(/loopback, private, or link-local/)
    })

    it('buildProviderCatalogRequest targets /models with Bearer auth for custom', () => {
      const request = buildProviderCatalogRequest({
        providerId: 'custom-openai-compatible',
        apiKey: 'glm-key',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      })
      expect(request).toEqual({
        url: 'https://open.bigmodel.cn/api/paas/v4/models',
        headers: { Authorization: 'Bearer glm-key' },
      })
    })
  })
})
