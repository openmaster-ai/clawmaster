import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

export const DEFAULT_MODELS_DEV_URL = 'https://models.dev/api.json'
export const DEFAULT_CACHE_PATH = path.join(os.homedir(), '.openclaw', 'cache', 'models-dev.json')
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const DEFAULT_TOP_N = 5

const PERIOD_CONFIG = {
  day: {
    title: 'Daily OpenClaw Cost Digest',
    windowLabel: 'Last 24 hours',
    durationMs: 24 * 60 * 60 * 1000,
    includeDailyBreakdown: false,
  },
  week: {
    title: 'Weekly OpenClaw Cost Digest',
    windowLabel: 'Last 7 days',
    durationMs: 7 * 24 * 60 * 60 * 1000,
    includeDailyBreakdown: true,
  },
  month: {
    title: 'Monthly OpenClaw Cost Digest',
    windowLabel: 'Last 30 days',
    durationMs: 30 * 24 * 60 * 60 * 1000,
    includeDailyBreakdown: true,
  },
}

const PROVIDER_ALIASES = {
  alibaba: ['alibaba', 'qwen'],
  deepseek: ['deepseek', 'deepseek-ai'],
  moonshotai: ['moonshotai', 'moonshot', 'kimi-coding'],
  zhipuai: ['zhipuai', 'zhipu', 'zai-org'],
}
const ROUTED_MODEL_PREFIXES = [
  ['openrouter'],
  ['siliconflow'],
  ['siliconflow', 'Pro'],
]

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function normalizeStringToken(value) {
  return String(value ?? '').trim().toLowerCase()
}

function toFiniteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
  }
}

export function formatLocalDate(date) {
  const parts = formatDateParts(date)
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

export function formatLocalDateTime(date) {
  const parts = formatDateParts(date)
  return `${formatLocalDate(date)} ${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`
}

function timezoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  } catch {
    return 'local'
  }
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${flagName} value: ${value}`)
  }
  return parsed
}

export function parseArgs(argv) {
  const options = {
    period: 'day',
    summary: false,
    refreshPricing: false,
    cachePath: DEFAULT_CACHE_PATH,
    maxAgeMs: DEFAULT_MAX_AGE_MS,
    top: DEFAULT_TOP_N,
    now: Date.now(),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--summary') {
      options.summary = true
    } else if (arg === '--refresh-pricing') {
      options.refreshPricing = true
    } else if (arg === '--period' && next) {
      if (!(next in PERIOD_CONFIG)) {
        throw new Error(`Invalid --period value: ${next}`)
      }
      options.period = next
      index += 1
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
    } else if (arg === '--top' && next) {
      options.top = parsePositiveInteger(next, '--top')
      index += 1
    } else if (arg === '--now' && next) {
      const parsed = Date.parse(next)
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid --now value: ${next}`)
      }
      options.now = parsed
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function normalizeProvider(rawProvider) {
  const models = Object.values(rawProvider.models ?? {}).map((rawModel) => ({
    ...rawModel,
    providerId: rawProvider.id,
    providerName: rawProvider.name,
  }))

  return {
    id: rawProvider.id,
    name: rawProvider.name,
    models,
  }
}

function normalizeCatalog(rawProviders) {
  const providers = Object.values(rawProviders ?? {}).map(normalizeProvider)
  const models = providers.flatMap((provider) => provider.models)
  return {
    providerCount: providers.length,
    modelCount: models.length,
    providers,
    models,
  }
}

async function fetchModelsDevCatalog(url = DEFAULT_MODELS_DEV_URL) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'clawmaster-clawprobe-cost-digest/1.0',
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

