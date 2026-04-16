import type { OpenClawConfig, OpenClawModelProvider, OpenClawModelRef } from '@/lib/types'
import { PROVIDERS, getProviderKind, getProviderLabel, getProviderRuntimeId } from './types'

export interface ToolModelRecommendation {
  key: string
  providerId: string
  providerLabel: string
  modelId: string
  modelLabel: string
  modelRef: string
}

type RecommendationCandidate = ToolModelRecommendation & {
  score: number
  isCurrentDefault: boolean
}

const FALLBACK_MODEL_EXAMPLES = [
  { providerId: 'openai', modelId: 'gpt-4.1' },
  { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
  { providerId: 'google', modelId: 'gemini-2.5-pro' },
] as const

const TOOL_MODEL_SCORES: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /kimi-k2\.5/i, score: 160 },
  { pattern: /glm-5\.1/i, score: 150 },
  { pattern: /gpt-5/i, score: 150 },
  { pattern: /gpt-4\.1/i, score: 130 },
  { pattern: /claude-sonnet-4-6/i, score: 140 },
  { pattern: /claude-opus-4-6/i, score: 140 },
  { pattern: /gemini-2\.5-pro/i, score: 135 },
  { pattern: /gemini-2\.5-flash/i, score: 110 },
  { pattern: /kimi-k2-thinking/i, score: 110 },
  { pattern: /qwen3-coder/i, score: 100 },
  { pattern: /deepseek-v3\.2/i, score: 95 },
  { pattern: /deepseek-v3/i, score: 85 },
]

const EXCLUDED_MODEL_PATTERNS = [
  /image/i,
  /embedding/i,
  /reranker/i,
  /tts/i,
  /speech/i,
  /asr/i,
]

function normalizeModelOption(model: string | OpenClawModelRef | undefined) {
  if (!model) return null
  if (typeof model === 'string') {
    const id = model.trim()
    return id ? { id, name: formatModelLabel(id) } : null
  }

  const id = model.id?.trim()
  if (!id) return null
  return {
    id,
    name: model.name?.trim() || formatModelLabel(id),
  }
}

function formatModelLabel(modelId: string) {
  const tail = modelId.split('/').filter(Boolean).at(-1) || modelId
  return tail.replace(/[-_]+/g, ' ').trim()
}

function getCanonicalTextProviderId(runtimeProviderId: string) {
  const knownId = Object.keys(PROVIDERS).find((providerId) =>
    getProviderKind(providerId) === 'text' && getProviderRuntimeId(providerId) === runtimeProviderId,
  )

  return knownId ?? runtimeProviderId
}

function scoreModel(modelId: string, modelLabel: string) {
  const haystack = `${modelId} ${modelLabel}`

  if (EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return Number.NEGATIVE_INFINITY
  }

  let score = 0

  for (const entry of TOOL_MODEL_SCORES) {
    if (entry.pattern.test(haystack)) {
      score = Math.max(score, entry.score)
    }
  }

  if (/pro|opus|sonnet|thinking|coder/i.test(haystack)) score += 18
  if (/mini|nano|lite|tiny|8b|7b/i.test(haystack)) score -= 16
  if (/flash/i.test(haystack)) score -= 6

  return score
}

function pushCandidate(
  candidates: RecommendationCandidate[],
  seen: Set<string>,
  {
    providerId,
    providerLabel,
    modelId,
    modelLabel,
    isCurrentDefault,
  }: {
    providerId: string
    providerLabel: string
    modelId: string
    modelLabel: string
    isCurrentDefault: boolean
  },
) {
  const modelRef = `${getProviderRuntimeId(providerId)}/${modelId}`
  const key = `${providerId}:${modelId}`
  if (seen.has(key)) return

  const score = scoreModel(modelId, modelLabel)
  if (!Number.isFinite(score)) return

  seen.add(key)
  candidates.push({
    key,
    providerId,
    providerLabel,
    modelId,
    modelLabel,
    modelRef,
    isCurrentDefault,
    score: score + (isCurrentDefault ? 40 : 0),
  })
}

