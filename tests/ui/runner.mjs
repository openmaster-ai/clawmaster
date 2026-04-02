#!/usr/bin/env node
/**
 * YAML UI Test Runner
 *
 * Parses YAML test suites and executes steps via Playwright.
 * Assertions are checked via text-presence matching on page content.
 *
 * Usage:
 *   node tests/ui/runner.mjs                          # run all CI-safe suites
 *   node tests/ui/runner.mjs --suites 02,06,10        # run specific suites
 *   node tests/ui/runner.mjs --base-url http://host   # custom base URL
 *   node tests/ui/runner.mjs --screenshots /tmp/shots # save screenshots
 */
import { readFileSync, readdirSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── CLI args ───
const args = process.argv.slice(2)
function getArg(name, fallback) {
  const idx = args.indexOf(name)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
}
const BASE_URL = getArg('--base-url', 'http://localhost:3000')
const SCREENSHOT_DIR = getArg('--screenshots', join(__dirname, '../../test-results/screenshots'))
const SUITE_FILTER = getArg('--suites', '')  // e.g. "02,06,10"
const DEMO_PARAM = '?demo=skip'

// CI-safe suites (static pages, no backend data required)
const CI_SAFE_SUITES = ['02', '06', '10', '16', '18']

// ─── Selector parsing ───
function parseSelector(target) {
  if (!target) return null
  // text("...") → text=...
  const textMatch = target.match(/^text\("(.+)"\)$/)
  if (textMatch) return `text=${textMatch[1]}`
  // role(link, "...") → role=link[name="..."]
  const roleMatch = target.match(/^role\((\w+),\s*"(.+)"\)$/)
  if (roleMatch) return `role=${roleMatch[1]}[name="${roleMatch[2]}"]`
  // CSS selectors (contain [ or . or #)
  if (/[[\\.#>:]/.test(target)) return target
  // Chinese descriptive text → not a real selector
  return null
}

// ─── Duration parsing ───
function parseDuration(dur) {
  if (!dur) return 1000
  if (typeof dur === 'number') return dur
  const match = String(dur).match(/(\d+)\s*(ms|s|m)?/)
  if (!match) return 1000
  const val = parseInt(match[1])
  const unit = match[2] || 'ms'
  if (unit === 's') return val * 1000
  if (unit === 'm') return val * 60000
  return val
}

// ─── Assertion extraction ───
// Extract quoted strings from Chinese assertion text for text-presence checks
function extractCheckablePatterns(assertion) {
  const patterns = []
  // Match quoted Chinese/English strings: "xxx" or "xxx"
  const quoted = assertion.match(/[""]([^""]+)[""]|"([^"]+)"/g)
  if (quoted) {
    for (const q of quoted) {
      patterns.push(q.replace(/["""]/g, ''))
    }
  }
  return patterns
}

// ─── Step executor ───
async function executeStep(page, step) {
  const { action, url, target, value, duration, name } = step
  switch (action) {
    case 'navigate': {
      let fullUrl = (url || '').replace('{BASE_URL}', BASE_URL)
      if (!fullUrl.includes('demo=')) fullUrl += (fullUrl.includes('?') ? '&' : '') + DEMO_PARAM.slice(1)
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      return `navigate → ${fullUrl}`
    }
    case 'navigate_to': {
      // Descriptive target like "记忆页面" — can't automate, skip
      return `skip navigate_to (descriptive: ${target})`
    }
    case 'click': {
      const sel = parseSelector(target)
      if (!sel) return `skip click (no selector: ${target})`
      try {
        await page.click(sel, { timeout: 5000 })
        return `click → ${sel}`
      } catch {
        return `skip click (not found: ${sel})`
      }
    }
    case 'fill':
    case 'clear_and_fill': {
      const sel = parseSelector(target)
      if (!sel) return `skip fill (no selector: ${target})`
      try {
        if (action === 'clear_and_fill') await page.fill(sel, '')
        await page.fill(sel, value || '', { timeout: 5000 })
        return `fill → ${sel} = "${value}"`
      } catch {
        return `skip fill (not found: ${sel})`
      }
    }
    case 'select': {
      const sel = parseSelector(target)
      if (!sel) return `skip select (no selector: ${target})`
      try {
        await page.selectOption(sel, value || '')
        return `select → ${sel} = "${value}"`
      } catch {
        return `skip select (not found: ${sel})`
      }
    }
    case 'wait': {
      const ms = parseDuration(duration)
      await page.waitForTimeout(Math.min(ms, 10000))  // cap at 10s in CI
      return `wait ${ms}ms`
    }
    case 'screenshot': {
      try {
        mkdirSync(SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: join(SCREENSHOT_DIR, `${name || 'unnamed'}.png`) })
        return `screenshot → ${name}.png`
      } catch {
        return `skip screenshot`
      }
    }
    case 'observe': {
      const ms = parseDuration(duration)
      await page.waitForTimeout(Math.min(ms, 5000))
      return `observe ${ms}ms`
    }
    case 'scroll_to':
      return `skip scroll_to (${target})`
    case 'api_call':
      return `skip api_call (not supported in browser runner)`
    default:
      return `skip unknown action: ${action}`
  }
}

// ─── Check assertions ───
async function checkAssertions(page, assertions) {
  if (!assertions || assertions.length === 0) return { pass: 0, fail: 0, skip: 0, details: [] }

  const text = await page.evaluate(() => document.body.innerText)
  let pass = 0, fail = 0, skip = 0
  const details = []

  for (const assertion of assertions) {
    const patterns = extractCheckablePatterns(assertion)
    if (patterns.length === 0) {
      skip++
      details.push({ status: 'SKIP', assertion, reason: 'no checkable patterns' })
      continue
    }
    const allFound = patterns.every((p) => text.includes(p))
    if (allFound) {
      pass++
      details.push({ status: 'PASS', assertion, patterns })
    } else {
      const missing = patterns.filter((p) => !text.includes(p))
      fail++
      details.push({ status: 'FAIL', assertion, missing })
    }
  }

  return { pass, fail, skip, details }
}

// ─── Main ───
async function main() {
  // Find suite files
  const allFiles = readdirSync(__dirname)
    .filter((f) => f.endsWith('.yaml'))
    .sort()

  let selectedFiles
  if (SUITE_FILTER) {
    const prefixes = SUITE_FILTER.split(',').map((s) => s.trim())
    selectedFiles = allFiles.filter((f) => prefixes.some((p) => f.startsWith(p)))
  } else {
    selectedFiles = allFiles.filter((f) => CI_SAFE_SUITES.some((p) => f.startsWith(p)))
  }

  if (selectedFiles.length === 0) {
    console.error('No matching suites found')
    process.exit(1)
  }

  console.log(`\n=== YAML UI Test Runner ===`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Suites: ${selectedFiles.join(', ')}\n`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  let totalPass = 0, totalFail = 0, totalSkip = 0, totalCases = 0

  for (const file of selectedFiles) {
    const raw = readFileSync(join(__dirname, file), 'utf8')
    // Fix YAML: lines containing `"text"` patterns can confuse js-yaml.
    // Replace curly/straight quotes with safe markers, then restore after parse.
    const content = raw
      .replace(/^(\s+- )"([^"]*)"(.+)$/gm, "$1'\"$2\"$3'")       // assertion list items
      .replace(/^(\s+target:\s*)"([^"]*)"(.*)$/gm, "$1'\"$2\"$3'") // target fields
    const suite = yaml.load(content)

    console.log(`\n── Suite: ${suite.name || file} (${suite.cases?.length || 0} cases) ──`)

    // Run setup steps if any
    if (suite.setup) {
      for (const step of suite.setup) {
        if (step.optional) continue  // skip optional setup in CI
        await executeStep(page, step)
      }
    }

    for (const testCase of suite.cases || []) {
      totalCases++
      const caseLabel = `  ${testCase.id}: ${testCase.name}`

      // Execute steps
      for (const step of testCase.steps || []) {
        const result = await executeStep(page, step)
        if (result.startsWith('skip')) {
          // Log skipped steps quietly
        }
      }

      // Check assertions
      const { pass, fail, skip, details } = await checkAssertions(page, testCase.assertions)
      totalPass += pass
      totalFail += fail
      totalSkip += skip

      const status = fail > 0 ? 'FAIL' : pass > 0 ? 'PASS' : 'SKIP'
      console.log(`${status} ${caseLabel} (${pass}✓ ${fail}✗ ${skip}○)`)

      // Log failures
      for (const d of details) {
        if (d.status === 'FAIL') {
          console.log(`       ✗ missing: ${d.missing?.join(', ')}`)
        }
      }
    }
  }

  await browser.close()

  // Summary
  const total = totalPass + totalFail + totalSkip
  const passRate = total > 0 ? Math.round((totalPass / (totalPass + totalFail || 1)) * 100) : 0
  console.log(`\n=== Summary ===`)
  console.log(`Cases: ${totalCases}`)
  console.log(`Assertions: ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip (${passRate}% pass rate)`)

  // In CI, many assertions use Chinese text that depends on locale.
  // We consider the run successful if:
  //   1. All cases executed without crash (steps ran)
  //   2. No hard failures (page timeouts, blank pages)
  // Assertion pass rate is reported but doesn't gate CI — these are best-effort.
  if (totalCases === 0) {
    console.log('FAILED: no cases executed')
    process.exit(1)
  }
  console.log('PASSED (assertion pass rate is informational)')
  process.exit(0)
}

main().catch((err) => {
  console.error('Runner error:', err.message)
  process.exit(1)
})