function readCache(cachePath) {
  if (!fs.existsSync(cachePath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

function writeCache(cachePath, payload) {
  ensureParentDir(cachePath)
  fs.writeFileSync(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function loadModelsDevCatalog({
  cachePath = DEFAULT_CACHE_PATH,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  refresh = false,
  url = DEFAULT_MODELS_DEV_URL,
  now = Date.now(),
} = {}) {
  const cached = readCache(cachePath)
  const cachedAt = typeof cached?.fetchedAt === 'string' ? Date.parse(cached.fetchedAt) : Number.NaN
  const cacheFresh = Number.isFinite(cachedAt) && now - cachedAt <= maxAgeMs

  if (!refresh && cached?.catalog && cacheFresh) {
    return {
      fetchedAt: cached.fetchedAt,
      cachePath,
      sourceUrl: cached.sourceUrl ?? url,
      fromCache: true,
      stale: false,
      refreshError: null,
      catalog: normalizeCatalog(cached.catalog),
      rawCatalog: cached.catalog,
    }
  }

  try {
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
      stale: false,
      refreshError: null,
      catalog: normalizeCatalog(rawCatalog),
      rawCatalog,
    }
  } catch (error) {
    if (cached?.catalog) {
      return {
        fetchedAt: cached.fetchedAt,
        cachePath,
        sourceUrl: cached.sourceUrl ?? url,
        fromCache: true,
        stale: true,
        refreshError: error instanceof Error ? error.message : String(error),
        catalog: normalizeCatalog(cached.catalog),
        rawCatalog: cached.catalog,
      }
    }
    throw error
  }
}

function getProviderAliases(providerId) {
  return PROVIDER_ALIASES[providerId] ?? [providerId]
}

function buildModelLookupKeys(providerAliases, modelId, modelKey) {
  const keys = new Set()
  const modelVariants = [...new Set([String(modelId ?? '').trim(), String(modelKey ?? '').trim()].filter(Boolean))]

  for (const providerAlias of providerAliases) {
    for (const modelVariant of modelVariants) {
      keys.add(`${providerAlias}/${modelVariant}`)
      for (const prefixParts of ROUTED_MODEL_PREFIXES) {
        keys.add([...prefixParts, providerAlias, modelVariant].join('/'))
      }
    }
  }

  return [...keys]
}

function hasExplicitCustomPriceForModel(model, provider, customPrices) {
  if (!model || !customPrices || typeof customPrices !== 'object') {
    return false
  }

  const candidates = new Set([String(model).trim()])
  const providerId = String(provider ?? '').trim()
  if (providerId) {
    candidates.add(`${providerId}/${model}`)
    for (const prefixParts of ROUTED_MODEL_PREFIXES) {
      candidates.add([...prefixParts, providerId, model].join('/'))
    }
  }

  for (const candidate of candidates) {
    if (candidate && Object.prototype.hasOwnProperty.call(customPrices, candidate)) {
      return true
    }
  }

  return false
}

function resolveModelForCost(model, fallbackModel, provider, customPrices) {
  const directCandidates = [
    String(model ?? '').trim(),
    String(fallbackModel ?? '').trim(),
  ].filter(Boolean)

  for (const candidate of directCandidates) {
    if (Object.prototype.hasOwnProperty.call(customPrices, candidate)) {
      return candidate
    }
  }

  const providerId = String(provider ?? '').trim()
  if (providerId) {
    for (const candidate of directCandidates) {
      const qualifiedCandidates = new Set([`${providerId}/${candidate}`])
      for (const prefixParts of ROUTED_MODEL_PREFIXES) {
        qualifiedCandidates.add([...prefixParts, providerId, candidate].join('/'))
      }

      for (const qualifiedCandidate of qualifiedCandidates) {
        if (Object.prototype.hasOwnProperty.call(customPrices, qualifiedCandidate)) {
          return qualifiedCandidate
        }
      }
    }
  }

  return directCandidates[0] ?? null
}

export const resolveModelForCostForTest = resolveModelForCost

function normalizeMultiplier(value, input) {
  return Number((value / input).toFixed(6))
}

function buildCustomPrice(rawCost) {
  if (!rawCost || typeof rawCost !== 'object' || Array.isArray(rawCost)) {
    return null
  }

  const input = typeof rawCost.input === 'number' && Number.isFinite(rawCost.input) ? rawCost.input : null
  const output = typeof rawCost.output === 'number' && Number.isFinite(rawCost.output) ? rawCost.output : null
  if (input === null || output === null || input < 0 || output < 0) {
    return null
  }

  const price = { input, output }
  const cacheRead = typeof rawCost.cache_read === 'number' && Number.isFinite(rawCost.cache_read) ? rawCost.cache_read : null
  const cacheWrite = typeof rawCost.cache_write === 'number' && Number.isFinite(rawCost.cache_write) ? rawCost.cache_write : null

  if (input > 0 && cacheRead !== null && cacheRead >= 0) {
    price.cacheReadMultiplier = normalizeMultiplier(cacheRead, input)
  }
  if (input > 0 && cacheWrite !== null && cacheWrite >= 0) {
    price.cacheWriteMultiplier = normalizeMultiplier(cacheWrite, input)
  }

  return price
}

export function buildClawprobeCustomPricesFromModelsDevCatalog(rawCatalog) {
  if (!rawCatalog || typeof rawCatalog !== 'object' || Array.isArray(rawCatalog)) {
    return {}
  }

  const prices = {}
  for (const [providerId, rawProvider] of Object.entries(rawCatalog)) {
    if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
      continue
    }
    const providerAliases = getProviderAliases(providerId)
    const models = rawProvider.models
    if (!models || typeof models !== 'object' || Array.isArray(models)) {
      continue
    }

    for (const [modelKey, rawModel] of Object.entries(models)) {
      if (!rawModel || typeof rawModel !== 'object' || Array.isArray(rawModel)) {
        continue
      }
      const modelId =
        typeof rawModel.id === 'string' && rawModel.id.trim() ? rawModel.id.trim() : modelKey
      const customPrice = buildCustomPrice(rawModel.cost)
      if (!customPrice) {
        continue
      }

      for (const lookupKey of buildModelLookupKeys(providerAliases, modelId, modelKey)) {
        prices[lookupKey] = customPrice
      }
    }
  }

  return prices
}

function getGlobalNpmRoot() {
  try {
    return execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
    }).trim()
  } catch {
    return null
  }
}

function firstExistingPackageRoot(candidates) {
  const seen = new Set()
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : ''
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    if (fs.existsSync(path.join(normalized, 'package.json'))) {
      return normalized
    }
  }
  return null
}

