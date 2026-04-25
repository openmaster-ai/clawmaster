#!/usr/bin/env node
// Emits a Markdown "What's Changed" section for a tag, grouping user-facing
// conventional commits into a few release-note buckets. CI / release
// housekeeping and unprefixed commits are intentionally excluded. Designed for GitHub
// releases where `gh api .../releases/generate-notes` falls short because the
// tagged branch only contains release-merge commits (git-flow pattern).
//
// Usage: node scripts/release-notes.mjs <tag>
// Env:   GH_REPO (owner/repo) — required; GH_TOKEN/GITHUB_TOKEN for PR lookup.

import { execSync } from 'node:child_process'

const tag = process.argv[2]
if (!tag) {
  console.error('usage: release-notes.mjs <tag>')
  process.exit(1)
}

const repo =
  process.env.GH_REPO ||
  execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', { encoding: 'utf8' }).trim()

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

let prevTag = ''
try {
  prevTag = execSync(`git describe --tags --abbrev=0 --match 'v*' ${tag}^`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim()
} catch {
  // No previous tag — this is the first release.
}

const range = prevTag ? `${prevTag}..${tag}` : tag
const log = execSync(`git log --no-merges --pretty=format:%H%x09%s ${range}`, {
  encoding: 'utf8',
}).trim()

const commits = log
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [sha, ...rest] = line.split('\t')
    return { sha, subject: rest.join('\t') }
  })

const BUCKETS = [
  { id: 'features', title: '### ✨ Features & Polish', types: ['feat', 'polish'] },
  { id: 'fixes', title: '### 🐛 Fixes', types: ['fix'] },
  { id: 'misc', title: '### 📝 Misc', types: [] },
]

const EXCLUDED_TYPES = new Set(['ci', 'test', 'build', 'perf', 'refactor', 'chore', 'docs', 'style'])

function bucketOf(subject) {
  const m = subject.match(/^([a-z]+)(?:\([^)]+\))?:/)
  if (!m) return null
  const type = m[1]
  if (EXCLUDED_TYPES.has(type)) return null
  return BUCKETS.find((b) => b.types.includes(type))?.id ?? 'misc'
}

async function prFor(sha) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/pulls`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) return null
  const body = await res.json()
  return Array.isArray(body) && body[0]?.number ? body[0].number : null
}

const withPr = await Promise.all(
  commits.map(async (c) => ({ ...c, pr: await prFor(c.sha), bucket: bucketOf(c.subject) })),
)

const lines = []
for (const bucket of BUCKETS) {
  const items = withPr.filter((c) => c.bucket === bucket.id)
  if (!items.length) continue
  lines.push(bucket.title, '')
  for (const c of items) {
    const prLink = c.pr ? ` ([#${c.pr}](https://github.com/${repo}/pull/${c.pr}))` : ''
    lines.push(`- ${c.subject}${prLink}`)
  }
  lines.push('')
}

if (prevTag) {
  lines.push(`**Full Changelog**: https://github.com/${repo}/compare/${prevTag}...${tag}`)
}

process.stdout.write(lines.join('\n').trim() + '\n')
