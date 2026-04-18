# AGENTS.md

Entry point for AI coding agents working in this repository.
Read this file before any other. Full contributor guide: [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Before writing any code

> [!IMPORTANT]
> Complete these steps before touching the codebase. They prevent duplicate work
> and give the PR a clear issue to close.

**1. Search existing issues and PRs**
→ https://github.com/openmaster-ai/clawmaster/issues

**2. If no issue exists, create one using the right template:**

| Situation | Template link |
|---|---|
| Something is broken | [Bug Report](https://github.com/openmaster-ai/clawmaster/issues/new?template=bug_report.yml) |
| New capability or improvement | [Feature Request](https://github.com/openmaster-ai/clawmaster/issues/new?template=feature_request.yml) |
| Picking up a roadmap item | [Contributor Sign-Up](https://github.com/openmaster-ai/clawmaster/issues/new?template=contributor-signup.yml) |
| Question about the codebase | [Discussions](https://github.com/openmaster-ai/clawmaster/discussions) (not an issue) |

**3. Comment on the issue** — state what you plan to do and how.

**4. Create a branch:**
```bash
git checkout -b feat/short-description main   # or fix/, docs/, test/, chore/
```

---

## Adding a feature

New features are **capability modules** in `packages/web/src/modules/<name>/`.
The module system auto-discovers anything placed there — no registration step.

### Minimal structure

```
modules/my-feature/
├── index.ts              ← exports ClawModule (required)
├── MyFeaturePage.tsx     ← main page component
└── __tests__/
    └── myFeature.test.ts ← required
```

### `index.ts` shape

```typescript
import { lazy } from 'react'
import type { ClawModule } from '@/app/modules/types'

export default {
  id: 'my-feature',
  name: 'myFeature.title',    // i18n key — never a raw string
  icon: 'lucide-icon-name',
  route: { path: '/my-feature', component: lazy(() => import('./MyFeaturePage')) },
  navOrder: 50,
} satisfies ClawModule
```

### Data fetching

Use `useAdapterCall` — not raw `useState`/`useEffect`:

```typescript
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
const { data, loading, error } = useAdapterCall(myAdapter.getSomething, { pollMs: 5000 })
```

Add the adapter in `shared/adapters/my-feature.ts` returning `AdapterResult<T>`:

```typescript
import { ok, fail, wrapAsync } from '@/shared/adapters/types'
export const myAdapter = {
  getSomething: () => wrapAsync(async () => {
    const raw = await execCommandJson<MyType>('openclaw', ['my-feature', '--json'])
    return ok(raw)
  }),
}
```

### i18n — required for every visible string

```typescript
const { t } = useTranslation()
// ✓ correct
<h2>{t('myFeature.title')}</h2>
// ✗ never — hardcoded strings are rejected in review
<h2>My Feature</h2>
```

Add the key to **all three** runtime locale files before opening a PR:
- `packages/web/src/locales/main/zh.ts` (Chinese — primary)
- `packages/web/src/locales/main/en.ts`
- `packages/web/src/locales/main/ja.ts`

---

## Fixing a bug

1. **Write a failing unit test first** that reproduces the bug.
2. Fix the code until the test passes.
3. Run `npm test` — all tests must be green.
4. For UI bugs, verify the fix visually with dev-browser before opening a PR
   (see *Screenshots in the PR body* under **Submitting a PR** below).

```bash
npm test                         # full suite
npx vitest run src/path/to/test  # single file, from packages/web/
dev-browser --help               # full UI automation API reference
```

---

## Submitting a PR

```bash
git push -u origin feat/my-feature
gh pr create --fill   # opens the PR template
```

Fill in **## What**, **## Why**, and **## How** — the `pr-description-check` CI job
rejects PRs with an empty `## What` section.

**Screenshots in the PR body.** Any PR with user-visible changes — bug fixes,
features, refactors that shift UI, anything under `packages/web/src/modules/` —
must include screenshots (or a short recording) under **## Screenshots** as
proof of the change. Drag-drop into the GitHub editor uploads to GitHub's CDN
(preferred), or paste markdown from an image host. This is separate from the
"no committed screenshot files" rule — embedding in the PR body is exactly
where screenshots belong.

**Checklist before marking ready for review:**

- [ ] `npm test` passes locally
- [ ] `npm run build` passes (catches TypeScript errors)
- [ ] New behavior has unit tests (happy path + at least one error path)
- [ ] UI changes verified with `dev-browser` against `npm run dev:web`
- [ ] UI changes include screenshots in the PR body's **## Screenshots** section
  (drag-drop into the GitHub editor, or paste markdown from an image host)
- [ ] All i18n keys added to `packages/web/src/locales/main/{zh,en,ja}.ts`
- [ ] No `console.log` left in production paths
- [ ] No screenshots, test logs, or generated files **committed into the repo** (`dist/`, `coverage/`) — embedding screenshots in the PR body is fine and encouraged
- [ ] PR is a **draft** if not yet ready for review

> [!NOTE]
> First-time contributors: a maintainer will add `/ok-to-test` after reviewing
> your diff before the full multi-platform Tauri build runs.

---

## Architecture rules

Enforced by `packages/web/src/shared/__tests__/architecture.boundary.test.ts`.
Violations cause CI to fail.

| Rule | What breaks it |
|---|---|
| `shared/` must not import from `modules/` or `pages/` | Adding `import ... from '@/modules/...'` in any shared file |
| `modules/` must not import `@tauri-apps/api` directly | Use `tauriInvoke` from `shared/adapters/invoke.ts` instead |
| `pages/` must not import `@tauri-apps/api` directly | Same — route through the shared adapter |

---

## Hard rules

Violating any of these will cause a PR to be rejected without review:

- **No new npm packages** without an open issue and maintainer sign-off.
- **No new Rust crates** without a maintainer with desktop experience signing off.
- **No Python, shell scripts, or non-Node.js runtimes** as required dependencies.
- **No hardcoded display strings** — every UI string goes through `t()`.
- **No `console.log`** in production code paths.
- **No generated files** in commits: `dist/`, `coverage/`, `src-tauri/target/`, `*.tsbuildinfo`.
- **Branch prefix required**: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `ci/`, `chore/`.

---

## Technical reference

### Common commands

```bash
npm install                  # install dependencies

npm run dev                  # web frontend only (port 3000)
npm run dev:web              # backend (port 3001) + frontend
npm run dev:backend          # Express backend only
npm run tauri:dev            # desktop app (Tauri)

npm run build                # production build + TypeScript check
npm run tauri:build          # desktop build (platform-specific)

npm test                     # run all Vitest tests

# Tauri build on Linux requires:
export PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig
export PKG_CONFIG_PATH_x86_64_unknown_linux_gnu=$PKG_CONFIG_PATH
```

### Two-mode runtime

The app detects its runtime in `shared/adapters/platform.ts`:

```
Desktop (Tauri)                     Web (Express)
──────────────────────────          ──────────────────────────
React → invoke() → Rust cmd         React → fetch('/api') → Express
        ↓                                   ↓
  src-tauri/lib.rs                  packages/backend/
```

All CLI calls go through `execCommand()` / `execCommandJson<T>()` in `platform.ts`.
Never call `invoke()` or `fetch('/api/exec')` directly from a module or page.

### Repo map

```
clawmaster/
├── packages/web/src/
│   ├── modules/            feature modules (new features go here)
│   │   ├── setup/          installation wizard + onboarding (special — see below)
│   │   ├── observe/        cost/token monitoring (Recharts)
│   │   ├── memory/         PowerMem management
│   │   ├── dashboard/      system overview + entry cards
│   │   ├── gateway/        runtime status and config
│   │   ├── channels/       channel setup and accounts
│   │   ├── models/         provider and model management
│   │   ├── skills/         ClawHub / skill install flows
│   │   ├── plugins/        plugin inventory
│   │   ├── mcp/            MCP install / import / manual config
│   │   ├── sessions/       runtime sessions
│   │   ├── settings/       profile, diagnostics, danger zone
│   │   ├── config/         raw openclaw.json editor
│   │   └── agents/         agent inventory
│   ├── shared/
│   │   ├── adapters/       per-tool adapters returning AdapterResult<T>
│   │   │   ├── platform.ts runtime detection + execCommand (single entry point)
│   │   │   ├── invoke.ts   tauriInvoke helper (only place @tauri-apps/api is allowed)
│   │   │   └── *.ts        one file per OpenClaw tool
│   │   ├── hooks/          useAdapterCall, useInstallTask
│   │   └── components/     ErrorBoundary, LoadingState, CapabilityGuard, PasswordField
│   ├── app/                routing, sidebar, startup, command registry
│   ├── pages/              legacy pages — do not add new code here
│   └── locales/main/       zh.ts · en.ts · ja.ts
├── packages/backend/       Express API server (web mode, port 3001)
├── src-tauri/              Tauri 2 desktop backend (Rust)
├── bin/clawmaster.mjs      CLI entry point
└── tests/ui/               YAML-based manual UI test plans
```

### setup module

`modules/setup/` is special — it exports:
- `SetupWizard` component
- `getSetupAdapter()` returning `demoSetupAdapter` | `realSetupAdapter`
- `CAPABILITIES` and `CapabilityId` type (used by `CapabilityGuard`)

It covers 16 LLM providers and 6 channel types.

### i18n

```
packages/web/src/locales/main/
├── zh.ts   Chinese (primary / fallback)
├── en.ts   English
└── ja.ts   Japanese
```

Language preference in `localStorage` key `clawmaster-language`.
`changeLanguage()` exported from `src/i18n/index.ts`.
Language switcher in the header and setup wizard.

### Testing

**Unit tests (Vitest)**

- Framework: Vitest + jsdom + @testing-library/react
- Config: `packages/web/vitest.config.ts`
- Location: co-located `__tests__/` directories
- Run single file: `npx vitest run src/path/to/test.ts` (from `packages/web/`)
- Architecture boundary rules: `shared/__tests__/architecture.boundary.test.ts`

**UI flow testing (dev-browser)**

For verifying UI behaviour end-to-end, use [dev-browser](https://github.com/sawyerhood/dev-browser) — a sandboxed Playwright runner built for AI agents.

```bash
# one-time setup
npm install -g dev-browser
dev-browser install          # installs Playwright + Chromium
```

Walk a UI flow against the running dev server:

```bash
# start the app first
npm run dev:web              # http://localhost:3000

# then drive it
dev-browser --headless <<'EOF'
const page = await browser.getPage("main");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.screenshot({ path: "screenshot.png" });
console.log(await page.title());
EOF
```

Connect to an already-open Chrome instead of launching headless:

```bash
# launch Chrome with remote debugging enabled first
# macOS: open -a "Google Chrome" --args --remote-debugging-port=9222
dev-browser --connect <<'EOF'
const page = await browser.getPage("main");
// interact with the live app
EOF
```

The YAML-based UI test plans in `tests/ui/` describe the flows to walk through.
Run `dev-browser --help` for the full LLM-oriented API reference.

### UI conventions

- Styling: Tailwind CSS only — no custom CSS files
- Icons: Lucide React only — no other icon libraries, no emoji in UI
- Dark mode toggle (independent from color theme)
- Color themes: Lobster Orange, Ocean Blue
- Responsive: mobile hamburger menu

### Rust / Tauri

- Minimum Rust: 1.77.2
- Commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`
- Config path: `dirs::home_dir()` / `dirs::config_dir()` from the `dirs` crate
- Linux system deps: `libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev patchelf`
- Desktop targets: Linux (deb, rpm, AppImage), macOS (dmg, x64 + ARM64), Windows (msi + exe)

### CI

Every push/PR: `npm ci` → TypeScript check → `npm test` → `npm run build`.
Tags + main + manual dispatch: multi-platform Tauri builds (Linux x64, macOS x64/ARM64, Windows x64).
Draft GitHub releases created on tag pushes; non-tag builds upload artifacts with 7-day retention.
