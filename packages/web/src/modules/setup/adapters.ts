/**
 * 安装向导适配器
 *
 * 两套实现：
 * - realSetupAdapter: 调用真实 CLI
 * - demoSetupAdapter: 模拟全流程（?demo=install 触发）
 */

import { execCommand } from '@/shared/adapters/platform'

const TEMP = '${TMPDIR:-/tmp}'
import { detectMirrors, getMirrorSetupCommands } from '@/shared/adapters/mirror'
import {
  CAPABILITIES,
  PROVIDERS,
  type CapabilityStatus,
  type InstallProgress,
  type CapabilityId,
} from './types'

// ─── 接口 ───

export interface OnboardingAdapter {
  /** 初始化配置文件 */
  initConfig(): Promise<void>
  /** 快速验证 API Key 是否可用 */
  testApiKey(provider: string, apiKey: string, baseUrl?: string): Promise<boolean>
  /** 设置 LLM 提供商 API Key（及 baseUrl） */
  setApiKey(provider: string, apiKey: string, baseUrl?: string): Promise<void>
  /** 设置默认模型 */
  setDefaultModel(model: string): Promise<void>
  /** 后台启动网关 */
  startGateway(port: number): Promise<void>
  /** 检测网关是否可达 */
  checkGateway(port: number): Promise<boolean>
  /** 添加消息通道 */
  addChannel(channelType: string, tokens: Record<string, string>): Promise<void>
  /** QR 码登录通道（WeChat/WhatsApp） */
  loginChannel(channelType: string): Promise<string>
  /** 安装插件包 */
  installPlugin(packageName: string): Promise<void>
}

export interface SetupAdapter {
  /** 逐项检测五项能力，通过回调报告每项状态 */
  detectCapabilities(onUpdate: (status: CapabilityStatus) => void): Promise<CapabilityStatus[]>
  /** 安装指定能力列表，通过回调报告进度 */
  installCapabilities(ids: CapabilityId[], onProgress: (progress: InstallProgress) => void): Promise<void>
  /** 配置引导 */
  onboarding: OnboardingAdapter
}

// ─── 真实实现 ───

const realOnboardingAdapter: OnboardingAdapter = {
  async initConfig() {
    await execCommand('openclaw', ['onboard', '--mode', 'local', '--non-interactive', '--accept-risk', '--skip-health'])
  },

  async testApiKey(provider, apiKey, baseUrl?) {
    const cfg = PROVIDERS[provider]

    // Ollama: probe native /api/tags endpoint (no auth needed)
    if (provider === 'ollama') {
      const ollamaBase = (baseUrl || cfg?.baseUrl || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '')
      try {
        await execCommand('curl', ['-sf', '--max-time', '5', `${ollamaBase}/api/tags`])
        return true
      } catch {
        return false
      }
    }

    const endpoint = baseUrl || cfg?.baseUrl || 'https://api.openai.com/v1'
    const model = cfg?.models?.[0]?.id ?? 'gpt-4o-mini'
    try {
      const output = await execCommand('curl', [
        '-sf', '-o', '/dev/null', '-w', '%{http_code}',
        '-H', `Authorization: Bearer ${apiKey}`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        '--max-time', '10',
        `${endpoint}/chat/completions`,
      ])
      return output.trim() === '200'
    } catch {
      return false
    }
  },

  async setApiKey(provider, apiKey, baseUrl?) {
    const cfg = PROVIDERS[provider]
    const configKey = cfg?.configKeyOverride ?? provider
    const effectiveBaseUrl = baseUrl || cfg?.baseUrl
    // Ollama: use placeholder key, always include baseUrl
    const effectiveKey = provider === 'ollama' ? (apiKey || 'ollama') : apiKey
    const providerObj: Record<string, unknown> = { apiKey: effectiveKey, models: [] }
    if (effectiveBaseUrl) providerObj.baseUrl = effectiveBaseUrl
    const batchJson = JSON.stringify([{ path: `models.providers.${configKey}`, value: providerObj }])
    // 通过 heredoc 写临时文件，再用 --batch-file 读取
    await execCommand('bash', [
      '-c',
      `cat > ${TEMP}/.openclaw-batch.json << 'CLAWEOF'\n${batchJson}\nCLAWEOF\nopenclaw config set --batch-file ${TEMP}/.openclaw-batch.json --strict-json && rm -f ${TEMP}/.openclaw-batch.json`,
    ])
  },

  async setDefaultModel(model) {
    await execCommand('openclaw', ['models', 'set', model])
  },

  async startGateway(port) {
    // 使用 nohup 直接启动，不通过 bash -c（避免后台进程被 shell 退出时杀死）
    // 注意：此调用会阻塞直到 gateway 退出，所以调用方不应 await 此结果
    // 但 checkGateway 会在网关启动后探测到它
    execCommand('nohup', ['openclaw', 'gateway', 'run', '--port', String(port), '--auth', 'none']).catch(() => {})
    // 给网关一点启动时间
    await new Promise((r) => setTimeout(r, 2000))
  },

  async checkGateway(port) {
    try {
      // 通过 curl 检查网关健康，避免浏览器 CORS 限制
      const output = await execCommand('curl', ['-sf', `http://127.0.0.1:${port}/health`])
      return output.includes('"ok":true')
    } catch {
      return false
    }
  },

  async addChannel(channelType, tokens) {
    const args = ['channels', 'add', '--channel', channelType]
    for (const [key, value] of Object.entries(tokens)) {
      if (value.trim()) args.push(`--${key}`, value.trim())
    }
    await execCommand('openclaw', args)
  },

  async loginChannel(channelType) {
    // Fire-and-forget: interactive login runs in background
    // The user scans QR in phone app; CLI handles the rest
    execCommand('openclaw', ['channels', 'login', '--channel', channelType]).catch(() => {})
    // Poll channel status until connected
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const out = await execCommand('openclaw', ['channels', 'status', '--channel', channelType])
        if (out.includes('connected') || out.includes('ready') || out.includes('online')) {
          return 'connected'
        }
      } catch { /* keep polling */ }
    }
    return 'timeout'
  },

  async installPlugin(packageName) {
    await execCommand('npm', ['install', '-g', packageName])
  },
}