function collectConfiguredTextCandidates(config: OpenClawConfig | null, locale?: string) {
  const providers = config?.models?.providers ?? {}
  const currentDefault = config?.agents?.defaults?.model?.primary?.trim() || ''
  const candidates: RecommendationCandidate[] = []
  const seen = new Set<string>()

  for (const [runtimeProviderId, provider] of Object.entries(providers)) {
    const canonicalProviderId = getCanonicalTextProviderId(runtimeProviderId)
    if (getProviderKind(canonicalProviderId) !== 'text') continue

    const providerLabel = getProviderLabel(canonicalProviderId, locale)
    const savedModels = (provider as OpenClawModelProvider).models ?? []

    for (const model of savedModels) {
      const option = normalizeModelOption(model)
      if (!option) continue
      pushCandidate(candidates, seen, {
        providerId: canonicalProviderId,
        providerLabel,
        modelId: option.id,
        modelLabel: option.name,
        isCurrentDefault: currentDefault === `${runtimeProviderId}/${option.id}`,
      })
    }

    if (currentDefault.startsWith(`${runtimeProviderId}/`)) {
      const currentModelId = currentDefault.slice(runtimeProviderId.length + 1)
      const savedOption = savedModels
        .map((model) => normalizeModelOption(model))
        .find((model) => model?.id === currentModelId)

      pushCandidate(candidates, seen, {
        providerId: canonicalProviderId,
        providerLabel,
        modelId: currentModelId,
        modelLabel: savedOption?.name ?? formatModelLabel(currentModelId),
        isCurrentDefault: true,
      })
    }
  }

  return candidates
}

function buildFallbackCandidates(locale?: string): RecommendationCandidate[] {
  return FALLBACK_MODEL_EXAMPLES.map(({ providerId, modelId }) => {
    const modelLabel = PROVIDERS[providerId]?.models.find((model) => model.id === modelId)?.name ?? modelId
    return {
      key: `${providerId}:${modelId}`,
      providerId,
      providerLabel: getProviderLabel(providerId, locale),
      modelId,
      modelLabel,
      modelRef: `${getProviderRuntimeId(providerId)}/${modelId}`,
      isCurrentDefault: false,
      score: scoreModel(modelId, modelLabel),
    }
  })
}

export function getToolModelRecommendations(
  config: OpenClawConfig | null,
  locale?: string,
  max = 3,
): ToolModelRecommendation[] {
  const configuredCandidates = collectConfiguredTextCandidates(config, locale)
  const rankedCandidates = (configuredCandidates.length > 0 ? configuredCandidates : buildFallbackCandidates(locale))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      if (left.isCurrentDefault !== right.isCurrentDefault) return left.isCurrentDefault ? -1 : 1
      return left.modelLabel.localeCompare(right.modelLabel)
    })

  const selected: RecommendationCandidate[] = []
  const usedRefs = new Set<string>()
  const usedProviders = new Set<string>()

  const currentDefault = rankedCandidates.find((candidate) => candidate.isCurrentDefault)
  if (currentDefault) {
    selected.push(currentDefault)
    usedRefs.add(currentDefault.modelRef)
    usedProviders.add(currentDefault.providerId)
  }

  for (const candidate of rankedCandidates) {
    if (selected.length >= max) break
    if (usedRefs.has(candidate.modelRef)) continue
    if (usedProviders.has(candidate.providerId) && rankedCandidates.some((item) => !usedProviders.has(item.providerId))) {
      continue
    }
    selected.push(candidate)
    usedRefs.add(candidate.modelRef)
    usedProviders.add(candidate.providerId)
  }

  for (const candidate of rankedCandidates) {
    if (selected.length >= max) break
    if (usedRefs.has(candidate.modelRef)) continue
    selected.push(candidate)
    usedRefs.add(candidate.modelRef)
  }

  return selected.map(({ key, providerId, providerLabel, modelId, modelLabel, modelRef }) => ({
    key,
    providerId,
    providerLabel,
    modelId,
    modelLabel,
    modelRef,
  }))
}
