import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  analyzePackage,
  buildMemoryContent,
  buildMemorySearchQuery,
  normalizePackageName,
  parseArgs,
  summarizeResults,
  trackDownloads,
} from '../../../../bundled-skills/package-download-tracker/scripts/common.mjs'

function mockResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload
    },
  }
}

function npmPayload(downloads: number[]) {
  return {
    downloads: downloads.map((value, index) => ({
      day: `2026-04-${String(index + 1).padStart(2, '0')}`,
      downloads: value,
    })),
  }
}

test('package-download-tracker parses repeatable package flags and scoped npm names', () => {
  const parsed = parseArgs([
    '--registry',
    'npm',
    '--package',
    '@types/node',
    '--packages',
    'react, vite',
    '--period',
    'month',
    '--load-memory',
    '--save-memory',
    '--history-limit',
    '8',
  ])

  assert.equal(parsed.registry, 'npm')
  assert.equal(parsed.period, 'month')
  assert.deepEqual(parsed.packages, ['@types/node', 'react', 'vite'])
  assert.equal(parsed.loadMemory, true)
  assert.equal(parsed.saveMemory, true)
  assert.equal(parsed.historyLimit, 8)
})

test('package-download-tracker validates PyPI package names', () => {
  assert.equal(normalizePackageName('pypi', 'fastapi'), 'fastapi')
  assert.equal(normalizePackageName('pypi', 'google-cloud-storage'), 'google-cloud-storage')
  assert.equal(normalizePackageName('pypi', 'Power_Mem'), 'power-mem')
  assert.equal(normalizePackageName('pypi', 'google.cloud_storage'), 'google-cloud-storage')
  assert.throws(() => normalizePackageName('pypi', '../secret'), /Invalid PyPI package name/)
})

