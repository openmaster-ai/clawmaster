import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/adapters/platform', () => ({
  execCommand: vi.fn(),
}))

vi.mock('@/shared/adapters/gateway', () => ({
  startGatewayResult: vi.fn(),
  getGatewayStatusResult: vi.fn(),
}))

vi.mock('@/shared/adapters/openclaw', () => ({
  getConfigResult: vi.fn(),
  setConfigResult: vi.fn(),
}))

vi.mock('@/shared/adapters/system', () => ({
  detectSystemResult: vi.fn(),
  probeHttpStatusResult: vi.fn(),
}))

import { execCommand } from '@/shared/adapters/platform'
import { getConfigResult, setConfigResult } from '@/shared/adapters/openclaw'
import { detectSystemResult, probeHttpStatusResult } from '@/shared/adapters/system'
import { realSetupAdapter } from '../adapters'
import type { InstallProgress } from '../types'

describe('realSetupAdapter', () => {
  beforeEach(() => {
    vi.mocked(execCommand).mockReset()
    vi.mocked(getConfigResult).mockReset()
    vi.mocked(setConfigResult).mockReset()
    vi.mocked(detectSystemResult).mockReset()
    vi.mocked(probeHttpStatusResult).mockReset()
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
      },
      error: null,
    } as any)
    vi.mocked(detectSystemResult).mockResolvedValue({
      success: false,
      data: null,
      error: 'unavailable',
    })
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

  it('uses detectSystem as the source of truth for engine readiness', async () => {
    vi.mocked(detectSystemResult).mockResolvedValue({
      success: true,
      data: {
        openclaw: {
          installed: true,
          version: '2026.4.2',
        },
      },
      error: null,
    } as any)
    vi.mocked(execCommand).mockImplementation(async (cmd) => {
      if (cmd === 'openclaw') {
        throw new Error('tauri bridge probe failed')
      }
      throw new Error('missing optional dependency')
    })

    const result = await realSetupAdapter.detectCapabilities(() => {})

    expect(result.find((item) => item.id === 'engine')).toMatchObject({
      id: 'engine',
      status: 'installed',
      version: '2026.4.2',
    })
    expect(result.find((item) => item.id === 'memory')).toMatchObject({
      id: 'memory',
      status: 'installed',
      version: '2026.4.2',
    })
    expect(result.find((item) => item.id === 'agent')).toMatchObject({
      id: 'agent',
      status: 'installed',
      version: '2026.4.2',
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

  it('writes the ERNIE provider as a custom openai-compatible provider', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio', 'bce-test-token'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledTimes(1)
    const [configPath, providerConfig] = vi.mocked(setConfigResult).mock.calls[0]!
    const typedProviderConfig = providerConfig as {
      models: Array<{ id: string; name: string }>
    }

    expect(configPath).toBe('models.providers.baidu-aistudio')
    expect(providerConfig).toMatchObject({
      apiKey: 'bce-test-token',
      api: 'openai-completions',
      baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
      models: expect.arrayContaining([
        { id: 'ernie-5.0-thinking-preview', name: 'ERNIE 5.0 Thinking Preview' },
        { id: 'ernie-4.5-turbo-vl', name: 'ERNIE 4.5 Turbo VL' },
        { id: 'ernie-4.5-21b-a3b-thinking', name: 'ERNIE 4.5 21B A3B Thinking' },
        { id: 'ernie-3.5-8k', name: 'ERNIE 3.5 8K' },
      ]),
    })
    expect(typedProviderConfig.models).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'deepseek-v3' }),
        expect.objectContaining({ id: 'deepseek-r1' }),
      ]),
    )
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

  it('probes the ERNIE provider through the chat completions endpoint with the default ERNIE model', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('baidu-aistudio', 'bce-test-token'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'https://aistudio.baidu.com/llm/lmapi/v3/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer bce-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ernie-5.0-thinking-preview',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
  })

  it('probes the stable built-in provider default before falling back to a saved legacy model', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {
            'baidu-aistudio': {
              models: [
                { id: 'deepseek-v3', name: 'DeepSeek V3' },
                { id: 'deepseek-r1', name: 'DeepSeek R1' },
              ],
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(probeHttpStatusResult)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: false, status: 404 },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, status: 200 },
        error: null,
      })

    await expect(
      realSetupAdapter.onboarding.testApiKey('baidu-aistudio', 'bce-test-token'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenNthCalledWith(1, {
      url: 'https://aistudio.baidu.com/llm/lmapi/v3/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer bce-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ernie-5.0-thinking-preview',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
    expect(probeHttpStatusResult).toHaveBeenNthCalledWith(2, {
      url: 'https://aistudio.baidu.com/llm/lmapi/v3/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer bce-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v3',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
  })

  it('probes the active default model when the saved provider catalog is stale', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        agents: {
          defaults: {
            model: {
              primary: 'baidu-aistudio/ernie-4.5-turbo-vl',
            },
          },
        },
        models: {
          providers: {
            'baidu-aistudio': {
              models: [
                { id: 'deepseek-v3', name: 'DeepSeek V3' },
                { id: 'deepseek-r1', name: 'DeepSeek R1' },
              ],
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('baidu-aistudio', 'bce-test-token'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'https://aistudio.baidu.com/llm/lmapi/v3/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer bce-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ernie-4.5-turbo-vl',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
  })

  it('probes a live-selected default model before falling back to the built-in provider default', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        agents: {
          defaults: {
            model: {
              primary: 'openai/gpt-5-preview-live',
            },
          },
        },
        models: {
          providers: {
            openai: {
              models: [
                { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
              ],
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(probeHttpStatusResult)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: false, status: 404 },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, status: 200 },
        error: null,
      })

    await expect(
      realSetupAdapter.onboarding.testApiKey('openai', 'sk-test'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenNthCalledWith(1, {
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-preview-live',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
    expect(probeHttpStatusResult).toHaveBeenNthCalledWith(2, {
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
  })
})
