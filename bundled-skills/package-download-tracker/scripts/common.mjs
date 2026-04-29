import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.openclaw', 'cache', 'package-download-tracker')
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const SKILL_MARKER = 'package-download-tracker'

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase()
}

function parsePackageList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function canonicalPypiPackageName(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[-_.]+/g, '-')
}

export function normalizeRegistry(value) {
  const normalized = normalizeToken(value)
  if (normalized !== 'npm' && normalized !== 'pypi') {
    throw new Error(`Unsupported --registry value: ${value}`)
  }
  return normalized
}

export function normalizePeriod(value) {
  const normalized = normalizeToken(value || 'week')
  if (normalized !== 'week' && normalized !== 'month') {
    throw new Error(`Unsupported --period value: ${value}`)
  }
  return normalized
}

export function normalizePackageName(registry, value) {
  const name = String(value ?? '').trim()
  if (!name) throw new Error('Package name is required')

  if (registry === 'npm') {
    if (/\s/.test(name)) throw new Error(`Invalid npm package name: ${name}`)
    if (name.startsWith('@')) {
      if (!/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._~-]*$/i.test(name)) {
        throw new Error(`Invalid npm scoped package name: ${name}`)
      }
      return name
    }
    if (!/^[a-z0-9][a-z0-9._~-]*$/i.test(name)) {
      throw new Error(`Invalid npm package name: ${name}`)
    }
    return name
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(`Invalid PyPI package name: ${name}`)
  }
  return canonicalPypiPackageName(name)
}

