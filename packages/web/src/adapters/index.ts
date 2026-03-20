import { PlatformAdapter, SystemInfo, GatewayStatus, OpenClawConfig, ChannelInfo, ChannelConfig, ModelInfo, SkillInfo, AgentInfo, LogEntry, AgentConfig } from '@/lib/types'
import { isTauri } from '@/lib/types'

// Tauri invoke helper
async function invoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke(cmd, args)
  }
  throw new Error('Not running in Tauri environment')
}

// Web API 适配器
const webAdapter: PlatformAdapter = {
  async detectSystem(): Promise<SystemInfo> {
    const res = await fetch('/api/system/detect')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  async getGatewayStatus(): Promise<GatewayStatus> {
    const res = await fetch('/api/gateway/status')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  async startGateway(): Promise<void> {
    await fetch('/api/gateway/start', { method: 'POST' })
  },
  
  async stopGateway(): Promise<void> {
    await fetch('/api/gateway/stop', { method: 'POST' })
  },
  
  async restartGateway(): Promise<void> {
    await fetch('/api/gateway/restart', { method: 'POST' })
  },
  
  async getConfig(): Promise<OpenClawConfig> {
    const res = await fetch('/api/config')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  async setConfig(path: string, value: any): Promise<void> {
    await fetch(`/api/config/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  },
  
  async getChannels(): Promise<ChannelInfo[]> {
    const res = await fetch('/api/channels')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  async addChannel(channel: ChannelConfig): Promise<void> {
    await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channel),
    })
  },
  
  async removeChannel(id: string): Promise<void> {
    await fetch(`/api/channels/${id}`, { method: 'DELETE' })
  },
  
  async getModels(): Promise<ModelInfo[]> {
    const res = await fetch('/api/models')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  async setDefaultModel(modelId: string): Promise<void> {
    await fetch('/api/models/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    })
  },
  
  async getSkills(): Promise<SkillInfo[]> {
    const res = await fetch('/api/skills')
    if (!res.ok) return []
    return res.json()
  },
  
  async searchSkills(query: string): Promise<SkillInfo[]> {
    const res = await fetch(`/api/skills/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    return res.json()
  },
  
  async installSkill(slug: string): Promise<void> {
    await fetch('/api/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
  },
  
  async uninstallSkill(slug: string): Promise<void> {
    await fetch('/api/skills/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
  },
  
  async getAgents(): Promise<AgentInfo[]> {
    const res = await fetch('/api/agents')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  async createAgent(agent: AgentConfig): Promise<void> {
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agent),
    })
  },
  
  async deleteAgent(id: string): Promise<void> {
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
  },
  
  async getLogs(lines: number): Promise<LogEntry[]> {
    const res = await fetch(`/api/logs?lines=${lines}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  
  streamLogs(callback: (entry: LogEntry) => void): () => void {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/logs/stream`)
    ws.onmessage = (e) => callback(JSON.parse(e.data))
    return () => ws.close()
  },
}

// Tauri 适配器 - 直接调用本地命令
const tauriAdapter: PlatformAdapter = {
  async detectSystem(): Promise<SystemInfo> {
    return invoke<SystemInfo>('detect_system')
  },
  
  async getGatewayStatus(): Promise<GatewayStatus> {
    return invoke<GatewayStatus>('get_gateway_status')
  },
  
  async startGateway(): Promise<void> {
    return invoke('start_gateway')
  },
  
  async stopGateway(): Promise<void> {
    return invoke('stop_gateway')
  },
  
  async restartGateway(): Promise<void> {
    return invoke('restart_gateway')
  },
  
  async getConfig(): Promise<OpenClawConfig> {
    const result = await invoke<{ data: any }>('get_config')
    return result.data
  },
  
  async setConfig(path: string, value: any): Promise<void> {
    const current = await invoke<{ data: any }>('get_config')
    const updated = { ...current.data }
    const keys = path.split('.')
    let obj: any = updated
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] = obj[keys[i]] || {}
    }
    obj[keys[keys.length - 1]] = value
    await invoke('save_config', { config: updated })
  },
  
  async getChannels(): Promise<ChannelInfo[]> {
    const config = await this.getConfig()
    const channels = config.channels || {}
    return Object.entries(channels).map(([id, ch]: [string, any]) => ({
      id,
      name: id,
      type: id,
      enabled: ch.enabled !== false,
      connected: ch.enabled !== false,
    }))
  },
  
  async addChannel(channel: ChannelConfig): Promise<void> {
    const config = await this.getConfig()
    config.channels = config.channels || {}
    config.channels[channel.type] = { enabled: true, ...channel.config }
    await invoke('save_config', { config })
  },
  
  async removeChannel(id: string): Promise<void> {
    const config = await this.getConfig()
    if (config.channels && config.channels[id]) {
      delete config.channels[id]
      await invoke('save_config', { config })
    }
  },
  
  async getModels(): Promise<ModelInfo[]> {
    const config = await this.getConfig()
    const providers = config.models?.providers || {}
    const models: ModelInfo[] = []
    for (const [provider, cfg] of Object.entries(providers)) {
      if ((cfg as any).models) {
        for (const model of (cfg as any).models) {
          models.push({
            id: `${provider}/${model}`,
            name: model,
            provider,
            enabled: true,
          })
        }
      }
    }
    return models
  },
  
  async setDefaultModel(modelId: string): Promise<void> {
    const config = await this.getConfig()
    config.agents = config.agents || {}
    config.agents.defaults = config.agents.defaults || {}
    config.agents.defaults.model = { primary: modelId }
    await invoke('save_config', { config })
  },
  
  async getSkills(): Promise<SkillInfo[]> {
    try {
      const result = await invoke<string>('run_openclaw_command', { 
        args: ['clawhub', 'list', '--json'] 
      })
      const skills = JSON.parse(result)
      return skills.map((s: any) => ({
        slug: s.slug || s.name,
        name: s.name,
        description: s.description || '',
        version: s.version || 'unknown',
        installed: true,
      }))
    } catch {
      return []
    }
  },
  
  async searchSkills(query: string): Promise<SkillInfo[]> {
    try {
      const result = await invoke<string>('run_openclaw_command', { 
        args: ['clawhub', 'search', query, '--json'] 
      })
      const skills = JSON.parse(result)
      return skills.map((s: any) => ({
        slug: s.slug || s.name,
        name: s.name,
        description: s.description || '',
        version: s.version || 'unknown',
        installed: false,
      }))
    } catch {
      return []
    }
  },
  
  async installSkill(slug: string): Promise<void> {
    await invoke('run_openclaw_command', { args: ['clawhub', 'install', slug] })
  },
  
  async uninstallSkill(slug: string): Promise<void> {
    await invoke('run_openclaw_command', { args: ['clawhub', 'uninstall', slug] })
  },
  
  async getAgents(): Promise<AgentInfo[]> {
    const config = await this.getConfig()
    const agents = config.agents?.list || []
    return agents.map((a: any) => ({
      id: a.id,
      name: a.name || a.id,
      model: a.model || config.agents?.defaults?.model?.primary || 'unknown',
      workspace: a.workspace || a.agentDir || config.agents?.defaults?.workspace || 'unknown',
    }))
  },
  
  async createAgent(agent: AgentConfig): Promise<void> {
    const config = await this.getConfig()
    config.agents = config.agents || {}
    config.agents.list = config.agents.list || []
    config.agents.list.push({
      id: agent.id,
      name: agent.name,
      model: agent.model,
    })
    await invoke('save_config', { config })
  },
  
  async deleteAgent(id: string): Promise<void> {
    const config = await this.getConfig()
    if (config.agents?.list) {
      config.agents.list = config.agents.list.filter((a: any) => a.id !== id)
      await invoke('save_config', { config })
    }
  },
  
  async getLogs(lines: number): Promise<LogEntry[]> {
    const logs = await invoke<string[]>('get_logs', { lines })
    return logs.map(line => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.*)$/)
      if (match) {
        return {
          timestamp: match[1],
          level: match[2] as any,
          message: match[3],
        }
      }
      return {
        timestamp: new Date().toISOString(),
        level: 'INFO' as const,
        message: line,
      }
    })
  },
  
  streamLogs(callback: (entry: LogEntry) => void): () => void {
    const interval = setInterval(async () => {
      try {
        const logs = await this.getLogs(1)
        if (logs.length > 0) {
          callback(logs[0])
        }
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  },
}

// 导出当前平台适配器
export const platform: PlatformAdapter = isTauri ? tauriAdapter : webAdapter
