import { describe, expect, it } from 'vitest'
import { isOnboardingEnvironmentReady } from '../onboardingReadiness'

describe('isOnboardingEnvironmentReady', () => {
  it('returns true when a provider is configured', () => {
    expect(
      isOnboardingEnvironmentReady(
        {
          nodejs: { installed: true, version: '22.0.0' },
          npm: { installed: true, version: '11.0.0' },
          openclaw: {
            installed: true,
            version: '2026.4.7',
            configPath: '/Users/test/.openclaw/openclaw.json',
            existingConfigPaths: ['/Users/test/.openclaw/openclaw.json'],
          },
        },
        {
          models: {
            providers: {
              siliconflow: {
                apiKey: 'sk-test',
                models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' }],
              },
            },
          },
        },
      ),
    ).toBe(true)
  })

  it('returns true when channels already exist', () => {
    expect(
      isOnboardingEnvironmentReady(
        {
          nodejs: { installed: true, version: '22.0.0' },
          npm: { installed: true, version: '11.0.0' },
          openclaw: {
            installed: true,
            version: '2026.4.7',
            configPath: '/Users/test/.openclaw/openclaw.json',
            existingConfigPaths: ['/Users/test/.openclaw/openclaw.json'],
          },
        },
        {
          channels: {
            discord: {
              enabled: true,
            },
          },
        },
      ),
    ).toBe(true)
  })

  it('returns false when only an image-only provider is configured', () => {
    expect(
      isOnboardingEnvironmentReady(
        {
          nodejs: { installed: true, version: '22.0.0' },
          npm: { installed: true, version: '11.0.0' },
          openclaw: {
            installed: true,
            version: '2026.4.7',
            configPath: '/Users/test/.openclaw/openclaw.json',
            existingConfigPaths: ['/Users/test/.openclaw/openclaw.json'],
          },
        },
        {
          models: {
            providers: {
              'baidu-aistudio-image': {
                apiKey: 'bce-image-token',
                baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
                models: [{ id: 'ernie-image-turbo', name: 'ERNIE-Image Turbo' }],
              },
            },
          },
        },
      ),
    ).toBe(false)
  })

  it('returns false when only an aliased image provider is configured under a shared runtime key', () => {
    expect(
      isOnboardingEnvironmentReady(
        {
          nodejs: { installed: true, version: '22.0.0' },
          npm: { installed: true, version: '11.0.0' },
          openclaw: {
            installed: true,
            version: '2026.4.7',
            configPath: '/Users/test/.openclaw/openclaw.json',
            existingConfigPaths: ['/Users/test/.openclaw/openclaw.json'],
          },
        },
        {
          models: {
            providers: {
              openai: {
                apiKey: 'sk-image-only',
                imageApiKey: 'sk-image-only',
              },
            },
          },
        },
      ),
    ).toBe(false)
  })

  it('returns true when a shared runtime key also has text-provider models configured', () => {
    expect(
      isOnboardingEnvironmentReady(
        {
          nodejs: { installed: true, version: '22.0.0' },
          npm: { installed: true, version: '11.0.0' },
          openclaw: {
            installed: true,
            version: '2026.4.7',
            configPath: '/Users/test/.openclaw/openclaw.json',
            existingConfigPaths: ['/Users/test/.openclaw/openclaw.json'],
          },
        },
        {
          models: {
            providers: {
              openai: {
                apiKey: 'sk-openai',
                imageApiKey: 'sk-openai-image',
                models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
              },
            },
          },
        },
      ),
    ).toBe(true)
  })

  it('returns false for a fresh empty environment', () => {
    expect(
      isOnboardingEnvironmentReady(
        {
          nodejs: { installed: true, version: '22.0.0' },
          npm: { installed: true, version: '11.0.0' },
          openclaw: {
            installed: false,
            version: '',
            configPath: '/Users/test/.openclaw/openclaw.json',
            existingConfigPaths: [],
          },
        },
        {},
      ),
    ).toBe(false)
  })
})