export function parseArgs(argv) {
  const options = {
    registry: '',
    packages: [],
    period: 'week',
    summary: false,
    refresh: false,
    saveMemory: false,
    loadMemory: false,
    cachePath: DEFAULT_CACHE_DIR,
    maxAgeMs: DEFAULT_MAX_AGE_MS,
    historyLimit: 6,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--registry' && next) {
      options.registry = next
      index += 1
    } else if (arg === '--package' && next) {
      options.packages.push(next)
      index += 1
    } else if (arg === '--packages' && next) {
      options.packages.push(...parsePackageList(next))
      index += 1
    } else if (arg === '--period' && next) {
      options.period = next
      index += 1
    } else if (arg === '--summary') {
      options.summary = true
    } else if (arg === '--refresh') {
      options.refresh = true
    } else if (arg === '--save-memory') {
      options.saveMemory = true
    } else if (arg === '--load-memory') {
      options.loadMemory = true
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
    } else if (arg === '--history-limit' && next) {
      const parsed = Number(next)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Invalid --history-limit value: ${next}`)
      }
      options.historyLimit = parsed
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const registry = normalizeRegistry(options.registry)
  const period = normalizePeriod(options.period)
  const packages = [...new Set(options.packages.map((pkg) => normalizePackageName(registry, pkg)))]
  if (packages.length === 0) {
    throw new Error('At least one --package or --packages value is required')
  }

  return {
    ...options,
    registry,
    period,
    packages,
  }
}

function periodDays(period) {
  return period === 'month' ? 30 : 7
}

function cacheFilePath(cacheDir, registry, packageName, period) {
  const key = Buffer.from(`${registry}:${packageName}:${period}`).toString('base64url')
  return path.join(cacheDir, `${key}.json`)
}

function readCache(filePath, maxAgeMs, now = Date.now()) {
  try {
    const stat = fs.statSync(filePath)
    if (now - stat.mtimeMs > maxAgeMs) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeCache(filePath, payload) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function fetchJson(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ClawMaster package-download-tracker',
    },
  })
  if (!response.ok) {
    throw new Error(`Registry request failed (${response.status}) for ${url}`)
  }
  return response.json()
}

function normalizeDailyRows(rows) {
  return rows
    .map((row) => ({
      date: String(row.date ?? row.day ?? '').slice(0, 10),
      downloads: Number(row.downloads ?? row.count ?? 0),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.downloads))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function sumDownloads(rows) {
  return rows.reduce((sum, row) => sum + row.downloads, 0)
}

function compareTotals(current, previous) {
  if (!Number.isFinite(previous) || previous <= 0) {
    return { previous: previous ?? null, absolute: null, percent: null }
  }
  const absolute = current - previous
  return {
    previous,
    absolute,
    percent: absolute / previous,
  }
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

function formatDownloads(value) {
  if (value === null || value === undefined) return 'n/a'
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : 'n/a'
}

function hasDownloads(value) {
  if (value === null || value === undefined) return false
  return Number.isFinite(Number(value))
}

function displayTrendText(result) {
  return hasDownloads(result.periodColumns?.[1]?.downloads)
    ? result.trend.text
    : `No previous ${periodNoun(result.period)} data available.`
}

function periodNoun(period) {
  return period === 'month' ? 'month' : 'week'
}

function periodLabel(period) {
  return period === 'month' ? 'month' : 'week'
}

function trendDirection(delta) {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

function compactDate(value) {
  const text = String(value ?? '')
  return text.length >= 10 ? text.slice(0, 10) : 'prior run'
}

function formatHistory(history) {
  return history
    .map((point) => `${compactDate(point.fetchedAt)} ${point.downloads.toLocaleString('en-US')}`)
    .join(' -> ')
}

function historyDateKey(value, fallback) {
  const text = String(value ?? '')
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : `unknown:${fallback}`
}

function buildHistory(snapshots, current, fetchedAt, limit) {
  const byDate = new Map()
  snapshots.forEach((snapshot, index) => {
    const downloads = Number(snapshot.totalDownloads)
    if (!Number.isFinite(downloads)) return
    const observedAt = String(snapshot.fetchedAt ?? '')
    const row = {
      fetchedAt: observedAt,
      downloads,
      source: 'memory',
    }
    const key = historyDateKey(observedAt, index)
    const existing = byDate.get(key)
    if (!existing || snapshotTimestamp(row) >= snapshotTimestamp(existing)) {
      byDate.set(key, row)
    }
  })
  const rows = [...byDate.values()]
  rows.sort((a, b) => snapshotTimestamp(a) - snapshotTimestamp(b))
  const selected = rows.slice(Math.max(0, rows.length - Math.max(0, limit - 1)))
  const currentRow = {
    fetchedAt,
    downloads: current.totals.downloads,
    source: current.fromCache ? 'cache' : 'registry',
  }
  const currentKey = historyDateKey(currentRow.fetchedAt, 'current')
  const existingCurrentIndex = selected.findIndex((row, index) => historyDateKey(row.fetchedAt, index) === currentKey)
  if (existingCurrentIndex >= 0) {
    selected[existingCurrentIndex] = currentRow
  } else {
    selected.push(currentRow)
  }
  return selected
}

function buildTrend(history, comparison) {
  if (history.length >= 2) {
    const first = history[0]
    const previous = history[history.length - 2]
    const current = history[history.length - 1]
    const delta = current.downloads - previous.downloads
    const direction = trendDirection(delta)
    const periodDelta = previous.downloads > 0 ? delta / previous.downloads : null
    const totalDelta = current.downloads - first.downloads
    const totalDirection = trendDirection(totalDelta)
    const totalPercent = first.downloads > 0 ? totalDelta / first.downloads : null
    const text = periodDelta === null
      ? `${direction} ${delta.toLocaleString('en-US')} downloads versus previous observation`
      : `${direction} ${formatPercent(periodDelta)} versus previous observation (${compactDate(previous.fetchedAt)})`
    return {
      direction,
      basis: 'history',
      text,
      points: history.length,
      previousDelta: {
        absolute: delta,
        percent: periodDelta,
      },
      overallDelta: {
        direction: totalDirection,
        absolute: totalDelta,
        percent: totalPercent,
        text: totalPercent === null
          ? `${totalDirection} ${totalDelta.toLocaleString('en-US')} downloads across ${history.length} observations`
          : `${totalDirection} ${formatPercent(totalPercent)} across ${history.length} observations`,
      },
    }
  }

  if (comparison.percent !== null) {
    const direction = comparison.absolute > 0 ? 'up' : comparison.absolute < 0 ? 'down' : 'flat'
    return {
      direction,
      basis: 'registry-window',
      text: `${direction} ${formatPercent(comparison.percent)} versus previous ${periodLabel(comparison.period ?? 'week')}`,
      points: 1,
    }
  }

  return {
    direction: 'unknown',
    basis: 'current-window',
    text: `No previous ${periodLabel(comparison.period ?? 'period')} data available.`,
    points: 1,
  }
}

function buildPeriodColumns(period, history, comparison, currentDownloads) {
  const previousHistory = history.length >= 2 ? history[history.length - 2] : null
  const hasHistoryPrevious = Number.isFinite(Number(previousHistory?.downloads))
  const hasRegistryPrevious = Number.isFinite(comparison.previous) && (
    Number.isFinite(comparison.percent) ||
    Number.isFinite(comparison.absolute) ||
    comparison.previous > 0
  )
  const previousDownloads = hasHistoryPrevious
    ? Number(previousHistory.downloads)
    : hasRegistryPrevious
      ? comparison.previous
      : null
  const previousSource = hasHistoryPrevious
    ? 'history'
    : hasRegistryPrevious
      ? 'registry-window'
      : 'unavailable'

  return [
    {
      key: 'current',
      label: `Current ${periodNoun(period)}`,
      downloads: currentDownloads,
      source: 'current',
    },
    {
      key: 'previous',
      label: `Previous ${periodNoun(period)}`,
      downloads: previousDownloads,
      source: previousSource,
    },
  ]
}

function normalizeNpmPayload(packageName, period, raw) {
  const daily = normalizeDailyRows(Array.isArray(raw.downloads) ? raw.downloads : [])
  const current = daily.slice(-periodDays(period))
  const previous = daily.slice(Math.max(0, daily.length - periodDays(period) * 2), Math.max(0, daily.length - periodDays(period)))
  const total = sumDownloads(current)
  return {
    source: {
      kind: 'npm',
      url: `https://api.npmjs.org/downloads/range/last-${period}/${encodeURIComponent(packageName)}`,
    },
    daily: current,
    totals: {
      downloads: total,
      days: current.length,
    },
    comparison: compareTotals(total, previous.length === periodDays(period) ? sumDownloads(previous) : null),
    warnings: current.length === 0 ? ['npm returned no daily download rows'] : [],
  }
}

