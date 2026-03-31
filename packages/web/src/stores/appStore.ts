import { create } from 'zustand'
import {
  SystemInfo,
  GatewayStatus,
  OpenClawConfig,
  ChannelInfo,
  ModelInfo,
  SkillInfo,
  AgentInfo,
} from '@/lib/types'

interface AppState {
  // System
  systemInfo: SystemInfo | null
  isLoading: boolean
  error: string | null

  // Gateway
  gatewayStatus: GatewayStatus | null

  // Config
  config: OpenClawConfig | null

  // Channels
  channels: ChannelInfo[]

  // Models
  models: ModelInfo[]

  // Skills
  skills: SkillInfo[]

  // Agents
  agents: AgentInfo[]

  // Current instance
  currentInstance: string

  // Actions
  setSystemInfo: (info: SystemInfo) => void
  setGatewayStatus: (status: GatewayStatus) => void
  setConfig: (config: OpenClawConfig) => void
  setChannels: (channels: ChannelInfo[]) => void
  setModels: (models: ModelInfo[]) => void
  setSkills: (skills: SkillInfo[]) => void
  setAgents: (agents: AgentInfo[]) => void
  setCurrentInstance: (instance: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  systemInfo: null,
  isLoading: false,
  error: null,
  gatewayStatus: null,
  config: null,
  channels: [],
  models: [],
  skills: [],
  agents: [],
  currentInstance: 'default',

  setSystemInfo: (info) => set({ systemInfo: info }),
  setGatewayStatus: (status) => set({ gatewayStatus: status }),
  setConfig: (config) => set({ config }),
  setChannels: (channels) => set({ channels }),
  setModels: (models) => set({ models }),
  setSkills: (skills) => set({ skills }),
  setAgents: (agents) => set({ agents }),
  setCurrentInstance: (instance) => set({ currentInstance: instance }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
