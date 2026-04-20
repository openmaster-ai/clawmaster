---
name: content-draft
description: Primary repo-owned workflow for turning an article URL or source file into WeChat or Xiaohongshu draft markdown plus saved illustration artifacts. Use this when the user wants OpenClaw itself to deep dive a source and generate a draft with illustrations, especially for prompts like "generate a wechat post with illustrations". Prefer this instead of `baoyu-article-illustrator`, `baoyu-post-to-wechat`, or `baoyu-image-gen` when the goal is draft generation rather than publishing.
metadata:
  openclaw:
    requires:
      anyBins:
        - node
---

# Content Draft

Use this skill when the user wants a source link converted into a polished draft for a target platform, with output saved as reusable artifacts instead of only replying inline.

## Critical Rules

This skill is the default repo-owned workflow for URL to draft generation.

- Do not call `content-draft` like a tool name.
- First read this `SKILL.md`.
- For URL or local-file analysis, use the bundled Node extractor in this skill. Do not delegate this workflow to `baoyu-*` skills or any Bun-based helper.
- When the user asks for a WeChat or XHS draft with illustrations, prefer this skill over `baoyu-article-illustrator` and `baoyu-post-to-wechat`.
- For illustrations, prefer the repo-owned `ernie-image` skill when it is available. Otherwise use the runtime's built-in image generation capability. Do not route illustration work through `baoyu-*` skills for this workflow.
- Use `memory_recall` before drafting when tone, audience, or visual style preferences matter.
- This skill generates drafts and saved artifacts. Do not publish anything unless the user explicitly asks for publishing.

## Default Workflow

1. Confirm the source and target platform.
   Start with `xhs` or `wechat`.
2. Extract the source material with the bundled Node script.
   This keeps URL analysis inside the repo-owned `content-draft` skill instead of drifting into external skill stacks.
3. Recall stable user preferences.
   Ask `memory_recall` for tone, structure, visual style, and past corrections.
4. Produce one platform draft at a time.
   Save concise, publish-ready markdown, not raw notes.
5. Generate the illustration set with `ernie-image` when available, or the runtime's built-in image generation capability otherwise.
   Follow the platform image counts in `references/platforms.md`.
6. Save the markdown and generated images with the bundled script.
   Standard output layout is documented in `references/output-contract.md`.
7. Build the final chat response from the saved draft and saved images.
   Return the helper output so the user gets the full draft body plus embedded images in the same reply.

## Platform Scope

- `xhs`
  Short card-oriented copy with a strong hook, scannable sections, and image-first pacing.
- `wechat`
  Longer editorial article with a clear title, dek, section rhythm, and one lead image.

Read `references/platforms.md` when you need the detailed formatting rules.

## Extraction Guidance

When the user provides a generic article URL, docs page, or local source file, use this bundled Node extractor first:

```bash
node ${SKILL_DIR}/scripts/fetch-url-markdown.mjs "https://example.com/post" --output /tmp/source.md
```

Useful options:

- `--json`
  Print structured metadata plus the extracted markdown.
- `--output <file>`
  Save the extracted markdown for later drafting steps.
- `--max-chars <n>`
  Cap very long sources before handing them to the model.

Supported inputs:

- `https://...` and `http://...`
- `file:///abs/path/to/file.html`
- local file paths such as `/tmp/source.html` or `notes.md`

For GitHub repos or YouTube inputs, prefer the best runtime-native extraction path that is already available, but keep the rest of the workflow inside this skill. Do not write custom scraping code inside the conversation unless the user explicitly asks for that engineering work.

## Illustration Guidance

- `xhs`
  Usually prepare 1 cover plus 2-6 supporting cards.
- `wechat`
  Usually prepare 1 hero image plus optional inline support visuals.
- Prefer `ernie-image` for repo-owned illustration generation when it is available in the workspace.
- Generate images only after the article structure is stable.
- Save every generated image path so it can be persisted with the bundled save helper.

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

## Building The Final Chat Reply

After saving artifacts, build the final reply markdown from the saved draft plus saved images:

```bash
node ${SKILL_DIR}/scripts/build-chat-response.mjs \
  --markdown-file /abs/path/to/draft.md \
  --images-dir /abs/path/to/images
```

This helper rewrites local draft image references into OpenClaw-compatible `MEDIA:` blocks in the markdown flow and appends any leftover generated images under a `Generated Images` section.

Return this helper output to the user as the final assistant reply unless the user explicitly asked for a shorter summary instead.
Do not summarize, paraphrase, or describe the helper output after generating it. Emit the helper output itself as the final assistant message so the draft body and `MEDIA:` images survive intact in chat.

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
3. State which illustration path you used.
4. Save the artifacts with the bundled script and report the saved location.
5. Run `build-chat-response.mjs` against the saved draft and saved images.
6. Return the full final draft body plus the generated images in the same reply.
7. Only replace the full draft with a concise summary when the user explicitly asks for summary-only output.

When the user only wants planning:

1. Provide the platform choice.
2. Provide the extraction plan.
3. Provide the illustration plan.
4. Provide the expected artifact layout.