function normalizePypiPayload(packageName, period, overallRaw, recentRaw) {
  const allRows = normalizeDailyRows(Array.isArray(overallRaw.data) ? overallRaw.data : [])
  const current = allRows.slice(-periodDays(period))
  const previous = allRows.slice(Math.max(0, allRows.length - periodDays(period) * 2), Math.max(0, allRows.length - periodDays(period)))
  const summed = sumDownloads(current)
  const recent = isRecord(recentRaw?.data) ? recentRaw.data : {}
  const recentKey = period === 'month' ? 'last_month' : 'last_week'
  const recentTotal = Number(recent[recentKey])
  const total = Number.isFinite(recentTotal) && recentTotal > 0 ? recentTotal : summed
  const warnings = []
  if (current.length === 0) warnings.push('PyPIStats returned no daily download rows')
  if (Number.isFinite(recentTotal) && summed > 0 && recentTotal !== summed) {
    warnings.push('PyPIStats recent aggregate differs from summed daily rows; using recent aggregate for total')
  }

  return {
    source: {
      kind: 'pypistats',
      urls: [
        `https://pypistats.org/api/packages/${encodeURIComponent(packageName)}/overall?mirrors=false`,
        `https://pypistats.org/api/packages/${encodeURIComponent(packageName)}/recent?period=${period}`,
      ],
    },
    daily: current,
    totals: {
      downloads: total,
      days: current.length,
    },
    comparison: compareTotals(total, previous.length === periodDays(period) ? sumDownloads(previous) : null),
    warnings,
  }
}

export function buildMemorySearchQuery(registry, packageName, period) {
  return `${SKILL_MARKER} registry:${registry} package:${packageName} period:${period}`
}

function canonicalPackageName(registry, value) {
  const name = String(value ?? '').trim()
  return registry === 'npm' ? name : canonicalPypiPackageName(name)
}

function snapshotsMatchRequest(snapshot, registry, packageName, period) {
  if (!isRecord(snapshot)) return false
  return (
    normalizeToken(snapshot.registry) === registry &&
    canonicalPackageName(registry, snapshot.packageName) === canonicalPackageName(registry, packageName) &&
    normalizeToken(snapshot.period) === period
  )
}

function snapshotTimestamp(snapshot) {
  const time = Date.parse(String(snapshot?.fetchedAt ?? ''))
  return Number.isFinite(time) ? time : 0
}