function getClawprobePackageRootFromBinary() {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
  try {
    const raw = execFileSync(lookupCommand, ['clawprobe'], {
      encoding: 'utf8',
      env: process.env,
      windowsHide: true,
    })
    const binaryPath = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    if (!binaryPath) {
      return null
    }

    const realBinaryPath = fs.realpathSync(binaryPath)
    return firstExistingPackageRoot([
      path.resolve(realBinaryPath, '..', '..'),
      path.resolve(realBinaryPath, '..', '..', '..'),
      path.resolve(path.dirname(binaryPath), '..', 'lib', 'node_modules', 'clawprobe'),
      path.resolve(path.dirname(binaryPath), '..', '..', 'lib', 'node_modules', 'clawprobe'),
    ])
  } catch {
    return null
  }
}

function getClawprobePackageRootFromNodeExec() {
  return firstExistingPackageRoot([
    path.resolve(process.execPath, '..', '..', 'lib', 'node_modules', 'clawprobe'),
    path.resolve(process.execPath, '..', 'node_modules', 'clawprobe'),
  ])
}

export function listNvmClawprobePackageRootsForTest(home = os.homedir()) {
  const versionsRoot = path.join(home, '.nvm', 'versions', 'node')
  try {
    return fs.readdirSync(versionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => path.join(versionsRoot, entry.name, 'lib', 'node_modules', 'clawprobe'))
  } catch {
    return []
  }
}

function getClawprobePackageRootFromHomeScan() {
  const home = os.homedir()
  return firstExistingPackageRoot([
    path.join(home, '.npm-global', 'lib', 'node_modules', 'clawprobe'),
    path.join(home, '.local', 'share', 'pnpm', 'global', '5', 'node_modules', 'clawprobe'),
    path.join(home, '.config', 'yarn', 'global', 'node_modules', 'clawprobe'),
    ...listNvmClawprobePackageRootsForTest(home),
  ])
}

