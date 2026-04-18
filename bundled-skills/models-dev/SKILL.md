---
name: models-dev
description: General-purpose model metadata and pricing lookup powered by models.dev. Use when the user needs model pricing, context windows, capabilities, modalities, knowledge cutoffs, provider metadata, or cross-provider model comparisons. This skill is guidance plus runnable Node scripts: read this file, then use exec with node to refresh the cached catalog or query it with filters.
metadata:
  openclaw:
    requires:
      anyBins:
        - node
---

# models.dev

Use this skill when OpenClaw needs current model metadata, not just a rough recollection.

This skill turns the upstream `https://models.dev/api.json` payload into a stable local cache and a queryable interface that other OpenClaw workflows can reuse.

## Critical Rule

This skill is guidance plus runnable scripts, not a callable tool name.

- Do not call `models-dev` as if it were a built-in tool.
- First use `read` to load this `SKILL.md`.
- Then use `exec` to run the bundled Node scripts with `node`.
- If the user needs real pricing or capability data, actually run the query script instead of answering from memory.

## What this skill provides

- Refreshes and caches the full models.dev catalog locally.
- Looks up a provider or a specific model by id.
- Filters models by capabilities such as reasoning, tool calling, structured output, attachments, or open weights.
- Filters by input and output modality.
- Returns structured JSON that downstream workflows can reuse for pricing, selection, or validation.

## Cache behavior

- Default cache path: `~/.openclaw/cache/models-dev.json`
- Default TTL: 24 hours
- Use `--refresh` to force a new download.
- Use `--max-age-ms` to override the TTL.

## Script Directory

Treat the directory containing this `SKILL.md` as `SKILL_DIR`, then use:

| Script | Purpose |
|---|---|
| `scripts/query-models.mjs` | Refreshes the cache when needed and returns filtered model/provider data as JSON |

## Default workflow

1. Decide whether the user needs one model, one provider, or a capability-based comparison.
2. Run the query script with the smallest filter set that answers the question.
3. If the cache may be stale or the user asks for the latest numbers, include `--refresh`.
4. Summarize the result in plain language, but keep the structured JSON available when another tool or workflow needs it.

## Commands

```bash
# Refresh the cache and print a summary
node ${SKILL_DIR}/scripts/query-models.mjs --refresh --summary

# Get one model by id
node ${SKILL_DIR}/scripts/query-models.mjs --model gpt-4o

# List OpenAI models that support reasoning and tool calls
node ${SKILL_DIR}/scripts/query-models.mjs --provider openai --supports reasoning --supports tool_call

# Find multimodal models that accept images and output text
node ${SKILL_DIR}/scripts/query-models.mjs --input-modality image --output-modality text

# Compare open-weight reasoning models
node ${SKILL_DIR}/scripts/query-models.mjs --supports reasoning --open-weights true --limit 20
```

## Query flags

| Flag | Meaning |
|---|---|
| `--refresh` | Ignore cache age and fetch a fresh catalog |
| `--max-age-ms <number>` | Override the default cache TTL |
| `--cache-path <path>` | Override the default cache file |
| `--provider <id|name>` | Filter providers by id or display name |
| `--model <id|name>` | Filter models by id or display name |
| `--family <id>` | Filter by model family |
| `--supports <capability>` | Capability filter, repeatable. Supports `reasoning`, `tool_call`, `structured_output`, `attachment`, `temperature`. |
| `--input-modality <value>` | Required input modality, repeatable |
| `--output-modality <value>` | Required output modality, repeatable |
| `--open-weights <true|false>` | Filter by open-weight status |
| `--limit <number>` | Limit the number of returned models |
| `--summary` | Return a compact summary instead of the full normalized records |

## Response expectations

When you use this skill:

1. Say whether the response came from cache or a fresh download.
2. Call out the provider and exact model ids when quoting pricing.
3. Mention missing fields explicitly instead of inventing values.
4. If the user is choosing a model, compare the relevant limits and capability flags directly.
