# Output Contract

Content Draft artifacts are saved under a single root directory:

- `${OPENCLAW_WORKSPACE_DIR}/content-drafts`
- or `~/.openclaw/workspace/content-drafts`

Each run gets its own directory:

- `${root}/${runId}/`

Each platform variant lives inside that run:

- `${root}/${runId}/${platform}/draft.md`
- `${root}/${runId}/${platform}/manifest.json`
- `${root}/${runId}/${platform}/images/*`

## `manifest.json`

The bundled save helper currently writes:

```json
{
  "runId": "20260419-093000-my-post",
  "platform": "xhs",
  "title": "My Post",
  "slug": "my-post",
  "sourceUrl": "https://example.com/post",
  "draftPath": "/abs/path/draft.md",
  "imagesDir": "/abs/path/images",
  "imageFiles": ["cover.png", "panel-1.png"],
  "savedAt": "2026-04-19T09:30:00.000Z"
}
```

Keep new fields additive so future viewers can read older manifests.
