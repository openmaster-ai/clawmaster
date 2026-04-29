#!/usr/bin/env node
import {
  parseArgs,
  summarizeResults,
  trackDownloads,
} from './common.mjs'

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const payload = await trackDownloads(options)
  if (options.summary) {
    process.stdout.write(`${summarizeResults(payload)}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