function extractSnapshotFromContent(content) {
  const text = String(content ?? '')
  const marker = 'snapshot-json:'
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return null
  const jsonStart = text.indexOf('{', markerIndex + marker.length)
  if (jsonStart < 0) return null
  const jsonEnd = findJsonEnd(text, jsonStart)
  if (jsonEnd === null) return null
  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsonLoose(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    for (let start = 0; start < text.length; start += 1) {
      const ch = text[start]
      if (ch !== '[' && ch !== '{') continue
      const end = findJsonEnd(text, start)
      if (end === null) continue
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        // Keep scanning in case log lines precede the JSON payload.
      }
    }
    throw new Error('Invalid JSON from PowerMem search')
  }
}

function findJsonEnd(text, start) {
  const first = text[start]
  const stack = [first === '[' ? ']' : '}']
  let inString = false
  let escaped = false

  for (let index = start + 1; index < text.length; index += 1) {
    const ch = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '[') {
      stack.push(']')
    } else if (ch === '{') {
      stack.push('}')
    } else if (ch === ']' || ch === '}') {
      if (stack.pop() !== ch) return null
      if (stack.length === 0) return index
    }
  }
  return null
}

function memoryRowContent(row) {
  if (typeof row === 'string') return row
  if (!isRecord(row)) return ''
  if (typeof row.content === 'string') return row.content
  if (typeof row.text === 'string') return row.text
  if (typeof row.memory === 'string') return row.memory
  if (isRecord(row.memory)) {
    if (typeof row.memory.content === 'string') return row.memory.content
    if (typeof row.memory.text === 'string') return row.memory.text
  }
  return ''
}

function normalizeMemoryHits(raw, { registry, packageName, period }) {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.hits)
      ? raw.hits
      : Array.isArray(raw?.memories)
        ? raw.memories
        : Array.isArray(raw?.results)
          ? raw.results
          : []
  const extracted = rows
    .map((row) => extractSnapshotFromContent(memoryRowContent(row)))
    .filter((snapshot) => isRecord(snapshot) && Number.isFinite(Number(snapshot.totalDownloads)))
  const snapshots = extracted
    .filter((snapshot) => snapshotsMatchRequest(snapshot, registry, packageName, period))
    .sort((a, b) => snapshotTimestamp(b) - snapshotTimestamp(a))
  return {
    snapshots,
    ignored: extracted.length - snapshots.length,
  }
}

