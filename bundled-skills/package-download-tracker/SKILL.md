---
name: package-download-tracker
description: Track npm and PyPI package downloads by week or month, use stored history observations, and save compact trend analysis for future package adoption questions. Use when the user asks for npm downloads, PyPI downloads, package popularity, package growth, or recurring package download trend tracking.
metadata:
  openclaw:
    requires:
      anyBins:
        - node
---

# package-download-tracker

Use this skill when OpenClaw needs current npm or PyPI package download trends, especially for recurring weekly or monthly analysis.

This skill fetches registry download data, keeps a local normalized current window, and can use saved observations as history so follow-up trend explanations do not need broad historical registry queries.

## Critical Rule

This skill is guidance plus runnable scripts, not a callable tool name.

- Do not call `package-download-tracker` as if it were a built-in tool.
- First use `read` to load this `SKILL.md`.
- Then use `exec` to run the bundled Node script with `node`.
- When the user asks for trend analysis over time, use `--load-memory --save-memory` so previous observations are recalled and refreshed.
- Treat PowerMem recall/save warnings, cache details, script commands, and stored-observation mechanics as internal diagnostics. Do not surface them to the user unless they explicitly ask about implementation mechanics.

## Data Sources

- npm: `https://api.npmjs.org/downloads/range/<period>/<package>`
- PyPI: `https://pypistats.org/api/packages/<package>/overall` and `recent`

## Script Directory

Treat the directory containing this `SKILL.md` as `SKILL_DIR`, then use:

| Script | Purpose |
|---|---|
| `scripts/track-downloads.mjs` | Fetch package downloads, analyze trends from stored observations, and optionally save a new observation |

## Commands

```bash
# Weekly npm package tracker with memory recall and save
node ${SKILL_DIR}/scripts/track-downloads.mjs --registry npm --packages clawmaster,powermem --period week --load-memory --save-memory --summary

# Monthly PyPI tracker
node ${SKILL_DIR}/scripts/track-downloads.mjs --registry pypi --package powermem --period month --load-memory --save-memory

# Force a fresh registry request instead of using today's cache
node ${SKILL_DIR}/scripts/track-downloads.mjs --registry npm --package @types/node --period week --refresh
```

## Query Flags

| Flag | Meaning |
|---|---|
| `--registry <npm|pypi>` | Required registry source |
| `--package <name>` | Package to track; repeatable |
| `--packages <a,b>` | Comma-separated packages to track |
| `--period <week|month>` | Tracking window |
| `--summary` | Print a compact markdown summary instead of JSON |
| `--refresh` | Ignore the local cache for the current window |
| `--load-memory` | Search PowerMem for previous snapshots before registry fetches |
| `--save-memory` | Save the current compact analysis snapshot through `openclaw ltm add` |
| `--cache-path <path>` | Override the cache directory |
| `--history-limit <n>` | Number of historical observations to keep in trend analysis; default is `6` |

## Response Expectations

When you use this skill:

1. Put at least two period columns in the user-facing table: `Current week` and `Previous week` for weekly tracking, or `Current month` and `Previous month` for monthly tracking.
2. Base trend analysis on the history observations returned by the script when available.
3. Prefer stored history over repeated broad registry queries just to rebuild old context.
4. Mention npm/PyPI API or data-quality warnings only when they affect the numbers.
5. Keep the table internally consistent: if the previous-period column is `n/a`, `-`, or otherwise unavailable, the trend/change cell must also say there is no previous-period data. Only show a percentage change when the previous-period column shows the numeric baseline used for that calculation.
6. Keep PowerMem recall/save diagnostics, cache details, script commands, and stored-observation mechanics out of the user-facing summary. Describe them only as current data and prior observations.
7. Do not invent download numbers.
