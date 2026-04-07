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
