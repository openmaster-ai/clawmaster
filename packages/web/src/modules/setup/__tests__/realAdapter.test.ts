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

vi.mock('@/shared/adapters/system', () => ({
  probeHttpStatusResult: vi.fn(),
}))

import { execCommand } from '@/shared/adapters/platform'
import { setConfigResult } from '@/shared/adapters/openclaw'
import { probeHttpStatusResult } from '@/shared/adapters/system'
import { realSetupAdapter } from '../adapters'
import type { InstallProgress } from '../types'

describe('realSetupAdapter', () => {
  beforeEach(() => {
    vi.mocked(execCommand).mockReset()
    vi.mocked(setConfigResult).mockReset()
    vi.mocked(probeHttpStatusResult).mockReset()
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

  it('detects memory capability from the native OpenClaw runtime', async () => {
    vi.mocked(execCommand).mockImplementation(async (cmd, args) => {
      if (cmd === 'openclaw' && args.join(' ') === '--version') return 'OpenClaw 2026.3.11'
      throw new Error('missing optional dependency')
    })

    const updates: InstallProgress[] = []
    const result = await realSetupAdapter.detectCapabilities((item) => {
      updates.push(item as unknown as InstallProgress)
    })

    expect(result.find((item) => item.id === 'memory')).toMatchObject({
      id: 'memory',
      status: 'installed',
      version: '2026.3.11',
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

  it('writes baidu ai studio as a custom openai-compatible provider', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio', 'bce-test-token'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.baidu-aistudio', {
      apiKey: 'bce-test-token',
      api: 'openai-completions',
      baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
      models: [
        { id: 'deepseek-v3', name: 'DeepSeek V3' },
        { id: 'deepseek-r1', name: 'DeepSeek R1' },
        { id: 'ernie-4.5-turbo-128k-preview', name: 'ERNIE 4.5 Turbo' },
        { id: 'ernie-3.5-8k', name: 'ERNIE 3.5 8K' },
      ],
    })
  })

  it('probes Ollama via the dedicated HTTP probe adapter', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('ollama', '', 'http://localhost:11434/v1'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'http://localhost:11434/api/tags',
      method: 'GET',
      timeoutMs: 5000,
    })
  })

  it('probes provider chat completions via the dedicated HTTP probe adapter', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('siliconflow', 'sk-test', 'https://api.siliconflow.cn/v1'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
  })
})
