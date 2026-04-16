import { describe, expect, it } from 'vitest'
import { getToolModelRecommendations } from '../toolModelRecommendations'

describe('getToolModelRecommendations', () => {
  it('prefers strong configured text models and keeps provider examples diverse', () => {
    const recommendations = getToolModelRecommendations({
      agents: {
        defaults: {
          model: { primary: 'siliconflow/Pro/moonshotai/Kimi-K2.5' },
        },
      },
      models: {
        providers: {
          siliconflow: {
            models: [
              { id: 'Pro/moonshotai/Kimi-K2.5', name: 'Kimi K2.5' },
              { id: 'Pro/zai-org/GLM-5.1', name: 'GLM 5.1' },
            ],
          },
          openai: {
            models: [{ id: 'gpt-4.1', name: 'GPT-4.1' }],
          },
          anthropic: {
            models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }],
          },
        },
      },
    }, 'en')

    expect(recommendations).toHaveLength(3)
    expect(recommendations[0]?.modelRef).toBe('siliconflow/Pro/moonshotai/Kimi-K2.5')
    expect(new Set(recommendations.map((item) => item.providerId)).size).toBe(3)
  })

  it('falls back to mixed-provider examples when the user has no configured text models', () => {
    const recommendations = getToolModelRecommendations(null, 'en')

    expect(recommendations.map((item) => item.providerId)).toEqual(['anthropic', 'google', 'openai'])
  })
})
