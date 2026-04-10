import { describe, expect, it } from 'vitest'
import {
  getEnabledMcpCount,
  getEnabledPluginCount,
  getEnabledSkillCount,
  getInstalledMcpCount,
  getReadySkillCount,
  isPluginEnabledStatus,
} from '../capabilitySummary'

describe('capabilitySummary', () => {
  it('treats loaded, active, and enabled plugins as active while excluding disabled states', () => {
    expect(isPluginEnabledStatus('loaded')).toBe(true)
    expect(isPluginEnabledStatus('active')).toBe(true)
    expect(isPluginEnabledStatus('enabled')).toBe(true)
    expect(isPluginEnabledStatus('disabled')).toBe(false)
    expect(isPluginEnabledStatus('enabled (disabled by policy)')).toBe(false)
    expect(isPluginEnabledStatus('off')).toBe(false)
  })

  it('returns stable counts across plugin, skill, and mcp payloads', () => {
    expect(
      getEnabledPluginCount({
        plugins: [
          { id: 'a', name: 'Plugin A', status: 'loaded' },
          { id: 'b', name: 'Plugin B', status: 'enabled' },
          { id: 'c', name: 'Plugin C', status: 'disabled' },
        ],
      }),
    ).toBe(2)

    expect(
      getEnabledSkillCount([
        {
          slug: 'skill-a',
          skillKey: 'skill-a',
          name: 'Skill A',
          description: '',
          version: '1.0.0',
          disabled: false,
          eligible: true,
        },
        {
          slug: 'skill-b',
          skillKey: 'skill-b',
          name: 'Skill B',
          description: '',
          version: '1.0.0',
          disabled: true,
          eligible: true,
        },
      ]),
    ).toBe(1)

    expect(
      getReadySkillCount([
        {
          slug: 'skill-a',
          skillKey: 'skill-a',
          name: 'Skill A',
          description: '',
          version: '1.0.0',
          disabled: false,
          eligible: true,
        },
        {
          slug: 'skill-b',
          skillKey: 'skill-b',
          name: 'Skill B',
          description: '',
          version: '1.0.0',
          disabled: false,
          eligible: false,
        },
      ]),
    ).toBe(1)

    expect(
      getInstalledMcpCount({
        context7: { enabled: true, transport: 'stdio', command: 'npx', args: [], env: {} },
        deepwiki: { enabled: false, transport: 'stdio', command: 'npx', args: [], env: {} },
      }),
    ).toBe(2)

    expect(
      getEnabledMcpCount({
        context7: { enabled: true, transport: 'stdio', command: 'npx', args: [], env: {} },
        deepwiki: { enabled: false, transport: 'stdio', command: 'npx', args: [], env: {} },
      }),
    ).toBe(1)
  })
})
