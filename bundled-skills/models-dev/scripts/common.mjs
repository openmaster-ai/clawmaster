import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_MODELS_DEV_URL = 'https://models.dev/api.json'
export const DEFAULT_CACHE_PATH = path.join(os.homedir(), '.openclaw', 'cache', 'models-dev.json')
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function normalizeBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return null
}

function normalizeStringToken(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function parseArgs(argv) {
  const options = {
    refresh: false,
    summary: false,
    cachePath: DEFAULT_CACHE_PATH,
    maxAgeMs: DEFAULT_MAX_AGE_MS,
    provider: '',
    model: '',
    family: '',
    supports: [],
    inputModalities: [],
    outputModalities: [],
    openWeights: null,
    limit: 50,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--refresh') {
      options.refresh = true
    } else if (arg === '--summary') {
      options.summary = true
    } else if (arg === '--cache-path' && next) {
      options.cachePath = next
      index += 1
    } else if (arg === '--max-age-ms' && next) {
      const parsed = Number(next)
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --max-age-ms value: ${next}`)
      }
      options.maxAgeMs = parsed
      index += 1
    } else if (arg === '--provider' && next) {
      options.provider = next
      index += 1
    } else if (arg === '--model' && next) {
      options.model = next
      index += 1
    } else if (arg === '--family' && next) {
      options.family = next
      index += 1
    } else if (arg === '--supports' && next) {
      options.supports.push(normalizeStringToken(next))
      index += 1
    } else if (arg === '--input-modality' && next) {
      options.inputModalities.push(normalizeStringToken(next))
      index += 1
    } else if (arg === '--output-modality' && next) {
      options.outputModalities.push(normalizeStringToken(next))
      index += 1
    } else if (arg === '--open-weights' && next) {
      const parsed = normalizeBoolean(next)
      if (parsed === null) {
        throw new Error(`Invalid --open-weights value: ${next}`)
      }
      options.openWeights = parsed
      index += 1
    } else if (arg === '--limit' && next) {
      const parsed = Number(next)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Invalid --limit value: ${next}`)
      }
      options.limit = parsed
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function normalizeProvider(rawProvider) {
  const models = Object.values(rawProvider.models ?? {}).map((rawModel) => {
    const model = {
      ...rawModel,
      providerId: rawProvider.id,
      providerName: rawProvider.name,
      providerEnv: Array.isArray(rawProvider.env) ? rawProvider.env : [],
      providerNpm: rawProvider.npm ?? null,
      providerDoc: rawProvider.doc ?? null,
    }
    return model
  })

  return {
    id: rawProvider.id,
    name: rawProvider.name,
    env: Array.isArray(rawProvider.env) ? rawProvider.env : [],
    npm: rawProvider.npm ?? null,
    doc: rawProvider.doc ?? null,
    models,
  }
}

export function normalizeCatalog(rawProviders) {
  const providers = Object.values(rawProviders ?? {}).map(normalizeProvider)
  const models = providers.flatMap((provider) => provider.models)
  return {
    providerCount: providers.length,
    modelCount: models.length,
    providers,
    models,
  }
}

export async function fetchModelsDevCatalog(url = DEFAULT_MODELS_DEV_URL) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'clawmaster-models-dev-skill/1.0',
      'Accept': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`models.dev request failed (${response.status})`)
  }
  const json = await response.json()
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('models.dev payload must be a provider-keyed object')
  }
  return json
}

export function readCache(cachePath) {
  if (!fs.existsSync(cachePath)) return null
  const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  if (!raw || typeof raw !== 'object') return null
  return raw
}

export function writeCache(cachePath, payload) {
  ensureParentDir(cachePath)
  fs.writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function loadCatalog({
  cachePath = DEFAULT_CACHE_PATH,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  refresh = false,
  url = DEFAULT_MODELS_DEV_URL,
} = {}) {
  const cached = readCache(cachePath)
  const now = Date.now()
  const cachedAt = typeof cached?.fetchedAt === 'string' ? Date.parse(cached.fetchedAt) : Number.NaN
  const cacheFresh = Number.isFinite(cachedAt) && now - cachedAt <= maxAgeMs

  if (!refresh && cached?.catalog && cacheFresh) {
    return {
      fetchedAt: cached.fetchedAt,
      cachePath,
      sourceUrl: cached.sourceUrl ?? url,
      fromCache: true,
      catalog: normalizeCatalog(cached.catalog),
    }
  }

  const rawCatalog = await fetchModelsDevCatalog(url)
  const fetchedAt = new Date(now).toISOString()
  writeCache(cachePath, {
    fetchedAt,
    sourceUrl: url,
    catalog: rawCatalog,
  })

  return {
    fetchedAt,
    cachePath,
    sourceUrl: url,
    fromCache: false,
    catalog: normalizeCatalog(rawCatalog),
  }
}

function matchesNeedles(...values) {
  return (needle) => {
    const normalizedNeedle = normalizeStringToken(needle)
    if (!normalizedNeedle) return true
    return values.some((value) => normalizeStringToken(value).includes(normalizedNeedle))
  }
}

export function queryCatalog(catalog, options) {
  const providerMatches = matchesNeedles
  const modelMatches = matchesNeedles

  let models = catalog.models.filter((model) => {
    if (options.provider && !providerMatches(model.providerId, model.providerName)(options.provider)) {
      return false
    }
    if (options.model && !modelMatches(model.id, model.name)(options.model)) {
      return false
    }
    if (options.family && normalizeStringToken(model.family) !== normalizeStringToken(options.family)) {
      return false
    }
    if (options.openWeights !== null && Boolean(model.open_weights) !== options.openWeights) {
      return false
    }
    if (options.supports.some((capability) => model[capability] !== true)) {
      return false
    }
    if (options.inputModalities.some((modality) => !model.modalities?.input?.some((value) => normalizeStringToken(value) === modality))) {
      return false
    }
    if (options.outputModalities.some((modality) => !model.modalities?.output?.some((value) => normalizeStringToken(value) === modality))) {
      return false
    }
    return true
  })

  models = models
    .sort((left, right) => {
      const providerOrder = String(left.providerId).localeCompare(String(right.providerId))
      if (providerOrder !== 0) return providerOrder
      return String(left.id).localeCompare(String(right.id))
    })
    .slice(0, options.limit)

  const providerIds = new Set(models.map((model) => model.providerId))
  const providers = catalog.providers
    .filter((provider) => providerIds.has(provider.id))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      env: provider.env,
      npm: provider.npm,
      doc: provider.doc,
      modelCount: provider.models.length,
    }))

  return {
    providers,
    models,
  }
}

export function summarizeQueryResult(result) {
  return {
    providerCount: result.providers.length,
    modelCount: result.models.length,
    providers: result.providers,
    models: result.models.map((model) => ({
      providerId: model.providerId,
      providerName: model.providerName,
      id: model.id,
      name: model.name,
      family: model.family ?? null,
      reasoning: model.reasoning ?? false,
      tool_call: model.tool_call ?? false,
      structured_output: model.structured_output ?? false,
      open_weights: model.open_weights ?? false,
      knowledge: model.knowledge ?? null,
      release_date: model.release_date ?? null,
      last_updated: model.last_updated ?? null,
      modalities: model.modalities ?? { input: [], output: [] },
      cost: model.cost ?? null,
      limit: model.limit ?? null,
    })),
  }
}