function getClawprobePackageRoot() {
  const explicitRoot = process.env.CLAWPROBE_PACKAGE_ROOT
  const resolvedFromRequire = (() => {
    try {
      return path.dirname(require.resolve('clawprobe/package.json'))
    } catch {
      return null
    }
  })()
  const globalRoot = getGlobalNpmRoot()

  return firstExistingPackageRoot([
    explicitRoot,
    resolvedFromRequire,
    getClawprobePackageRootFromNodeExec(),
    globalRoot ? path.join(globalRoot, 'clawprobe') : null,
    getClawprobePackageRootFromBinary(),
    getClawprobePackageRootFromHomeScan(),
  ])
}

async function importClawprobeModule(packageRoot, relativePath) {
  return import(pathToFileURL(path.join(packageRoot, relativePath)).href)
}

async function loadClawprobeModules() {
  const packageRoot = getClawprobePackageRoot()
  if (!packageRoot) {
    throw new Error('ClawProbe is not installed or its package root could not be resolved')
  }

  const [
    configModule,
    sessionStoreModule,
    parserModule,
    costModule,
  ] = await Promise.all([
    importClawprobeModule(packageRoot, 'dist/core/config.js'),
    importClawprobeModule(packageRoot, 'dist/core/session-store.js'),
    importClawprobeModule(packageRoot, 'dist/core/jsonl-parser.js'),
    importClawprobeModule(packageRoot, 'dist/engines/cost.js'),
  ])

  return {
    resolveConfig: configModule.resolveConfig,
    readSessionsStore: sessionStoreModule.readSessionsStore,
    listJsonlFiles: sessionStoreModule.listJsonlFiles,
    sessionKeyFromPath: sessionStoreModule.sessionKeyFromPath,
    findJsonlPath: sessionStoreModule.findJsonlPath,
    parseSessionStats: parserModule.parseSessionStats,
    estimateCost: costModule.estimateCost,
    sessionCostFromEntry: costModule.sessionCostFromEntry,
  }
}

function buildTurnRecord(turn, fallbackModel, fallbackProvider, estimateCost, customPrices) {
  const model = turn.model ?? fallbackModel ?? null
  const provider = turn.provider ?? fallbackProvider ?? null
  const costModel = resolveModelForCost(model, fallbackModel, provider, customPrices)
  const usage = turn.usage ?? {}
  const inputTokens = toFiniteNumber(usage.input)
  const outputTokens = toFiniteNumber(usage.output)
  const cacheReadTokens = toFiniteNumber(usage.cacheRead)
  const cacheWriteTokens = toFiniteNumber(usage.cacheWrite)
  const usd = estimateCost(
    {
      input: inputTokens,
      output: outputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheWriteTokens,
    },
    costModel,
    customPrices,
  )

  return {
    timestamp: toFiniteNumber(turn.timestamp),
    date: formatLocalDate(new Date(toFiniteNumber(turn.timestamp) * 1000)),
    model,
    provider,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    usd,
    hasExplicitPrice: hasExplicitCustomPriceForModel(costModel, provider, customPrices),
    tools: Array.isArray(turn.tools) ? turn.tools : [],
  }
}