test('package-download-tracker builds stable PowerMem content and search query', () => {
  const result = {
    registry: 'npm',
    packageName: 'react',
    period: 'week',
    fetchedAt: '2026-04-28T00:00:00.000Z',
    totals: { downloads: 700, days: 7 },
    trend: { direction: 'up', basis: 'history', text: 'up 16.7% versus previous observation' },
    warnings: [],
  }

  assert.equal(
    buildMemorySearchQuery('npm', 'react', 'week'),
    'package-download-tracker registry:npm package:react period:week',
  )
  const content = buildMemoryContent(result)
  assert.match(content, /package-download-tracker registry:npm package:react period:week/)
  assert.match(content, /snapshot-json: \{"registry":"npm","packageName":"react"/)
})

test('package-download-tracker reuses previous memory before fetching only the current window', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const calls: string[] = []
  const memoryContent = buildMemoryContent({
    registry: 'npm',
    packageName: 'react',
    period: 'week',
    fetchedAt: '2026-04-21T00:00:00.000Z',
    totals: { downloads: 600, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'prior trend' },
    warnings: [],
  })
  const runOpenclaw = (args: string[]) => {
    calls.push(`openclaw ${args.join(' ')}`)
    assert.deepEqual(args, [
      'ltm',
      'search',
      '--json',
      '--query',
      'package-download-tracker registry:npm package:react period:week',
    ])
    return JSON.stringify([{ content: memoryContent }])
  }

  const fetchUrls: string[] = []
  const fetchImpl = async (url: string) => {
    fetchUrls.push(url)
    return mockResponse(npmPayload([100, 100, 100, 100, 100, 100, 100]))
  }

  const result = await analyzePackage({
    registry: 'npm',
    packageName: 'react',
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(calls.length, 1)
  assert.equal(fetchUrls.length, 1)
  assert.equal(fetchUrls[0], 'https://api.npmjs.org/downloads/range/last-week/react')
  assert.equal(result.priorMemory.totalDownloads, 600)
  assert.equal(result.trend.basis, 'history')
  assert.equal(result.history.length, 2)
  assert.deepEqual(
    result.periodColumns.map((column) => [column.label, column.downloads]),
    [['Current week', 700], ['Previous week', 600]],
  )
  assert.match(result.trend.text, /previous observation/)
  assert.equal(result.totals.downloads, 700)
})

test('package-download-tracker builds trend analysis across multiple historical observations', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const snapshots = [
    buildMemoryContent({
      registry: 'npm',
      packageName: 'powermem',
      period: 'week',
      fetchedAt: '2026-04-07T00:00:00.000Z',
      totals: { downloads: 300, days: 7 },
      trend: { direction: 'flat', basis: 'current-window', text: 'older' },
      warnings: [],
    }),
    buildMemoryContent({
      registry: 'npm',
      packageName: 'powermem',
      period: 'week',
      fetchedAt: '2026-04-14T00:00:00.000Z',
      totals: { downloads: 450, days: 7 },
      trend: { direction: 'up', basis: 'history', text: 'middle' },
      warnings: [],
    }),
    buildMemoryContent({
      registry: 'npm',
      packageName: 'powermem',
      period: 'week',
      fetchedAt: '2026-04-21T00:00:00.000Z',
      totals: { downloads: 600, days: 7 },
      trend: { direction: 'up', basis: 'history', text: 'newer' },
      warnings: [],
    }),
  ]
  const fetchImpl = async () => mockResponse(npmPayload([100, 100, 100, 100, 100, 100, 100]))
  const runOpenclaw = () => JSON.stringify(snapshots.map((content) => ({ content })))

  const result = await analyzePackage({
    registry: 'npm',
    packageName: 'powermem',
    period: 'week',
    cachePath,
    loadMemory: true,
    historyLimit: 4,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(result.trend.basis, 'history')
  assert.equal(result.history.length, 4)
  assert.deepEqual(
    result.history.map((point) => point.downloads),
    [300, 450, 600, 700],
  )
  assert.match(result.trend.text, /up 16\.7% versus previous observation/)
  assert.equal(result.trend.overallDelta?.direction, 'up')
  assert.match(result.trend.overallDelta?.text ?? '', /up 133\.3% across 4 observations/)
})

test('package-download-tracker keeps one history observation per day', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const olderSameDay = buildMemoryContent({
    registry: 'npm',
    packageName: 'clawmaster',
    period: 'week',
    fetchedAt: '2026-04-21T00:00:00.000Z',
    totals: { downloads: 400, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'older same day' },
    warnings: [],
  })
  const newerSameDay = buildMemoryContent({
    registry: 'npm',
    packageName: 'clawmaster',
    period: 'week',
    fetchedAt: '2026-04-21T12:00:00.000Z',
    totals: { downloads: 500, days: 7 },
    trend: { direction: 'up', basis: 'history', text: 'newer same day' },
    warnings: [],
  })
  const fetchImpl = async () => mockResponse(npmPayload([100, 100, 100, 100, 100, 100, 100]))
  const runOpenclaw = () => JSON.stringify([
    { content: olderSameDay },
    { content: newerSameDay },
  ])

  const result = await analyzePackage({
    registry: 'npm',
    packageName: 'clawmaster',
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.deepEqual(
    result.history.map((point) => point.downloads),
    [500, 700],
  )
  assert.match(result.trend.text, /up 40\.0% versus previous observation/)
})

test('package-download-tracker tolerates PowerMem log preambles before JSON search results', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const memoryContent = buildMemoryContent({
    registry: 'npm',
    packageName: 'react',
    period: 'week',
    fetchedAt: '2026-04-21T00:00:00.000Z',
    totals: { downloads: 500, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'prior trend' },
    warnings: [],
  })
  const fetchImpl = async () => mockResponse(npmPayload([100, 100, 100, 100, 100, 100, 100]))
  const runOpenclaw = () => `[plugins] memory-clawmaster-powermem loaded\n${JSON.stringify([{ content: memoryContent }])}\n`

  const result = await analyzePackage({
    registry: 'npm',
    packageName: 'react',
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(result.priorMemory.totalDownloads, 500)
  assert.equal(result.trend.basis, 'history')
  assert.deepEqual(result.warnings, [])
})

test('package-download-tracker ignores PowerMem snapshots for other packages', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const wrongMemory = buildMemoryContent({
    registry: 'npm',
    packageName: 'react',
    period: 'week',
    fetchedAt: '2026-04-21T00:00:00.000Z',
    totals: { downloads: 131_000_000, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'wrong package' },
    warnings: [],
  })
  const rightMemory = buildMemoryContent({
    registry: 'npm',
    packageName: 'clawmaster',
    period: 'week',
    fetchedAt: '2026-04-20T00:00:00.000Z',
    totals: { downloads: 400, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'right package' },
    warnings: [],
  })
  const fetchImpl = async () => mockResponse(npmPayload([67, 67, 67, 67, 67, 67, 67]))
  const runOpenclaw = () => JSON.stringify([
    { content: wrongMemory },
    { content: rightMemory },
  ])

  const result = await analyzePackage({
    registry: 'npm',
    packageName: 'clawmaster',
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(result.priorMemory.packageName, 'clawmaster')
  assert.equal(result.priorMemory.totalDownloads, 400)
  assert.equal(result.trend.basis, 'history')
  assert.match(result.trend.text, /up 17\.3%/)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.diagnostics.memory.ignoredSnapshots, 1)
  assert.doesNotMatch(result.trend.text, /131/)
})

test('package-download-tracker uses the newest exact PowerMem snapshot', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const olderMemory = buildMemoryContent({
    registry: 'pypi',
    packageName: 'PowerMem',
    period: 'week',
    fetchedAt: '2026-04-20T00:00:00.000Z',
    totals: { downloads: 700, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'older' },
    warnings: [],
  })
  const newerMemory = buildMemoryContent({
    registry: 'pypi',
    packageName: 'powermem',
    period: 'week',
    fetchedAt: '2026-04-27T00:00:00.000Z',
    totals: { downloads: 900, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'newer' },
    warnings: [],
  })
  const fetchImpl = async () => mockResponse({
    data: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      downloads: index < 7 ? 100 : 130,
    })),
  })
  const recentFetchImpl = async (url: string) => {
    if (String(url).includes('/recent')) {
      return mockResponse({ data: { last_week: 910 } })
    }
    return fetchImpl()
  }
  const runOpenclaw = () => JSON.stringify([
    { content: olderMemory },
    { content: newerMemory },
  ])

  const result = await analyzePackage({
    registry: 'pypi',
    packageName: 'powermem',
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl: recentFetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(result.priorMemory.fetchedAt, '2026-04-27T00:00:00.000Z')
  assert.equal(result.priorMemory.totalDownloads, 900)
  assert.deepEqual(
    result.periodColumns.map((column) => [column.label, column.downloads]),
    [['Current week', 910], ['Previous week', 900]],
  )
  assert.match(result.trend.text, /up 1\.1%/)
})

test('package-download-tracker canonicalizes PyPI names for cache and memory reuse', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const memoryContent = buildMemoryContent({
    registry: 'pypi',
    packageName: 'power-mem',
    period: 'week',
    fetchedAt: '2026-04-21T00:00:00.000Z',
    totals: { downloads: 900, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'prior trend' },
    warnings: [],
  })
  const fetchUrls: string[] = []
  const fetchImpl = async (url: string) => {
    fetchUrls.push(url)
    if (String(url).includes('/recent')) {
      return mockResponse({ data: { last_week: 1_000 } })
    }
    return mockResponse({
      data: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-04-${String(index + 1).padStart(2, '0')}`,
        downloads: 100,
      })),
    })
  }
  const runOpenclaw = (args: string[]) => {
    assert.deepEqual(args, [
      'ltm',
      'search',
      '--json',
      '--query',
      'package-download-tracker registry:pypi package:power-mem period:week',
    ])
    return JSON.stringify([{ content: memoryContent }])
  }

  const parsed = parseArgs(['--registry', 'pypi', '--package', 'Power_Mem', '--period', 'week'])
  assert.deepEqual(parsed.packages, ['power-mem'])

  const result = await analyzePackage({
    registry: 'pypi',
    packageName: parsed.packages[0]!,
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(result.priorMemory.packageName, 'power-mem')
  assert.equal(result.periodColumns[1]?.downloads, 900)
  assert.match(result.trend.text, /up 11\.1%/)
  assert.ok(fetchUrls.every((url) => String(url).includes('/power-mem/')))
})

test('package-download-tracker summary renders current and previous period columns', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const memoryContent = buildMemoryContent({
    registry: 'npm',
    packageName: 'powermem',
    period: 'week',
    fetchedAt: '2026-04-21T00:00:00.000Z',
    totals: { downloads: 600, days: 7 },
    trend: { direction: 'flat', basis: 'current-window', text: 'prior trend' },
    warnings: [],
  })
  const fetchImpl = async () => mockResponse(npmPayload([100, 100, 100, 100, 100, 100, 100]))
  const payload = await trackDownloads({
    registry: 'npm',
    packages: ['powermem'],
    period: 'week',
    cachePath,
    loadMemory: true,
    fetchImpl,
    runOpenclaw: () => JSON.stringify([{ content: memoryContent }]),
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  const summary = summarizeResults(payload)
  assert.match(summary, /\| Package \| Current week \| Previous week \| Trend \|/)
  assert.match(summary, /\| powermem \| 700 \| 600 \| up 16\.7% versus previous observation/)
})

test('package-download-tracker summary does not show percentage changes without a previous period value', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const fetchImpl = async () => mockResponse(npmPayload([100, 100, 100, 100, 100, 100, 100]))
  const payload = await trackDownloads({
    registry: 'npm',
    packages: ['clawmaster'],
    period: 'week',
    cachePath,
    fetchImpl,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  payload.results[0]!.trend.text = 'down -22.0% versus previous week'

  const summary = summarizeResults(payload)
  assert.match(summary, /\| clawmaster \| 700 \| n\/a \| No previous week data available\. \|/)
  assert.doesNotMatch(summary, /-22\.0%/)
})

test('package-download-tracker keeps PowerMem save failures out of user-facing warnings', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  const fetchImpl = async () => mockResponse(npmPayload([10, 10, 10, 10, 10, 10, 10]))
  const runOpenclaw = (args: string[]) => {
    if (args[0] === 'ltm' && args[1] === 'search') return JSON.stringify([])
    throw new Error('PowerMem offline')
  }

  const result = await analyzePackage({
    registry: 'npm',
    packageName: 'clawmaster',
    period: 'week',
    cachePath,
    loadMemory: true,
    saveMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.deepEqual(result.warnings, [])
  assert.match(result.diagnostics.memory.saveWarning ?? '', /PowerMem save unavailable/)
})

test('package-download-tracker uses cache for repeat requests', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  let fetchCount = 0
  const fetchImpl = async () => {
    fetchCount += 1
    return mockResponse(npmPayload([10, 20, 30, 40, 50, 60, 70]))
  }

  const first = await trackDownloads({
    registry: 'npm',
    packages: ['react'],
    period: 'week',
    cachePath,
    fetchImpl,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })
  const second = await trackDownloads({
    registry: 'npm',
    packages: ['react'],
    period: 'week',
    cachePath,
    fetchImpl,
    now: () => new Date('2026-04-28T00:00:00.000Z'),
  })

  assert.equal(fetchCount, 1)
  assert.equal(first.results[0]?.cache.fromCache, false)
  assert.equal(second.results[0]?.cache.fromCache, true)
  assert.equal(second.results[0]?.totals.downloads, 280)
})

test('package-download-tracker bypasses cache when saving a fresh memory observation', async () => {
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-package-download-cache-'))
  let fetchCount = 0
  const fetchImpl = async () => {
    fetchCount += 1
    return mockResponse(npmPayload(fetchCount === 1
      ? [10, 10, 10, 10, 10, 10, 10]
      : [20, 20, 20, 20, 20, 20, 20]))
  }
  const runOpenclaw = (args: string[]) => {
    if (args[0] === 'ltm' && args[1] === 'search') return JSON.stringify([])
    if (args[0] === 'ltm' && args[1] === 'add') return JSON.stringify({ ok: true })
    throw new Error(`unexpected openclaw args: ${args.join(' ')}`)
  }

  const first = await trackDownloads({
    registry: 'npm',
    packages: ['clawmaster'],
    period: 'week',
    cachePath,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-28T08:01:00.000Z'),
  })
  const second = await trackDownloads({
    registry: 'npm',
    packages: ['clawmaster'],
    period: 'week',
    cachePath,
    loadMemory: true,
    saveMemory: true,
    fetchImpl,
    runOpenclaw,
    now: () => new Date('2026-04-29T07:59:00.000Z'),
  })

  assert.equal(fetchCount, 2)
  assert.equal(first.results[0]?.cache.fromCache, false)
  assert.equal(second.results[0]?.cache.fromCache, false)
  assert.equal(second.results[0]?.totals.downloads, 140)
})
