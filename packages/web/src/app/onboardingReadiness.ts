import type { OpenClawConfig, SystemInfo } from '@/lib/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasConfiguredProvider(config: OpenClawConfig): boolean {
  const providers = config.models?.providers
  if (!providers) return false

  return Object.values(providers).some((provider) => {
    if (!isRecord(provider)) return false

    if (hasText(provider.apiKey)) return true
    if (hasText(provider.baseUrl)) return true

    const models = provider.models
    return Array.isArray(models) && models.length > 0
  })
}

function hasDefaultModel(config: OpenClawConfig): boolean {
  return hasText(config.agents?.defaults?.model?.primary)
}

function hasAgents(config: OpenClawConfig): boolean {
  return Array.isArray(config.agents?.list) && config.agents.list.length > 0
}

function hasChannels(config: OpenClawConfig): boolean {
  return Boolean(config.channels && Object.keys(config.channels).length > 0)
}

function hasBindings(config: OpenClawConfig): boolean {
  return Array.isArray(config.bindings) && config.bindings.length > 0
}

function hasExistingConfig(systemInfo: SystemInfo | null | undefined): boolean {
  if (!systemInfo) return false
  return systemInfo.openclaw.existingConfigPaths?.includes(systemInfo.openclaw.configPath) ?? false
}

export function isOnboardingEnvironmentReady(
  systemInfo: SystemInfo | null | undefined,
  config: OpenClawConfig | null | undefined,
): boolean {
  if (!config) return false

  const hasMeaningfulConfig =
    hasConfiguredProvider(config) ||
    hasDefaultModel(config) ||
    hasAgents(config) ||
    hasChannels(config) ||
    hasBindings(config)

  if (hasMeaningfulConfig) return true

  return hasExistingConfig(systemInfo) && Object.keys(config).length > 0
}