export async function discoverClawprobeSessions({ customPrices = {} } = {}) {
  const modules = await loadClawprobeModules()
  const cfg = modules.resolveConfig()
  const sessions = []
  const seenJsonlPaths = new Set()

  for (const entry of modules.readSessionsStore(cfg.sessionsDir)) {
    const jsonlPath = modules.findJsonlPath(cfg.sessionsDir, entry)
    if (jsonlPath) {
      seenJsonlPaths.add(jsonlPath)
      const stats = modules.parseSessionStats(jsonlPath)
      if (stats) {
        sessions.push({
          sessionKey: entry.sessionKey,
          sessionName: stats.sessionName ?? null,
          model: stats.model ?? null,
          provider: stats.provider ?? null,
          startedAt: toFiniteNumber(stats.startedAt),
          lastActiveAt: toFiniteNumber(stats.lastActiveAt),
          turns: Array.isArray(stats.turns)
            ? stats.turns.map((turn) =>
                buildTurnRecord(turn, stats.model, stats.provider, modules.estimateCost, customPrices),
              )
            : [],
        })
        continue
      }
    }

    const fallback = modules.sessionCostFromEntry(entry, customPrices)
    sessions.push({
      sessionKey: fallback.sessionKey,
      sessionName: null,
      model: fallback.model ?? null,
      provider: fallback.provider ?? null,
      startedAt: toFiniteNumber(fallback.startedAt),
      lastActiveAt: toFiniteNumber(fallback.lastActiveAt),
      turns: [
        {
          timestamp: toFiniteNumber(fallback.lastActiveAt),
          date: formatLocalDate(new Date(toFiniteNumber(fallback.lastActiveAt) * 1000)),
          model: fallback.model ?? null,
          provider: fallback.provider ?? null,
          inputTokens: toFiniteNumber(fallback.inputTokens),
          outputTokens: toFiniteNumber(fallback.outputTokens),
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          usd: toFiniteNumber(fallback.estimatedUsd),
          hasExplicitPrice: hasExplicitCustomPriceForModel(fallback.model ?? null, fallback.provider ?? null, customPrices),
          tools: [],
        },
      ],
    })
  }

  for (const jsonlPath of modules.listJsonlFiles(cfg.sessionsDir)) {
    if (seenJsonlPaths.has(jsonlPath)) continue
    const stats = modules.parseSessionStats(jsonlPath)
    if (!stats) continue
    sessions.push({
      sessionKey: modules.sessionKeyFromPath(jsonlPath),
      sessionName: stats.sessionName ?? null,
      model: stats.model ?? null,
      provider: stats.provider ?? null,
      startedAt: toFiniteNumber(stats.startedAt),
      lastActiveAt: toFiniteNumber(stats.lastActiveAt),
      turns: Array.isArray(stats.turns)
        ? stats.turns.map((turn) =>
            buildTurnRecord(turn, stats.model, stats.provider, modules.estimateCost, customPrices),
          )
        : [],
    })
  }

  return sessions.sort((left, right) => right.lastActiveAt - left.lastActiveAt)
}

function aggregateTurns(turns, top) {
  const totals = {
    totalUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turnCount: turns.length,
    sessionCount: 0,
  }

  const dailyMap = new Map()
  const modelMap = new Map()
  const sessionMap = new Map()
  const unpricedModels = new Set()

  for (const turn of turns) {
    totals.totalUsd += turn.usd
    totals.inputTokens += turn.inputTokens
    totals.outputTokens += turn.outputTokens
    totals.cacheReadTokens += turn.cacheReadTokens
    totals.cacheWriteTokens += turn.cacheWriteTokens

    const dayKey = turn.date
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, {
        date: dayKey,
        usd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })
    }
    const day = dailyMap.get(dayKey)
    day.usd += turn.usd
    day.inputTokens += turn.inputTokens
    day.outputTokens += turn.outputTokens
    day.cacheReadTokens += turn.cacheReadTokens
    day.cacheWriteTokens += turn.cacheWriteTokens

    const sessionKey = turn.sessionKey
    if (!sessionMap.has(sessionKey)) {
      sessionMap.set(sessionKey, {
        sessionKey,
        sessionName: turn.sessionName ?? null,
        model: turn.sessionModel ?? turn.model ?? null,
        provider: turn.sessionProvider ?? turn.provider ?? null,
        usd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turnCount: 0,
        lastActiveAt: turn.timestamp,
      })
    }
    const session = sessionMap.get(sessionKey)
    session.usd += turn.usd
    session.inputTokens += turn.inputTokens
    session.outputTokens += turn.outputTokens
    session.cacheReadTokens += turn.cacheReadTokens
    session.cacheWriteTokens += turn.cacheWriteTokens
    session.turnCount += 1
    session.lastActiveAt = Math.max(session.lastActiveAt, turn.timestamp)

    const modelKey = normalizeStringToken(turn.model || 'unknown')
    if (!modelMap.has(modelKey)) {
      modelMap.set(modelKey, {
        model: turn.model ?? 'unknown',
        provider: turn.provider ?? null,
        usd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turnCount: 0,
        sessionKeys: new Set(),
      })
    }
    const model = modelMap.get(modelKey)
    model.usd += turn.usd
    model.inputTokens += turn.inputTokens
    model.outputTokens += turn.outputTokens
    model.cacheReadTokens += turn.cacheReadTokens
    model.cacheWriteTokens += turn.cacheWriteTokens
    model.turnCount += 1
    model.sessionKeys.add(sessionKey)

    const hasUsage =
      turn.inputTokens > 0 ||
      turn.outputTokens > 0 ||
      turn.cacheReadTokens > 0 ||
      turn.cacheWriteTokens > 0
    if (hasUsage && turn.usd === 0 && turn.model && turn.hasExplicitPrice !== true) {
      unpricedModels.add(turn.model)
    }
  }

  const daily = [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date))
  const topModels = [...modelMap.values()]
    .map((model) => ({
      model: model.model,
      provider: model.provider,
      usd: model.usd,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      cacheReadTokens: model.cacheReadTokens,
      cacheWriteTokens: model.cacheWriteTokens,
      turnCount: model.turnCount,
      sessionCount: model.sessionKeys.size,
    }))
    .sort((left, right) => right.usd - left.usd || right.inputTokens - left.inputTokens)
    .slice(0, top)

  const topSessions = [...sessionMap.values()]
    .sort((left, right) => right.usd - left.usd || right.lastActiveAt - left.lastActiveAt)
    .slice(0, top)

  totals.sessionCount = sessionMap.size

  return {
    totals,
    daily,
    topModels,
    topSessions,
    unpricedModels: [...unpricedModels].sort((left, right) => left.localeCompare(right)),
  }
}

