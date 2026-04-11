import i18n from '@/i18n'
import type {
  AgentConfig,
  AgentInfo,
  ChannelConfig,
  ChannelInfo,
  LogEntry,
  ModelInfo,
  OpenClawConfig,
  PlatformAdapter,
  SkillInfo,
  SystemInfo,
  GatewayStatus,
} from '@/lib/types'
import { getLogsResult } from '@/shared/adapters/logs'
import { platformResults } from '@/shared/adapters/platformResults'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { createAuthedWebSocketUrl } from '@/shared/adapters/webHttp'

function unwrap<T>(r: AdapterResult<T>, emptyFallback?: T): T {
  if (!r.success) {
    throw new Error(r.error || i18n.t('common.requestFailed'))
  }
  if (r.data !== undefined) {
    return r.data
  }
  if (emptyFallback !== undefined) {
    return emptyFallback
  }
  return undefined as T
}

function unwrapVoid(r: AdapterResult<void>): void {
  if (!r.success) {
    throw new Error(r.error || i18n.t('common.requestFailed'))
  }
}

export function createLegacyPlatformAdapter(): PlatformAdapter {
  return {
    async detectSystem(): Promise<SystemInfo> {
      return unwrap(await platformResults.detectSystem())
    },

    async getGatewayStatus(): Promise<GatewayStatus> {
      return unwrap(await platformResults.getGatewayStatus())
    },

    async startGateway(): Promise<void> {
      unwrapVoid(await platformResults.startGateway())
    },

    async stopGateway(): Promise<void> {
      unwrapVoid(await platformResults.stopGateway())
    },

    async restartGateway(): Promise<void> {
      unwrapVoid(await platformResults.restartGateway())
    },

    async getConfig(): Promise<OpenClawConfig> {
      return unwrap(await platformResults.getConfig())
    },

    async setConfig(path: string, value: unknown): Promise<void> {
      unwrapVoid(await platformResults.setConfig(path, value))
    },

    async getChannels(): Promise<ChannelInfo[]> {
      return unwrap(await platformResults.getChannels(), [])
    },

    async addChannel(channel: ChannelConfig): Promise<void> {
      unwrapVoid(await platformResults.addChannel(channel))
    },

    async removeChannel(id: string): Promise<void> {
      unwrapVoid(await platformResults.removeChannel(id))
    },

    async getModels(): Promise<ModelInfo[]> {
      return unwrap(await platformResults.getModels(), [])
    },

    async setDefaultModel(modelId: string): Promise<void> {
      unwrapVoid(await platformResults.setDefaultModel(modelId))
    },

    async getSkills(): Promise<SkillInfo[]> {
      return unwrap(await platformResults.getSkills(), [])
    },

    async searchSkills(query: string): Promise<SkillInfo[]> {
      return unwrap(await platformResults.searchSkills(query), [])
    },

    async installSkill(slug: string): Promise<void> {
      unwrapVoid(await platformResults.installSkill(slug))
    },

    async uninstallSkill(slug: string): Promise<void> {
      unwrapVoid(await platformResults.uninstallSkill(slug))
    },

    async getAgents(): Promise<AgentInfo[]> {
      return unwrap(await platformResults.getAgents(), [])
    },

    async createAgent(agent: AgentConfig): Promise<void> {
      unwrapVoid(await platformResults.createAgent(agent))
    },

    async deleteAgent(id: string): Promise<void> {
      unwrapVoid(await platformResults.deleteAgent(id))
    },

    async getLogs(lines: number): Promise<LogEntry[]> {
      return unwrap(await platformResults.getLogs(lines), [])
    },

    streamLogs(callback: (entry: LogEntry) => void): () => void {
      if (getIsTauri()) {
        const interval = window.setInterval(async () => {
          const r = await getLogsResult(1)
          if (r.success && r.data && r.data.length > 0) {
            callback(r.data[0])
          }
        }, 2000)
        return () => window.clearInterval(interval)
      }
      const ws = new WebSocket(createAuthedWebSocketUrl('/api/logs/stream'))
      ws.onmessage = (e) => callback(JSON.parse(e.data) as LogEntry)
      return () => ws.close()
    },
  }
}
