---
name: paddleocr-doc-parsing
description: PaddleOCR document parsing guidance for PDFs and images hosted on Baidu AI Studio. Use when the user wants to extract text or structured markdown from scans, screenshots, photos, tables, or PDFs and needs help choosing PaddleOCR options such as fileType, orientation correction, unwarping, layout detection, chart recognition, restructurePages, mergeTables, relevelTitles, prettifyMarkdown, and visualize. This skill is guidance, not a callable tool: read this file, then use the bundled Node scripts via exec to test the configured PaddleOCR connection or run document parsing against local files, URLs, data URLs, or base64 content.
metadata:
  openclaw:
    requires:
      anyBins:
        - node
---

# PaddleOCR Doc Parsing

Use this skill when the user wants OCR or structured document parsing from images or PDFs and OpenClaw should actually run PaddleOCR instead of only describing the API.

The bundled scripts accept local files and remote PDF/image links. For remote links, they fetch the file first and send Base64 to PaddleOCR, which is more reliable than assuming the hosted API can dereference the URL itself.

## Critical Rule

This skill is guidance, not a callable tool.

- Do not call `paddleocr-doc-parsing` as if it were a tool name.
- First use `read` to load this `SKILL.md`.
- Then use `exec` to run the bundled Node script with `node`.
- If the user expects OCR output, actually run the script. Do not stop at parameter advice.

## Trigger Cues

Reach for this skill when the user asks for things like:

- OCR this image or screenshot
- extract text from this PDF
- parse this scan into markdown
- read a document from an image link or PDF URL
- pull text or structure from a receipt, table, report, or form

## Script Directory

Determine this `SKILL.md` directory path as `SKILL_DIR`, then use these scripts:

| Script | Purpose |
|---|---|
| `scripts/test-connection.mjs` | Verifies the saved PaddleOCR endpoint and token with a sample file |
| `scripts/parse-document.mjs` | Runs PaddleOCR doc parsing and returns JSON plus merged markdown |

Both scripts are plain Node ESM and should be run with `node`.

## Config Resolution

The scripts resolve credentials and defaults in this order:

1. CLI flags
2. `PADDLEOCR_ENDPOINT` / `PADDLEOCR_TOKEN`
3. `ocr.providers.paddleocr` in `~/.openclaw/openclaw.json`
4. `models.providers.baidu-aistudio.apiKey` as the fallback token

If the user already configured PaddleOCR in ClawMaster or OpenClaw, prefer running the scripts without repeating endpoint and token on the command line.

## Default Workflow

1. Diagnose the source type.
   Use `fileType: 0` for PDFs and `fileType: 1` for images.
2. Pick the smallest useful preset.
   `clean-pdf` for exported documents, `mobile-scan` for phone photos, `layout-debug` when layout ordering is wrong.
3. Verify the connection if the endpoint or token is new.
4. Run the parse script.
5. Summarize the parsed markdown and call out any layout or table limitations.

If the user asks for "markdown only", "recognized text only", or "no explanation", return only the parsed markdown from the script.

## Commands

```bash
# Verify the saved OCR config against the default sample image
node ${SKILL_DIR}/scripts/test-connection.mjs

# Parse a local PDF with the clean PDF preset
node ${SKILL_DIR}/scripts/parse-document.mjs ./invoice.pdf --preset clean-pdf --markdown-out /tmp/invoice.md

# Parse an image URL with mobile scan settings
node ${SKILL_DIR}/scripts/parse-document.mjs https://example.com/photo.jpg --preset mobile-scan
```

## Important Flags

| Flag | Meaning |
|---|---|
| `--file <value>` | Local path, PDF/image URL, data URL, or raw base64. Positional file input also works. |
| `--file-type <image|pdf|1|0>` | Overrides automatic file type detection. |
| `--preset <clean-pdf|mobile-scan|layout-debug>` | Applies a curated option set before per-flag overrides. |
| `--output <path>` | Writes the full JSON result to disk. |
| `--markdown-out <path>` | Writes merged markdown text to disk. |
| `--visualize` | Requests debug images from PaddleOCR. |

Boolean option flags map directly to the PaddleOCR request body:

- `--use-doc-orientation-classify`
- `--use-doc-unwarping`
- `--use-layout-detection`
- `--use-chart-recognition`
- `--restructure-pages`
- `--merge-tables`
- `--relevel-titles`
- `--prettify-markdown`
- `--visualize`

Use `--no-...` to force any of those options off.

## Preset Guidance

- `clean-pdf`
  Use for normalized PDFs that need readable markdown, cross-page table merge, and title cleanup.
- `mobile-scan`
  Use for camera captures, warped paper, or screenshots with mixed blocks.
- `layout-debug`
  Use when the user needs visualization output to inspect segmentation or ordering mistakes.

## Response Expectations

When the script returns:

1. Report which preset or options were used and why.
2. Surface page count and whether layout images were generated.
3. Quote or summarize the important markdown output.
4. If parsing quality is weak, suggest the next option change instead of retrying blindly.
