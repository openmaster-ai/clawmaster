import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/adapters/platform', () => ({
  execCommand: vi.fn(),
}))

vi.mock('@/shared/adapters/gateway', () => ({
  startGatewayResult: vi.fn(),
  getGatewayStatusResult: vi.fn(),
}))

vi.mock('@/shared/adapters/openclaw', () => ({
  setConfigResult: vi.fn(),
}))

import { execCommand } from '@/shared/adapters/platform'
import { setConfigResult } from '@/shared/adapters/openclaw'
import { realSetupAdapter } from '../adapters'
import type { InstallProgress } from '../types'

describe('realSetupAdapter', () => {
  beforeEach(() => {
    vi.mocked(execCommand).mockReset()
    vi.mocked(setConfigResult).mockReset()
  })

  it('throws when a capability install fails', async () => {
    const progress: InstallProgress[] = []
    vi.mocked(execCommand).mockRejectedValueOnce(new Error('install failed'))

    await expect(
      realSetupAdapter.installCapabilities(['engine'], (item) => {
        progress.push({ ...item })
      }),
    ).rejects.toThrow('engine: install failed')

    expect(progress.at(-1)).toMatchObject({
      id: 'engine',
      status: 'error',
      error: 'install failed',
    })
  })

  it('detects memory capability from memory-powermem plugin status', async () => {
    vi.mocked(execCommand).mockImplementation(async (cmd, args) => {
      if (cmd === 'openclaw' && args.join(' ') === '--version') return 'OpenClaw 2026.3.11'
      if (cmd === 'openclaw' && args.join(' ') === 'plugins list --json') {
        return JSON.stringify({
          plugins: [{ id: 'memory-powermem', status: 'loaded', version: '0.2.0' }],
        })
      }
      throw new Error('missing optional dependency')
    })

    const updates: InstallProgress[] = []
    const result = await realSetupAdapter.detectCapabilities((item) => {
      updates.push(item as unknown as InstallProgress)
    })

    expect(result.find((item) => item.id === 'memory')).toMatchObject({
      id: 'memory',
      status: 'installed',
      version: '0.2.0',
    })
  })

  it('writes siliconflow as a custom openai-compatible provider', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('siliconflow', 'sk-test'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.siliconflow', {
      apiKey: 'sk-test',
      api: 'openai-completions',
      baseUrl: 'https://api.siliconflow.cn/v1',
      models: [
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
        { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
        { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B' },
        { id: 'Qwen/Qwen3-30B-A3B', name: 'Qwen3 30B' },
        { id: 'Pro/deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 (Pro)' },
        { id: 'Pro/deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1 (Pro)' },
      ],
    })
  })
})
