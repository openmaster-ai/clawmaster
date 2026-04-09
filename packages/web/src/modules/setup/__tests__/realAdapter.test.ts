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

vi.mock('@/shared/adapters/npmOpenclaw', () => ({
  installOpenclawGlobalResult: vi.fn(),
}))

vi.mock('@/shared/adapters/openclawBootstrap', () => ({
  bootstrapAfterInstallResult: vi.fn(),
  formatBootstrapSummary: vi.fn(() => 'bootstrap failed'),
}))

vi.mock('@/shared/adapters/paddleocr', () => ({
  clearPaddleOcrResult: vi.fn(),
  getPaddleOcrStatusResult: vi.fn(),
  previewPaddleOcrResult: vi.fn(),
  setupPaddleOcrResult: vi.fn(),
}))

import { execCommand } from '@/shared/adapters/platform'
import { setConfigResult } from '@/shared/adapters/openclaw'
import { installOpenclawGlobalResult } from '@/shared/adapters/npmOpenclaw'
import { bootstrapAfterInstallResult } from '@/shared/adapters/openclawBootstrap'
import {
  clearPaddleOcrResult,
  getPaddleOcrStatusResult,
  previewPaddleOcrResult,
  setupPaddleOcrResult,
} from '@/shared/adapters/paddleocr'
import { realSetupAdapter } from '../adapters'
import type { InstallProgress } from '../types'

describe('realSetupAdapter', () => {
  beforeEach(() => {
    vi.mocked(execCommand).mockReset()
    vi.mocked(setConfigResult).mockReset()
    vi.mocked(installOpenclawGlobalResult).mockReset()
    vi.mocked(bootstrapAfterInstallResult).mockReset()
    vi.mocked(clearPaddleOcrResult).mockReset()
    vi.mocked(getPaddleOcrStatusResult).mockReset()
    vi.mocked(previewPaddleOcrResult).mockReset()
    vi.mocked(setupPaddleOcrResult).mockReset()
    vi.mocked(installOpenclawGlobalResult).mockResolvedValue({
      success: true,
      data: { ok: true, code: 0, stdout: 'installed', stderr: '' },
      error: null,
    })
    vi.mocked(bootstrapAfterInstallResult).mockResolvedValue({
      success: true,
      data: {
        doctorFix: { ok: true, code: 0, stdout: '', stderr: '' },
        gatewayStart: { ok: true },
      },
      error: null,
    })
    vi.mocked(getPaddleOcrStatusResult).mockResolvedValue({
      success: true,
      data: {
        configured: false,
        enabledModules: [],
        missingModules: [],
        textRecognition: {
          configured: false,
          enabled: false,
          missing: false,
          apiUrlConfigured: false,
          accessTokenConfigured: false,
        },
        docParsing: {
          configured: false,
          enabled: false,
          missing: false,
          apiUrlConfigured: false,
          accessTokenConfigured: false,
        },
      },
      error: null,
    })
    vi.mocked(previewPaddleOcrResult).mockResolvedValue({
      success: true,
      data: {
        moduleId: 'paddleocr-text-recognition',
        apiUrl: 'https://demo.paddleocr.com/ocr',
        latencyMs: 123,
        pageCount: 1,
        textLineCount: 2,
        extractedText: 'demo',
        responsePreview: '{}',
      },
      error: null,
    })
    vi.mocked(setupPaddleOcrResult).mockResolvedValue({
      success: true,
      data: {
        configured: false,
        enabledModules: ['paddleocr-text-recognition'],
        missingModules: [],
        textRecognition: {
          configured: true,
          enabled: true,
          missing: false,
          apiUrlConfigured: true,
          accessTokenConfigured: true,
          apiUrl: 'https://demo.paddleocr.com/ocr',
        },
        docParsing: {
          configured: false,
          enabled: false,
          missing: false,
          apiUrlConfigured: false,
          accessTokenConfigured: false,
        },
      },
      error: null,
    })
    vi.mocked(clearPaddleOcrResult).mockResolvedValue({
      success: true,
      data: {
        configured: false,
        enabledModules: [],
        missingModules: [],
        textRecognition: {
          configured: false,
          enabled: false,
          missing: false,
          apiUrlConfigured: false,
          accessTokenConfigured: false,
        },
        docParsing: {
          configured: false,
          enabled: false,
          missing: false,
          apiUrlConfigured: false,
          accessTokenConfigured: false,
        },
      },
      error: null,
    })
  })

  it('installs engine through the npm and bootstrap adapters', async () => {
    const progress: InstallProgress[] = []

    await expect(
      realSetupAdapter.installCapabilities(['engine'], (item) => {
        progress.push({ ...item })
      }),
    ).resolves.toBeUndefined()

    expect(installOpenclawGlobalResult).toHaveBeenCalledWith('latest')
    expect(bootstrapAfterInstallResult).toHaveBeenCalledTimes(1)
    expect(vi.mocked(execCommand)).not.toHaveBeenCalled()
    expect(progress.at(-1)).toMatchObject({
      id: 'engine',
      status: 'done',
      progress: 100,
    })
  })

  it('throws when a capability install fails', async () => {
    const progress: InstallProgress[] = []
    vi.mocked(installOpenclawGlobalResult).mockResolvedValueOnce({
      success: true,
      data: { ok: false, code: 1, stdout: '', stderr: 'install failed' },
      error: null,
    })

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

  it('forwards PaddleOCR preview and clear requests through the shared adapter layer', async () => {
    await expect(
      realSetupAdapter.paddleocr.preview({
        moduleId: 'paddleocr-text-recognition',
        apiUrl: 'https://demo.paddleocr.com/ocr',
        accessToken: '',
      }),
    ).resolves.toMatchObject({
      apiUrl: 'https://demo.paddleocr.com/ocr',
      latencyMs: 123,
    })

    await expect(
      realSetupAdapter.paddleocr.clear({
        moduleId: 'paddleocr-text-recognition',
      }),
    ).resolves.toMatchObject({
      enabledModules: [],
    })

    expect(previewPaddleOcrResult).toHaveBeenCalledWith({
      moduleId: 'paddleocr-text-recognition',
      apiUrl: 'https://demo.paddleocr.com/ocr',
      accessToken: '',
    })
    expect(clearPaddleOcrResult).toHaveBeenCalledWith({
      moduleId: 'paddleocr-text-recognition',
    })
  })
})
