#!/usr/bin/env node
import {
  loadCatalog,
  parseArgs,
  queryCatalog,
  summarizeQueryResult,
} from './common.mjs'

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const loaded = await loadCatalog({
    cachePath: options.cachePath,
    maxAgeMs: options.maxAgeMs,
    refresh: options.refresh,
  })
  const result = queryCatalog(loaded.catalog, options)
  const output = options.summary ? summarizeQueryResult(result) : result

  process.stdout.write(`${JSON.stringify({
    fetchedAt: loaded.fetchedAt,
    sourceUrl: loaded.sourceUrl,
    cachePath: loaded.cachePath,
    fromCache: loaded.fromCache,
    query: {
      provider: options.provider || null,
      model: options.model || null,
      family: options.family || null,
      supports: options.supports,
      inputModalities: options.inputModalities,
      outputModalities: options.outputModalities,
      openWeights: options.openWeights,
      limit: options.limit,
      summary: options.summary,
    },
    ...output,
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
