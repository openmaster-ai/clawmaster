---
name: content-draft
description: Multi-platform content draft workflow for turning a source URL into platform-ready markdown and image artifacts. Use when the user wants to turn a blog post, website, GitHub repo, or YouTube video into a Xiaohongshu or WeChat draft with recalled preferences, structured extraction, and saved output files. This skill is guidance plus a bundled Node helper: read this file, use memory_recall and the relevant MCPs for extraction, then use the save-draft-artifacts script to persist the finished draft and images into the standard content-drafts output directory.
metadata:
  openclaw:
    requires:
      anyBins:
        - node
---

# Content Draft

Use this skill when the user wants a source link converted into a polished draft for a target platform, with output saved as reusable artifacts instead of only replying inline.

## Critical Rule

This skill is guidance plus one persistence helper.

- Do not call `content-draft` like a tool name.
- First read this `SKILL.md`.
- Use `memory_recall` before drafting when tone, audience, or visual style preferences matter.
- Use the relevant MCP path for extraction instead of inventing a scraper.
- When the draft is ready, run the bundled Node script to save the markdown and generated images.

## Default Workflow

1. Confirm the source and target platform.
   Start with `xhs` or `wechat` for V1.
2. Extract the source material.
   Use a fetch-style markdown path for generic pages and a DeepWiki summary path for GitHub repos.
3. Recall stable user preferences.
   Ask `memory_recall` for tone, structure, visual style, and past corrections.
4. Produce one platform draft at a time.
   Save concise, publish-ready markdown, not raw notes.
5. Save artifacts with the bundled script.
   Standard output layout is documented in `references/output-contract.md`.

## Platform Scope

- `xhs`
  Short card-oriented copy with a strong hook, scannable sections, and image-first pacing.
- `wechat`
  Longer editorial article with a clear title, dek, section rhythm, and one lead image.

Read `references/platforms.md` when you need the detailed formatting rules.

## Extraction Guidance

- Generic URL or blog post:
  Use the configured fetch-style MCP or equivalent markdown extraction path.
- GitHub repo:
  Use DeepWiki for a structured repo summary before adapting it.
- YouTube:
  Use a transcript-first extraction path.

Do not write custom scraping code inside the conversation unless the user explicitly asks for that engineering work.

## Saving Artifacts

Determine this `SKILL.md` directory as `SKILL_DIR`, then run:

```bash
node ${SKILL_DIR}/scripts/save-draft-artifacts.mjs \
  --platform xhs \
  --title "Kimi K2.5 notes" \
  --source-url "https://example.com/post" \
  --markdown-file /tmp/xhs-draft.md \
  --image /tmp/cover.png
```

The script prints a JSON summary with the saved paths.

Use `--run-id <id>` when saving multiple platform variants for the same source so they land under the same run directory.

## Arguments

| Flag | Purpose |
|---|---|
| `--platform <xhs|wechat|...>` | Required target platform id |
| `--title <text>` | Optional human-readable title stored in the manifest |
| `--source-url <url>` | Optional original source URL |
| `--run-id <id>` | Reuse a shared run directory across multiple saves |
| `--root <path>` | Override the default output root |
| `--markdown-file <path>` | Read markdown from a file |
| `--markdown <text>` | Inline markdown when a temp file is unnecessary |
| `--image <path>` | Copy one image into the platform `images/` directory; repeatable |
| `--images-dir <path>` | Copy every file from a directory into `images/` |
| `--slug <value>` | Optional stable slug for the run directory |

## Output Contract

Read `references/output-contract.md` before changing the save layout.

Current contract:

- `${root}/${runId}/${platform}/draft.md`
- `${root}/${runId}/${platform}/manifest.json`
- `${root}/${runId}/${platform}/images/*`

Default root:

- `${OPENCLAW_WORKSPACE_DIR}/content-drafts` when `OPENCLAW_WORKSPACE_DIR` is set
- otherwise `~/.openclaw/workspace/content-drafts`

## Response Expectations

When the user wants the actual draft:

1. State which extraction path you used.
2. State which preference memories influenced the result.
3. Return the final draft content or a concise summary of it.
4. Save the artifacts with the script and report the saved location.

When the user only wants planning:

1. Provide the platform choice.
2. Provide the extraction plan.
3. Provide the expected artifact layout.
