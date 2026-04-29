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
  resolvePluginRootResult: vi.fn(),
}))

vi.mock('@/shared/adapters/clawhub', () => ({
  getSkillsResult: vi.fn(),
  installSkillResult: vi.fn(),
}))

vi.mock('@/shared/adapters/system', () => ({
  detectSystemResult: vi.fn(),
  probeHttpStatusResult: vi.fn(),
}))

import { execCommand } from '@/shared/adapters/platform'
import { getConfigResult, resolvePluginRootResult, setConfigResult } from '@/shared/adapters/openclaw'
import { getSkillsResult, installSkillResult } from '@/shared/adapters/clawhub'
import { detectSystemResult, probeHttpStatusResult } from '@/shared/adapters/system'
import { realSetupAdapter } from '../adapters'
import type { InstallProgress } from '../types'

describe('realSetupAdapter', () => {
  beforeEach(() => {
    vi.mocked(execCommand).mockReset()
    vi.mocked(getConfigResult).mockReset()
    vi.mocked(setConfigResult).mockReset()
    vi.mocked(resolvePluginRootResult).mockReset()
    vi.mocked(getSkillsResult).mockReset()
    vi.mocked(installSkillResult).mockReset()
    vi.mocked(detectSystemResult).mockReset()
    vi.mocked(probeHttpStatusResult).mockReset()
    vi.mocked(execCommand).mockResolvedValue('')
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
    vi.mocked(resolvePluginRootResult).mockResolvedValue({
      success: true,
      data: null,
      error: null,
    } as any)
    vi.mocked(getSkillsResult).mockResolvedValue({
      success: true,
      data: [],
      error: null,
    } as any)
    vi.mocked(installSkillResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
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

  it('detects OCR capability from the bundled PaddleOCR skill', async () => {
    vi.mocked(getSkillsResult).mockResolvedValue({
      success: true,
      data: [
        {
          slug: 'paddleocr-doc-parsing',
          skillKey: 'paddleocr-doc-parsing',
          name: 'PaddleOCR Doc Parsing',
          version: '1.0.0',
          installed: true,
        },
      ],
      error: null,
    } as any)

    const result = await realSetupAdapter.detectCapabilities(() => {})

    expect(result.find((item) => item.id === 'ocr')).toMatchObject({
      id: 'ocr',
      status: 'installed',
      version: '1.0.0',
    })
  })

  it('installs and enables the bundled PaddleOCR skill for OCR capability setup', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    const progress: InstallProgress[] = []
    await expect(
      realSetupAdapter.installCapabilities(['ocr'], (item) => {
        progress.push({ ...item })
      }),
    ).resolves.toBeUndefined()

    expect(installSkillResult).toHaveBeenCalledWith('paddleocr-doc-parsing')
    expect(setConfigResult).toHaveBeenCalledWith('skills.entries.paddleocr-doc-parsing.enabled', true)
    expect(progress.at(-1)).toMatchObject({
      id: 'ocr',
      status: 'done',
      progress: 100,
    })
  })

  it('passes the configured registry flag to npm capability installs', async () => {
    const progress: InstallProgress[] = []

    await expect(
      realSetupAdapter.installCapabilities(
        ['observe'],
        (item) => {
          progress.push({ ...item })
        },
        { registryUrl: 'https://registry.npmmirror.com' },
      ),
    ).resolves.toBeUndefined()

    expect(execCommand).toHaveBeenCalledWith('npm', [
      'install',
      '-g',
      'clawprobe',
      '--registry',
      'https://registry.npmmirror.com',
    ])
    expect(progress.find((item) => item.log?.includes('--registry https://registry.npmmirror.com'))).toBeTruthy()
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

  it('writes Z.AI GLM as a native OpenAI-compatible provider', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('zai', 'zai-key'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.zai', {
      apiKey: 'zai-key',
      api: 'openai-completions',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      models: [
        { id: 'glm-5.1', name: 'GLM-5.1' },
        { id: 'glm-5', name: 'GLM-5' },
        { id: 'glm-5-turbo', name: 'GLM-5 Turbo' },
        { id: 'glm-5v-turbo', name: 'GLM-5V Turbo' },
        { id: 'glm-4.7', name: 'GLM-4.7' },
        { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash' },
        { id: 'glm-4.7-flashx', name: 'GLM-4.7 FlashX' },
        { id: 'glm-4.6', name: 'GLM-4.6' },
        { id: 'glm-4.6v', name: 'GLM-4.6V' },
        { id: 'glm-4.5', name: 'GLM-4.5' },
        { id: 'glm-4.5-air', name: 'GLM-4.5 Air' },
        { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash' },
        { id: 'glm-4.5v', name: 'GLM-4.5V' },
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

  it('writes Baidu Qianfan Coding Plan as a BCE OpenAI-compatible provider', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baiduqianfancodingplan', 'bce-test-key'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.baiduqianfancodingplan', {
      apiKey: 'bce-test-key',
      api: 'openai-completions',
      baseUrl: 'https://qianfan.baidubce.com/v2/coding',
      models: [
        { id: 'qianfan-code-latest', name: 'Qianfan Code Latest' },
        { id: 'qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B A35B Instruct' },
        { id: 'qwen3-coder-30b-a3b-instruct', name: 'Qwen3 Coder 30B A3B Instruct' },
      ],
    })
  })

  it('throws when the ERNIE-Image runtime plugin root cannot be resolved', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).rejects.toThrow('Failed to resolve ERNIE-Image runtime plugin root')

    expect(setConfigResult).not.toHaveBeenCalledWith(
      'models.providers.baidu-aistudio-image',
      expect.anything(),
    )
    expect(installSkillResult).not.toHaveBeenCalled()
  })

  it('preserves the shared OpenAI chat key when GPT Image uses a different credential', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {
            openai: {
              apiKey: 'sk-existing-openai',
              models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('openai-image', 'sk-image-openai'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.openai', {
      apiKey: 'sk-existing-openai',
      imageApiKey: 'sk-image-openai',
      models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }],
    })
  })

  it('preserves the shared Google chat key when Gemini Image uses a different credential', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {
            google: {
              apiKey: 'google-existing-key',
              models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('google-image', 'google-image-key'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.google', {
      apiKey: 'google-existing-key',
      imageApiKey: 'google-image-key',
      models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
    })
  })

  it('seeds the shared runtime key when an aliased image provider is the first credential configured', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('openai-image', 'sk-image-openai'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith('models.providers.openai', {
      apiKey: 'sk-image-openai',
      imageApiKey: 'sk-image-openai',
    })
  })

  it('registers the ERNIE-Image runtime plugin when a managed plugin root can be inferred', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
        plugins: {
          load: {
            paths: [
              '/Users/haili/workspaces/clawmaster/plugins/memory-clawmaster-powermem',
            ],
          },
          entries: {},
          installs: {
            'memory-clawmaster-powermem': {
              sourcePath: '/Users/haili/workspaces/clawmaster/plugins/memory-clawmaster-powermem',
              installPath: '/Users/haili/workspaces/clawmaster/plugins/memory-clawmaster-powermem',
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(resolvePluginRootResult).mockResolvedValue({
      success: true,
      data: '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenNthCalledWith(1, 'plugins.load.paths', [
      '/Users/haili/workspaces/clawmaster/plugins/memory-clawmaster-powermem',
      '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
    ])
    expect(setConfigResult).toHaveBeenNthCalledWith(
      2,
      'plugins.entries.openclaw-ernie-image',
      { enabled: true },
    )
    expect(setConfigResult).toHaveBeenNthCalledWith(
      3,
      'plugins.installs.openclaw-ernie-image',
      expect.objectContaining({
        source: 'path',
        sourcePath: '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
        installPath: '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
        version: '0.1.0',
      }),
    )
    expect(setConfigResult).toHaveBeenNthCalledWith(4, 'skills.entries.ernie-image.enabled', true)
    expect(setConfigResult).toHaveBeenNthCalledWith(5, 'models.providers.baidu-aistudio-image', {
      apiKey: 'bce-image-token',
      api: 'openai-completions',
      baseUrl: 'https://aistudio.baidu.com/llm/lmapi/v3',
      models: [
        { id: 'ernie-image-turbo', name: 'ERNIE-Image Turbo' },
      ],
    })
    expect(resolvePluginRootResult).toHaveBeenCalledWith({
      pluginId: 'openclaw-ernie-image',
      candidates: [
        '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
      ],
    })
    expect(installSkillResult).toHaveBeenCalledWith('ernie-image')
  })

  it('registers the ERNIE-Image runtime plugin from the repo fallback on a fresh profile', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
        plugins: {
          load: {
            paths: [],
          },
          entries: {},
          installs: {},
        },
      },
      error: null,
    } as any)
    vi.mocked(resolvePluginRootResult).mockResolvedValue({
      success: true,
      data: '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).resolves.toBeUndefined()

    expect(resolvePluginRootResult).toHaveBeenCalledWith({
      pluginId: 'openclaw-ernie-image',
      candidates: [],
    })
    expect(setConfigResult).toHaveBeenNthCalledWith(1, 'plugins.load.paths', [
      '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
    ])
  })

  it('reuses an existing custom ERNIE-Image install record when resolving the runtime plugin root', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
        plugins: {
          load: {
            paths: [],
          },
          entries: {},
          installs: {
            'openclaw-ernie-image': {
              sourcePath: '/opt/openclaw/plugins/ernie-image-custom',
              installPath: '/opt/openclaw/plugins/ernie-image-custom',
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(resolvePluginRootResult).mockResolvedValue({
      success: true,
      data: '/opt/openclaw/plugins/ernie-image-custom',
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).resolves.toBeUndefined()

    expect(resolvePluginRootResult).toHaveBeenCalledWith({
      pluginId: 'openclaw-ernie-image',
      candidates: [
        '/opt/openclaw/plugins/ernie-image-custom',
      ],
    })
    expect(setConfigResult).toHaveBeenNthCalledWith(1, 'plugins.load.paths', [
      '/opt/openclaw/plugins/ernie-image-custom',
    ])
  })

  it('infers the ERNIE-Image plugin path from Windows-style managed plugin roots', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
        plugins: {
          load: {
            paths: [
              'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\memory-clawmaster-powermem',
            ],
          },
          entries: {},
          installs: {
            'memory-clawmaster-powermem': {
              sourcePath: 'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\memory-clawmaster-powermem',
              installPath: 'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\memory-clawmaster-powermem',
            },
          },
        },
      },
      error: null,
    } as any)
    vi.mocked(resolvePluginRootResult).mockResolvedValue({
      success: true,
      data: 'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\openclaw-ernie-image',
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).resolves.toBeUndefined()

    expect(resolvePluginRootResult).toHaveBeenCalledWith({
      pluginId: 'openclaw-ernie-image',
      candidates: [
        'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\openclaw-ernie-image',
      ],
    })
    expect(setConfigResult).toHaveBeenNthCalledWith(1, 'plugins.load.paths', [
      'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\memory-clawmaster-powermem',
      'C:\\Users\\haili\\workspaces\\clawmaster\\plugins\\openclaw-ernie-image',
    ])
  })

  it('fails ERNIE-Image onboarding instead of saving a broken provider when no plugin root can be resolved', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
        plugins: {
          load: {
            paths: [
              '/Users/haili/workspaces/clawmaster/plugins/some-other-plugin',
            ],
          },
          entries: {},
          installs: {},
        },
      },
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).rejects.toThrow('Failed to resolve ERNIE-Image runtime plugin root')

    expect(setConfigResult).not.toHaveBeenCalled()
    expect(installSkillResult).not.toHaveBeenCalled()
  })

  it('does not persist the ERNIE-Image provider when bundled skill installation fails', async () => {
    vi.mocked(getConfigResult).mockResolvedValue({
      success: true,
      data: {
        models: {
          providers: {},
        },
        plugins: {
          load: {
            paths: [],
          },
          entries: {},
          installs: {},
        },
      },
      error: null,
    } as any)
    vi.mocked(resolvePluginRootResult).mockResolvedValue({
      success: true,
      data: '/Users/haili/workspaces/clawmaster/plugins/openclaw-ernie-image',
      error: null,
    } as any)
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
    vi.mocked(installSkillResult).mockResolvedValue({
      success: false,
      data: undefined,
      error: 'bundled skill missing',
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).rejects.toThrow('bundled skill missing')

    expect(setConfigResult).not.toHaveBeenCalledWith(
      'models.providers.baidu-aistudio-image',
      expect.anything(),
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

  it('probes Baidu Qianfan Coding Plan through the BCE chat completions endpoint', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('baiduqianfancodingplan', 'bce-test-key'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'https://qianfan.baidubce.com/v2/coding/chat/completions',
      method: 'POST',
      headers: {
        Authorization: 'Bearer bce-test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qianfan-code-latest',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      timeoutMs: 10000,
    })
  })

  it('probes the ERNIE-Image provider through the images generations endpoint', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('baidu-aistudio-image', 'bce-image-token'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'https://aistudio.baidu.com/llm/lmapi/v3/images/generations',
      method: 'POST',
      headers: {
        Authorization: 'Bearer bce-image-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ernie-image-turbo',
        prompt: 'A small paper lantern on a wooden table',
        n: 1,
        response_format: 'url',
        size: '1024x1024',
      }),
      timeoutMs: 20000,
    })
  })

  it('probes Gemini Image against the Google Generative Language API instead of the OpenAI endpoint', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey('google-image', 'google-image-key'),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview?key=google-image-key',
      method: 'GET',
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

  it('strips /chat/completions suffix from custom-openai-compatible baseUrl on probe', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey(
        'custom-openai-compatible',
        'glm-key',
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      ),
    ).resolves.toBe(true)

    const calls = vi.mocked(probeHttpStatusResult).mock.calls
    for (const [arg] of calls) {
      expect(arg.url).not.toContain('/chat/completions/chat/completions')
      expect(arg.url.startsWith('https://open.bigmodel.cn/api/paas/v4/')).toBe(true)
    }
  })

  it('preserves query strings when probing a pasted completions URL', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: true, status: 200 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey(
        'custom-openai-compatible',
        'azure-key',
        'https://example.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21',
      ),
    ).resolves.toBe(true)

    expect(probeHttpStatusResult).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21',
    }))
  })

  it('persists a normalized baseUrl when user pastes a completions URL', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey(
        'custom-openai-compatible',
        'glm-key',
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      ),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith(
      'models.providers.custom-openai-compatible',
      expect.objectContaining({
        apiKey: 'glm-key',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      }),
    )
  })

  it('persists a normalized baseUrl with query strings intact', async () => {
    vi.mocked(setConfigResult).mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.setApiKey(
        'custom-openai-compatible',
        'azure-key',
        'https://example.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21',
      ),
    ).resolves.toBeUndefined()

    expect(setConfigResult).toHaveBeenCalledWith(
      'models.providers.custom-openai-compatible',
      expect.objectContaining({
        apiKey: 'azure-key',
        baseUrl: 'https://example.openai.azure.com/openai/deployments/test?api-version=2024-10-21',
      }),
    )
  })

  it('falls back to GET /models when all chat/completions probes fail with an unknown model', async () => {
    vi.mocked(probeHttpStatusResult)
      // chat/completions probe with fallback gpt-4o-mini → 400 unknown model
      .mockResolvedValueOnce({
        success: true,
        data: { ok: false, status: 400 },
        error: null,
      })
      // GET /models → 200 (valid auth)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, status: 200 },
        error: null,
      })
      // unauthenticated GET /models → 401 (catalog requires auth)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: false, status: 401 },
        error: null,
      })

    await expect(
      realSetupAdapter.onboarding.testApiKey(
        'custom-openai-compatible',
        'glm-key',
        'https://open.bigmodel.cn/api/paas/v4',
      ),
    ).resolves.toBe(true)

    const calls = vi.mocked(probeHttpStatusResult).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(3)
    const authenticatedModelsCall = calls[calls.length - 2]![0]
    const unauthenticatedModelsCall = calls[calls.length - 1]![0]
    expect(authenticatedModelsCall.url).toBe('https://open.bigmodel.cn/api/paas/v4/models')
    expect(authenticatedModelsCall.method).toBe('GET')
    expect(authenticatedModelsCall.headers).toMatchObject({ Authorization: 'Bearer glm-key' })
    expect(unauthenticatedModelsCall.url).toBe('https://open.bigmodel.cn/api/paas/v4/models')
    expect(unauthenticatedModelsCall.method).toBe('GET')
    expect(unauthenticatedModelsCall.headers).toBeUndefined()
  })

  it('returns false when GET /models fallback also fails', async () => {
    vi.mocked(probeHttpStatusResult).mockResolvedValue({
      success: true,
      data: { ok: false, status: 401 },
      error: null,
    })

    await expect(
      realSetupAdapter.onboarding.testApiKey(
        'custom-openai-compatible',
        'bad-key',
        'https://open.bigmodel.cn/api/paas/v4',
      ),
    ).resolves.toBe(false)
  })

  it('returns false when GET /models is publicly reachable without authentication', async () => {
    vi.mocked(probeHttpStatusResult)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: false, status: 401 },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, status: 200 },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, status: 200 },
        error: null,
      })

    await expect(
      realSetupAdapter.onboarding.testApiKey(
        'custom-openai-compatible',
        'bad-key',
        'https://openrouter.ai/api/v1',
      ),
    ).resolves.toBe(false)
  })
})
