# PR15 UI Evidence

Captured on 2026-04-12 against the PR #15 worktree with the web app running from:

- `npm run dev --workspace=@openclaw-manager/web -- --host 127.0.0.1 --port 4173`

Evidence set:

- `setup-zh.png`: `?demo=install` setup wizard, Chinese, PaddleOCR OCR module configured with preview visible.
- `setup-en.png`: `?demo=install` setup wizard, English, PaddleOCR OCR module configured with preview visible.
- `setup-ja.png`: `?demo=install` setup wizard, Japanese, PaddleOCR OCR module configured with preview visible.
- `skills-zh.png`: `/skills?demo=skip`, Chinese, built-in PaddleOCR section plus OCR dialog preview.
- `skills-en.png`: `/skills?demo=skip`, English, built-in PaddleOCR section plus OCR dialog preview.
- `skills-ja.png`: `/skills?demo=skip`, Japanese, built-in PaddleOCR section plus OCR dialog preview.

Notes:

- Setup wizard screenshots use the built-in `demo=install` adapter path so PaddleOCR preview data can be exercised in a browser-only run.
- Skills page screenshots use Playwright network mocks for `/api/exec`, `/api/skills`, and `/api/paddleocr/*`, because plain Vite browser mode does not provide the desktop/backend `/api` handlers that the page expects.