export function defaultRunOpenclaw(args) {
  const result = spawnSync('openclaw', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  if (result.error) throw result.error
  if ((result.status ?? 0) !== 0) {
    throw new Error(output || `openclaw exited with status ${result.status}`)
  }
  return output
}

export function loadPreviousSnapshots({ registry, packageName, period, runOpenclaw = defaultRunOpenclaw }) {
  const query = buildMemorySearchQuery(registry, packageName, period)
  try {
    const raw = runOpenclaw(['ltm', 'search', '--json', '--query', query])
    const normalized = normalizeMemoryHits(parseJsonLoose(raw), { registry, packageName, period })
    return {
      query,
      snapshots: normalized.snapshots,
      diagnostics: {
        ignored: normalized.ignored,
        warning: null,
      },
    }
  } catch (error) {
    return {
      query,
      snapshots: [],
      diagnostics: {
        ignored: 0,
        warning: `PowerMem recall unavailable: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

export function buildMemoryContent(result) {
  const snapshot = {
    registry: result.registry,
    packageName: result.packageName,
    period: result.period,
    fetchedAt: result.fetchedAt,
    totalDownloads: result.totals.downloads,
    trend: result.trend,
    warnings: result.warnings,
  }
  return [
    buildMemorySearchQuery(result.registry, result.packageName, result.period),
    `summary: ${result.packageName} had ${result.totals.downloads.toLocaleString('en-US')} ${result.period} downloads; ${result.trend.text}`,
    `snapshot-json: ${JSON.stringify(snapshot)}`,
  ].join('\n')
}

export function saveSnapshotToMemory(result, runOpenclaw = defaultRunOpenclaw) {
  try {
    runOpenclaw(['ltm', 'add', '--json', '--', buildMemoryContent(result)])
    return null
  } catch (error) {
    return `PowerMem save unavailable: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function fetchCurrentWindow({ registry, packageName, period, fetchImpl }) {
  if (registry === 'npm') {
    const url = `https://api.npmjs.org/downloads/range/last-${period}/${encodeURIComponent(packageName)}`
    return normalizeNpmPayload(packageName, period, await fetchJson(url, fetchImpl))
  }

  const overallUrl = `https://pypistats.org/api/packages/${encodeURIComponent(packageName)}/overall?mirrors=false`
  const recentUrl = `https://pypistats.org/api/packages/${encodeURIComponent(packageName)}/recent?period=${period}`
  const [overall, recent] = await Promise.all([
    fetchJson(overallUrl, fetchImpl),
    fetchJson(recentUrl, fetchImpl),
  ])
  return normalizePypiPayload(packageName, period, overall, recent)
}

export async function analyzePackage({
  registry,
  packageName,
  period,
  cachePath = DEFAULT_CACHE_DIR,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  refresh = false,
  loadMemory = false,
  saveMemory = false,
  historyLimit = 6,
  fetchImpl = fetch,
  runOpenclaw = defaultRunOpenclaw,
  now = () => new Date(),
}) {
  const fetchedAt = now().toISOString()
  const memory = loadMemory ? loadPreviousSnapshots({ registry, packageName, period, runOpenclaw }) : null

  const filePath = cacheFilePath(cachePath, registry, packageName, period)
  const cached = refresh || saveMemory ? null : readCache(filePath, maxAgeMs, now().getTime())
  const current = cached ?? await fetchCurrentWindow({ registry, packageName, period, fetchImpl })
  current.fromCache = Boolean(cached)
  if (!cached) {
    writeCache(filePath, current)
  }

  const priorSnapshot = memory?.snapshots?.[0] ?? null
  const history = buildHistory(memory?.snapshots ?? [], current, fetchedAt, historyLimit)
  const trend = buildTrend(history, { ...current.comparison, period })
  const periodColumns = buildPeriodColumns(period, history, current.comparison, current.totals.downloads)
  const result = {
    registry,
    packageName,
    period,
    fetchedAt,
    source: current.source,
    cache: {
      fromCache: Boolean(cached),
      path: filePath,
    },
    totals: current.totals,
    daily: current.daily,
    comparison: current.comparison,
    priorMemory: priorSnapshot,
    history,
    periodColumns,
    trend,
    warnings: [...current.warnings],
    diagnostics: {
      memory: {
        query: memory?.query ?? null,
        snapshotsLoaded: memory?.snapshots?.length ?? 0,
        ignoredSnapshots: memory?.diagnostics?.ignored ?? 0,
        warning: memory?.diagnostics?.warning ?? null,
        saveWarning: null,
      },
    },
  }

  if (saveMemory) {
    const warning = saveSnapshotToMemory(result, runOpenclaw)
    if (warning) result.diagnostics.memory.saveWarning = warning
  }

  return result
}

export async function trackDownloads(options) {
  const results = []
  for (const packageName of options.packages) {
    results.push(await analyzePackage({ ...options, packageName }))
  }
  return {
    registry: options.registry,
    packages: options.packages,
    period: options.period,
    fetchedAt: new Date().toISOString(),
    results,
    warnings: results.flatMap((result) => result.warnings.map((warning) => `${result.packageName}: ${warning}`)),
  }
}

export function summarizeResults(payload) {
  const lines = [
    `# Package Download Tracker (${payload.registry}, ${payload.period})`,
    '',
    `| Package | ${payload.results[0]?.periodColumns?.[0]?.label ?? `Current ${periodNoun(payload.period)}`} | ${payload.results[0]?.periodColumns?.[1]?.label ?? `Previous ${periodNoun(payload.period)}`} | Trend |`,
    '|---|---:|---:|---|',
  ]

  for (const result of payload.results) {
    const previousDownloads = result.periodColumns?.[1]?.downloads
    lines.push(`| ${result.packageName} | ${formatDownloads(result.periodColumns?.[0]?.downloads)} | ${formatDownloads(previousDownloads)} | ${displayTrendText(result)} |`)
  }

  lines.push('')

  for (const result of payload.results) {
    lines.push(`## ${result.packageName}`)
    if (result.history.length > 1) {
      lines.push(`- Observations: ${result.history.length} periods (${formatHistory(result.history)})`)
      lines.push(`- Recent trend: ${displayTrendText(result)}`)
      if (result.trend.overallDelta?.text) {
        lines.push(`- Longer trend: ${result.trend.overallDelta.text}`)
      }
    } else {
      lines.push(`- Trend: ${displayTrendText(result)}`)
    }
    for (const warning of result.warnings) {
      lines.push(`- Warning: ${warning}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}