function clampPercentage(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null
}

function buildComparison(currentUsd, previousUsd) {
  const deltaUsd = currentUsd - previousUsd
  return {
    previousUsd,
    deltaUsd,
    deltaPct: previousUsd > 0 ? clampPercentage((deltaUsd / previousUsd) * 100) : null,
    trend:
      deltaUsd === 0
        ? 'flat'
        : deltaUsd > 0
          ? 'up'
          : 'down',
  }
}

function formatUsd(value) {
  if (value === 0) return '$0.00'
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}

function formatComparisonText(comparison) {
  if (comparison.previousUsd === 0) {
    return comparison.deltaUsd === 0 ? 'flat vs previous period' : 'no spend in the previous period'
  }
  if (comparison.deltaUsd === 0) {
    return 'flat vs previous period'
  }
  const direction = comparison.deltaUsd > 0 ? 'up' : 'down'
  return `${direction} ${Math.abs(comparison.deltaPct ?? 0).toFixed(1)}% vs previous period`
}

function startOfLocalDay(dateLike) {
  const date = new Date(dateLike)
  date.setHours(0, 0, 0, 0)
  return date
}

function buildWindow(period, now) {
  const config = PERIOD_CONFIG[period]
  const endMs = now
  if (period === 'week' || period === 'month') {
    const dayCount = period === 'week' ? 7 : 30
    const startDate = startOfLocalDay(now)
    startDate.setDate(startDate.getDate() - (dayCount - 1))
    const previousStartDate = new Date(startDate)
    previousStartDate.setDate(previousStartDate.getDate() - dayCount)

    const startMs = startDate.getTime()
    const previousStartMs = previousStartDate.getTime()

    return {
      ...config,
      startMs,
      endMs,
      previousStartMs,
      previousEndMs: startMs,
      startDate: formatLocalDate(new Date(startMs)),
      endDate: formatLocalDate(new Date(endMs)),
      startLabel: formatLocalDateTime(new Date(startMs)),
      endLabel: formatLocalDateTime(new Date(endMs)),
    }
  }

  const startMs = now - config.durationMs
  const previousStartMs = startMs - config.durationMs

  return {
    ...config,
    startMs,
    endMs,
    previousStartMs,
    previousEndMs: startMs,
    startDate: formatLocalDate(new Date(startMs)),
    endDate: formatLocalDate(new Date(endMs)),
    startLabel: formatLocalDateTime(new Date(startMs)),
    endLabel: formatLocalDateTime(new Date(endMs)),
  }
}

