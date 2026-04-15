import type { OpenClawConfig, SystemInfo } from '@/lib/types'
import { PROVIDERS, getProviderKind, getProviderRuntimeId } from '@/modules/setup/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const IMAGE_ONLY_RUNTIME_IDS = new Set(
  Object.keys(PROVIDERS)
    .map((providerId) => getProviderRuntimeId(providerId))
    .filter((runtimeProviderId, index, all) => {
      if (all.indexOf(runtimeProviderId) !== index) return false
      const runtimeKinds = Object.keys(PROVIDERS)
        .filter((providerId) => getProviderRuntimeId(providerId) === runtimeProviderId)
        .map((providerId) => getProviderKind(providerId))
      return runtimeKinds.length > 0 && runtimeKinds.every((kind) => kind === 'text-to-image')
    }),
)

function hasConfiguredProvider(config: OpenClawConfig): boolean {
  const providers = config.models?.providers
  if (!providers) return false

  return Object.entries(providers).some(([providerId, provider]) => {
    if (!isRecord(provider)) return false

    if (IMAGE_ONLY_RUNTIME_IDS.has(providerId)) {
      return false
    }

    const hasPrimaryApiKey = hasText(provider.apiKey) || hasText(provider.api_key)
    const hasPrimaryBaseUrl = hasText(provider.baseUrl)
    const hasImageApiKey = hasText(provider.imageApiKey)
    const hasImageBaseUrl = hasText(provider.imageBaseUrl)
    const imageApiKey = hasText(provider.imageApiKey) ? provider.imageApiKey : null
    const apiKey = hasText(provider.apiKey) ? provider.apiKey : null

    const models = provider.models
    const hasModels = Array.isArray(models) && models.length > 0
    const looksLikeImageOnlyAlias =
      (hasImageApiKey || hasImageBaseUrl) &&
      !hasModels &&
      !hasPrimaryBaseUrl &&
      (!hasPrimaryApiKey || apiKey === imageApiKey)

    if (looksLikeImageOnlyAlias) {
      return false
    }

    return hasPrimaryApiKey || hasPrimaryBaseUrl || hasModels
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

function hasNonProviderConfig(config: OpenClawConfig): boolean {
  return Object.entries(config).some(([key, value]) => {
    if (key === 'models') return false
    if (Array.isArray(value)) return value.length > 0
    if (isRecord(value)) return Object.keys(value).length > 0
    return value !== null && value !== undefined && value !== ''
  })
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

  return hasExistingConfig(systemInfo) && hasNonProviderConfig(config)
}
