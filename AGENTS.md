# AGENTS.md

Entry point for AI coding agents working in this repository.
Read this file before any other. Full contributor guide: [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Before writing any code

> [!IMPORTANT]
> Complete these steps before touching the codebase. They prevent duplicate work
> and give the PR a clear issue to close.

**1. Search existing issues and PRs**
→ https://github.com/clawmaster-ai/clawmaster/issues

**2. If no issue exists, create one using the right template:**

| Situation | Template link |
|---|---|
| Something is broken | [Bug Report](https://github.com/clawmaster-ai/clawmaster/issues/new?template=bug_report.yml) |
| New capability or improvement | [Feature Request](https://github.com/clawmaster-ai/clawmaster/issues/new?template=feature_request.yml) |
| Picking up a roadmap item | [Contributor Sign-Up](https://github.com/clawmaster-ai/clawmaster/issues/new?template=contributor-signup.yml) |
| Question about the codebase | [Discussions](https://github.com/clawmaster-ai/clawmaster/discussions) (not an issue) |

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

Add the key to **all three** files before opening a PR:
- `packages/web/src/i18n/zh.json` (Chinese — primary)
- `packages/web/src/i18n/en.json`
- `packages/web/src/i18n/ja.json`

---

## Fixing a bug

1. **Write a failing test first** that reproduces the bug.
2. Fix the code until the test passes.
3. Run `npm test` — all tests must be green.

```bash
npm test                         # full suite
npx vitest run src/path/to/test  # single file, from packages/web/
```

---

## Submitting a PR

```bash
git push -u origin feat/my-feature
gh pr create --fill   # opens the PR template
```

Fill in **## What**, **## Why**, and **## How** — the `pr-description-check` CI job
rejects PRs with an empty `## What` section.

**Checklist before marking ready for review:**

- [ ] `npm test` passes locally
- [ ] `npm run build` passes (catches TypeScript errors)
- [ ] New behavior has unit tests (happy path + at least one error path)
- [ ] All i18n keys added to `zh.json`, `en.json`, `ja.json`
- [ ] No `console.log` left in production paths
- [ ] No screenshots, test logs, or generated files committed (`dist/`, `coverage/`)
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
packages/web/src/
├── modules/            feature modules (new features go here)
│   ├── setup/          installation wizard + onboarding (special — see below)
│   ├── observe/        cost/token monitoring
│   ├── memory/         PowerMem management
│   └── ...             (dashboard, gateway, channels, models, skills, ...)
├── shared/
│   ├── adapters/       per-tool adapters returning AdapterResult<T>
│   │   ├── platform.ts runtime detection + execCommand (single entry point)
│   │   ├── invoke.ts   tauriInvoke helper (only legitimate @tauri-apps/api import)
│   │   └── *.ts        one file per OpenClaw tool
│   ├── hooks/          useAdapterCall, useInstallTask
│   └── components/     ErrorBoundary, LoadingState, CapabilityGuard, PasswordField
├── app/                routing, sidebar, startup, command registry
├── pages/              legacy pages (do not add new code here)
└── i18n/               zh.json · en.json · ja.json
```

### setup module

`modules/setup/` is special — it exports:
- `SetupWizard` component
- `getSetupAdapter()` returning `demoSetupAdapter` | `realSetupAdapter`
- Types used by `CapabilityGuard` in `shared/components/`

It covers 16 LLM providers and 6 channel types.

### i18n

```
packages/web/src/i18n/
├── zh.json   Chinese (primary / fallback)
├── en.json   English
└── ja.json   Japanese
```

Language preference stored in `localStorage` key `clawmaster-language`.
`changeLanguage()` exported from `src/i18n/index.ts`.

### Testing

- Framework: Vitest + jsdom + @testing-library/react
- Config: `packages/web/vitest.config.ts`
- Location: co-located `__tests__/` directories
- Run single file: `npx vitest run src/path/to/test.ts` (from `packages/web/`)

### Rust / Tauri

- Minimum Rust version: 1.77.2
- Commands registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`
- Config path resolution uses `dirs` crate (`dirs::home_dir()`)
- Linux build deps: `libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev patchelf`

### CI

Every push/PR runs: `npm ci` → TypeScript check → `npm test` → `npm run build`.
Tag pushes additionally trigger multi-platform Tauri builds (Linux x64, macOS x64/ARM64, Windows x64).