export function buildDigestReport({
  period,
  sessions,
  pricing,
  now = Date.now(),
  top = DEFAULT_TOP_N,
}) {
  const window = buildWindow(period, now)
  const currentTurns = []
  const previousTurns = []

  for (const session of sessions) {
    for (const turn of session.turns ?? []) {
      const timestampMs = toFiniteNumber(turn.timestamp) * 1000
      const enrichedTurn = {
        ...turn,
        sessionKey: session.sessionKey,
        sessionName: session.sessionName ?? null,
        sessionModel: session.model ?? null,
        sessionProvider: session.provider ?? null,
      }
      if (timestampMs > window.startMs && timestampMs <= window.endMs) {
        currentTurns.push(enrichedTurn)
      } else if (timestampMs > window.previousStartMs && timestampMs <= window.previousEndMs) {
        previousTurns.push(enrichedTurn)
      }
    }
  }

  const current = aggregateTurns(currentTurns, top)
  const previous = aggregateTurns(previousTurns, top)
  const comparison = buildComparison(current.totals.totalUsd, previous.totals.totalUsd)

  const report = {
    generatedAt: new Date(now).toISOString(),
    title: window.title,
    period,
    timezone: timezoneLabel(),
    pricing: {
      fetchedAt: pricing.fetchedAt,
      cachePath: pricing.cachePath,
      sourceUrl: pricing.sourceUrl,
      fromCache: pricing.fromCache,
      stale: pricing.stale === true,
      refreshError: pricing.refreshError ?? null,
    },
    window: {
      label: window.windowLabel,
      startDate: window.startDate,
      endDate: window.endDate,
      startLabel: window.startLabel,
      endLabel: window.endLabel,
      includeDailyBreakdown: window.includeDailyBreakdown,
    },
    totals: current.totals,
    comparison,
    daily: current.daily,
    topModels: current.topModels,
    topSessions: current.topSessions,
    unpricedModels: current.unpricedModels,
  }

  report.summary = buildDigestSummaryMarkdown(report)
  return report
}

function sessionLabel(session) {
  return session.sessionName?.trim() || session.sessionKey
}

export function buildDigestSummaryMarkdown(report) {
  const lines = []
  lines.push(`# ${report.title}`)
  lines.push(`- Period: ${report.window.label} (${report.window.startLabel} to ${report.window.endLabel}, ${report.timezone})`)
  lines.push(
    `- Pricing: ${report.pricing.stale ? 'stale models.dev cache fallback' : report.pricing.fromCache ? 'models.dev cache' : 'models.dev refreshed'} at ${report.pricing.fetchedAt}`,
  )
  if (report.pricing.refreshError) {
    lines.push(`- Pricing note: refresh failed (${report.pricing.refreshError})`)
  }

  if (report.totals.turnCount === 0) {
    lines.push('- Spend: no recorded clawprobe turns in this window')
    return `${lines.join('\n')}\n`
  }

  lines.push(
    `- Total: ${formatUsd(report.totals.totalUsd)} (${formatComparisonText(report.comparison)})`,
  )
  lines.push(
    `- Tokens: ${formatTokens(report.totals.inputTokens)} input, ${formatTokens(report.totals.outputTokens)} output, ${formatTokens(report.totals.cacheReadTokens)} cache read, ${formatTokens(report.totals.cacheWriteTokens)} cache write`,
  )
  lines.push(
    `- Coverage: ${report.totals.sessionCount} sessions across ${report.totals.turnCount} turns`,
  )

  if (report.window.includeDailyBreakdown && report.daily.length > 0) {
    lines.push('- Daily:')
    for (const day of report.daily) {
      lines.push(
        `  - ${day.date}: ${formatUsd(day.usd)} from ${formatTokens(day.inputTokens)} input / ${formatTokens(day.outputTokens)} output`,
      )
    }
  }

  if (report.topModels.length > 0) {
    lines.push('- Top models:')
    for (const model of report.topModels) {
      lines.push(
        `  - ${model.model}: ${formatUsd(model.usd)} across ${model.sessionCount} sessions`,
      )
    }
  }

  if (report.topSessions.length > 0) {
    lines.push('- Top sessions:')
    for (const session of report.topSessions) {
      lines.push(
        `  - ${sessionLabel(session)}: ${formatUsd(session.usd)} (${session.model ?? 'unknown model'})`,
      )
    }
  }

  if (report.unpricedModels.length > 0) {
    lines.push(`- Warning: unpriced models detected: ${report.unpricedModels.join(', ')}`)
  }

  return `${lines.join('\n')}\n`
}