export const realSetupAdapter: SetupAdapter = {
  onboarding: realOnboardingAdapter,

  async detectCapabilities(onUpdate) {
    const results: CapabilityStatus[] = []

    for (const cap of CAPABILITIES) {
      onUpdate({ id: cap.id, name: cap.name, status: 'checking' })

      try {
        const output = await execCommand(cap.detectCmd, cap.detectArgs)
        const match = output.match(/v?(\d+\.\d+[\w.-]*)/)
        const status: CapabilityStatus = {
          id: cap.id,
          name: cap.name,
          status: 'installed',
          version: match ? match[1] : output.trim().slice(0, 20),
        }
        onUpdate(status)
        results.push(status)
      } catch {
        const status: CapabilityStatus = {
          id: cap.id,
          name: cap.name,
          status: 'not_installed',
        }
        onUpdate(status)
        results.push(status)
      }
    }

    return results
  },

  async installCapabilities(ids, onProgress) {
    // 先检测网络，配置镜像
    const { mirrors } = await detectMirrors()
    const mirrorCmds = getMirrorSetupCommands(mirrors)
    for (const cmd of mirrorCmds) {
      const [bin, ...args] = cmd.split(' ')
      try {
        await execCommand(bin, args)
      } catch {
        // 镜像配置失败不阻断安装
      }
    }

    // 逐项安装
    for (const id of ids) {
      const cap = CAPABILITIES.find((c) => c.id === id)
      if (!cap) continue

      onProgress({ id, status: 'installing', progress: 0 })

      try {
        const totalSteps = cap.installSteps.length
        for (let i = 0; i < totalSteps; i++) {
          const step = cap.installSteps[i]
          onProgress({
            id,
            status: 'installing',
            progress: Math.round(((i + 0.5) / totalSteps) * 100),
            log: `${step.cmd} ${step.args.join(' ')}`,
          })

          await execCommand(step.cmd, step.args)
        }

        onProgress({ id, status: 'done', progress: 100 })
      } catch (err) {
        onProgress({
          id,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  },
}

// ─── Demo 实现 ───

const DEMO_DETECT_RESULTS: Record<CapabilityId, { installed: boolean; version: string }> = {
  engine: { installed: true, version: '2026.3.13' },
  memory: { installed: true, version: '0.2.0' },
  observe: { installed: false, version: '' },
  ocr: { installed: false, version: '' },
  agent: { installed: true, version: '0.1.4' },
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const demoOnboardingAdapter: OnboardingAdapter = {
  async initConfig() {
    await delay(800)
  },
  async testApiKey() {
    await delay(800)
    return true
  },
  async setApiKey() {
    await delay(600)
  },
  async setDefaultModel() {
    await delay(400)
  },
  async startGateway() {
    await delay(1200)
  },
  async checkGateway() {
    await delay(500)
    return true
  },
  async addChannel(_type, _tokens) {
    await delay(700)
  },
  async loginChannel() {
    await delay(3000)
    return 'connected'
  },
  async installPlugin() {
    await delay(2000)
  },
}

export const demoSetupAdapter: SetupAdapter = {
  onboarding: demoOnboardingAdapter,

  async detectCapabilities(onUpdate) {
    const results: CapabilityStatus[] = []

    for (const cap of CAPABILITIES) {
      onUpdate({ id: cap.id, name: cap.name, status: 'checking' })
      await delay(400 + Math.random() * 300)

      const demo = DEMO_DETECT_RESULTS[cap.id]
      const status: CapabilityStatus = {
        id: cap.id,
        name: cap.name,
        status: demo.installed ? 'installed' : 'not_installed',
        version: demo.installed ? demo.version : undefined,
      }
      onUpdate(status)
      results.push(status)
    }

    return results
  },

  async installCapabilities(ids, onProgress) {
    for (const id of ids) {
      const cap = CAPABILITIES.find((c) => c.id === id)
      if (!cap) continue

      onProgress({ id, status: 'installing', progress: 0 })

      // 模拟安装过程
      const steps = ['正在下载...', '正在安装...', '正在配置...']
      for (let i = 0; i < steps.length; i++) {
        await delay(600 + Math.random() * 400)
        onProgress({
          id,
          status: 'installing',
          progress: Math.round(((i + 1) / steps.length) * 100),
          log: `> ${steps[i]}`,
        })
      }

      await delay(300)
      onProgress({ id, status: 'done', progress: 100 })
    }
  },
}

// ─── 根据 URL 参数选择 ───

export function getSetupAdapter(): SetupAdapter {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === 'install') return demoSetupAdapter
  }
  return realSetupAdapter
}
