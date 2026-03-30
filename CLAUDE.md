# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawMaster (龙虾管理大师) is a desktop/web management platform for the OpenClaw ecosystem. It wraps the OpenClaw CLI in a GUI using Tauri 2 (desktop) or Express (web), with a React frontend. All data is config-driven from `~/.openclaw/openclaw.json` -- no database.

## Common Commands

```bash
# Install dependencies
npm install

# Development
npm run dev           # Web frontend only (port 3000)
npm run dev:web       # Backend (port 3001) + frontend together
npm run dev:backend   # Express backend only
npm run tauri:dev     # Desktop app (Tauri)

# Build
npm run build         # Web production build
npm run tauri:build   # Desktop production build (platform-specific)

# Test
npm test              # Run all Vitest tests (once)
npm run test:watch --workspace=@openclaw-manager/web  # Watch mode

# Tauri build on Linux requires PKG_CONFIG_PATH
export PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig
export PKG_CONFIG_PATH_x86_64_unknown_linux_gnu=$PKG_CONFIG_PATH
```

## Architecture

### Monorepo Structure

- **`packages/web/`** -- React 18 frontend (Vite, TypeScript, Tailwind CSS, React Router 7)
- **`packages/backend/`** -- Express API server (port 3001) with WebSocket for log streaming; uses `execFile` (not shell) to prevent injection
- **`src-tauri/`** -- Tauri 2 desktop backend (Rust), 9 commands that shell out to OpenClaw CLI
- **`bin/clawmaster.mjs`** -- CLI entry point
- **`tests/ui/`** -- YAML-based UI test plans (manual, not automated)

### Two-Mode Runtime

The app runs in two modes detected by `shared/adapters/platform.ts`:
- **Desktop (Tauri)**: Frontend calls Rust commands via `@tauri-apps/api` -> `invoke()`
- **Web (Express)**: Frontend proxies `/api` to Express backend (Vite dev proxy on port 3000 -> 3001)

### Module System

New features are built as **capability modules** in `packages/web/src/modules/`. Each module exports a `ClawModule` interface from its `index.ts`:

```typescript
// modules/observe/index.ts
export default {
  id: 'observe',
  name: '可观测',
  icon: 'bar-chart',
  route: { path: '/observe', component: lazy(() => import('./ObservePage')) },
  navOrder: 20,
} satisfies ClawModule
```

Modules are auto-discovered via `import.meta.glob` in `modules/registry.ts` and registered in `App.tsx` for routing and sidebar navigation. To add a new module: create `modules/<name>/index.ts` exporting a `ClawModule` -- it will appear automatically.

Current modules: `setup` (installation wizard + onboarding), `observe` (cost/token monitoring with Recharts), `memory` (PowerMem management).

The **setup module** is special: it exports `SetupWizard`, `getSetupAdapter` (with `demoSetupAdapter` and `realSetupAdapter` variants), and types. The onboarding flow covers API key entry, model selection, gateway config, and channel setup for all 16 supported providers and 6 channel types.

### Shared Layer

- **`shared/adapters/`** -- Split per-tool adapters (clawhub, clawprobe, clawprobe-demo, powermem, mirror), each returning `AdapterResult<T>` from `shared/adapters/types.ts`. Use `ok()`, `fail()`, and `wrapAsync()` helpers.
- **`shared/adapters/platform.ts`** -- Single source for `isTauri()` detection, `execCommand()`, and `execCommandJson<T>()`. All CLI calls go through here.
- **`shared/hooks/useAdapterCall.ts`** -- Generic data-fetching hook replacing copy-paste `useState`/`useEffect` patterns. Supports polling and auto-fetch.
- **`shared/components/`** -- `ErrorBoundary`, `LoadingState`, `CapabilityGuard`, `PasswordField`

### i18n

Uses **react-i18next** with bundled JSON translation files at `packages/web/src/i18n/`:
- `zh.json` (Chinese, fallback), `en.json` (English), `ja.json` (Japanese)
- 386 translation keys covering all UI text
- Language preference stored in `localStorage` key `clawmaster-language`
- `changeLanguage()` exported from `src/i18n/index.ts`
- Language switcher appears in the header and in the setup wizard

All UI text must go through `t()` from `useTranslation()`. Do not hardcode Chinese strings in components.

### Legacy Pages

Older pages in `packages/web/src/pages/` (Dashboard, Gateway, Config, Models, Skills, Settings, Logs, Channels, Agents) still use the monolithic `adapters/index.ts` directly. New code should use the split adapters in `shared/adapters/` and the `useAdapterCall` hook.

### Testing

- **Framework**: Vitest + jsdom + @testing-library/react
- **Config**: `packages/web/vitest.config.ts`
- **Tests location**: Co-located `__tests__/` directories (e.g., `shared/adapters/__tests__/`, `modules/setup/__tests__/`)
- **Run single test**: `npx vitest run src/shared/adapters/__tests__/platform.test.ts --workspace=@openclaw-manager/web`
- **Counts**: 74 unit tests, 85 YAML-based UI test cases

### UI

- Styling: Tailwind CSS with Lucide React icons (no emoji in UI)
- Dark mode toggle (independent from color theme)
- Color themes: Lobster Orange, Ocean Blue
- Responsive: mobile hamburger menu
- All text goes through i18n -- see the i18n section above

## Rust / Tauri Notes

- Minimum Rust version: 1.77.2
- Tauri commands are registered in `lib.rs` via `tauri::generate_handler![]`
- Config file path resolution uses the `dirs` crate (`dirs::home_dir()` / `dirs::config_dir()`)
- Desktop builds target: Linux (deb, rpm, AppImage), macOS (dmg, x86_64 + aarch64), Windows (msi + portable)
- Linux system deps: `libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev patchelf`

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`):
1. **Test job** (every push/PR): `npm ci` -> TypeScript check -> `npm test` -> `npm run build`
2. **Build job** (tags, main, manual): multi-platform Tauri build (Linux x64, macOS x64/ARM64, Windows x64)
3. Tag pushes create draft GitHub releases with platform installers; non-tag builds upload artifacts with 7-day retention
