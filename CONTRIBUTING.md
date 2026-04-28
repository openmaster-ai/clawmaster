# Contributing to ClawMaster

Thank you for your interest in contributing to ClawMaster! This guide will help you get started.

## Ways to Contribute

- **Bug reports**: Open an issue with steps to reproduce, expected vs actual behavior, and environment details.
- **Feature requests**: Describe the use case and proposed solution in an issue.
- **Code**: Fix bugs, implement features, or improve performance.
- **Documentation**: Improve README, inline docs, or this guide.
- **Translations**: Add or improve i18n strings in `packages/web/src/locales/main/`.
- **Testing**: Add test cases or improve existing coverage.

## Development Setup

Prerequisites: **Node.js 20+** and npm.

```bash
git clone https://github.com/openmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web    # Starts backend (port 16224) + frontend (port 16223)
npm test           # Run all tests
```

For desktop (Tauri) development, see the Rust/Tauri section in `CLAUDE.md`.

## Branch and PR Workflow

1. **Fork** the repository and clone your fork.
2. Create a **feature branch** from `develop`:
   ```bash
   git checkout -b feat/my-feature develop
   ```
3. Make your changes, commit with conventional messages (see below), and push.
4. Open a **Pull Request** against `develop` in the upstream repo.
5. Fill in the PR template. Link related issues with `Closes #123`.

Keep PRs focused -- one logical change per PR.

## Code Style

- **TypeScript** with strict mode enabled. No `any` unless absolutely necessary.
- **Tailwind CSS** for all styling. No custom CSS files.
- **Lucide React** for icons. No other icon libraries.
- New features should be built as **capability modules** in `packages/web/src/modules/` (see `CLAUDE.md` for the `ClawModule` pattern).
- Use split adapters in `shared/adapters/` and the `useAdapterCall` hook for data fetching.

## Adding or Updating Model Providers

ClawMaster is a UI and local service layer for OpenClaw. A provider should usually be supported by OpenClaw first; ClawMaster then makes that provider easy to discover, validate, and configure in the setup wizard and Models page.

Before opening a provider PR:

- Open or link an issue that identifies the provider, API docs, default base URL, API-key page, supported model IDs, and whether the API is native OpenAI-compatible.
- Confirm the OpenClaw runtime provider id. Use that id in ClawMaster model refs (`provider/model`) unless there is already a documented alias.
- If the vendor docs include an OpenClaw config snippet, copy the exact provider id, `baseUrl`, `api` mode, and default model into the issue before coding.
- Test credentials may be used for local smoke checks, but never commit real keys, screenshots that reveal keys, terminal logs containing keys, or `.env` files.
- Do not add dependencies for provider integration. Provider setup should use existing adapters, fetch helpers, and config writers.

Provider UI source of truth:

- Add the provider to `packages/web/src/modules/setup/types.ts` in `PROVIDERS`.
- Include `label`, `keyUrl`, `models`, `defaultModel`, and `baseUrl` when the endpoint is fixed.
- Set `api: 'openai-completions'` for OpenAI-compatible chat/completions providers that OpenClaw should persist with that API mode.
- Use `labelByLocale` and `credentialLabelByLocale` only when the display name or credential name needs localization beyond the default English label and `API Key`.
- Add the provider id to `TEXT_PROVIDER_TIERS` so it appears in both the setup wizard and Models add-provider dialog. Image-only providers must use `kind: 'text-to-image'` and belong in `PRIMARY_IMAGE_PROVIDERS` instead.
- Use `runtimeProviderId` only when the UI entry intentionally writes to another OpenClaw provider key, such as a text-to-image variant sharing a chat provider account.
- Use `configKeyOverride` only for legacy OpenClaw config compatibility.

Live model catalogs:

- Add the provider default base URL to both `packages/web/src/shared/providerCatalog.ts` and `packages/backend/src/services/providerCatalogService.ts` when the Models page should fetch `/models` in desktop and web modes.
- Keep catalog allowlists strict. Non-custom providers must only accept their documented host, protocol, port, and base path. The custom OpenAI-compatible provider is the only path that may accept arbitrary public hosts.
- Add response filtering when a provider returns embeddings, image models, OCR models, moderation models, or other non-chat entries in the same catalog.
- If `/models` returns a broad catalog or omits a documented default alias, keep the documented fallback `models` list in `PROVIDERS` and filter the live catalog to the provider's intended capability. For example, coding-plan providers should not surface unrelated image, OCR, embedding, or generic chat entries.
- Keep frontend and backend catalog behavior equivalent; the backend service powers web mode, while the frontend helper powers Tauri mode.

Validation and persistence:

- Provider key validation is implemented in `packages/web/src/modules/setup/adapters.ts`.
- OpenAI-compatible providers should work through the existing chat/completions probe and `/models` fallback. Do not add provider-specific HTTP code unless the provider is not compatible with the common flow.
- Smoke-test the documented default model with `POST <baseUrl>/chat/completions` and, when catalog support is enabled, `GET <baseUrl>/models`. Record only status and sanitized findings in the issue or PR.
- Saved provider config should include `apiKey`, `baseUrl`, `api` when needed, and the static fallback `models` list. The Models page uses that saved list when live catalog discovery is unavailable.
- Default model refs must use the OpenClaw runtime provider id, for example `zai/glm-5.1`.

Tests required for provider PRs:

- `packages/web/src/modules/setup/__tests__/SetupWizard.test.tsx`: provider appears in the wizard and passes the expected provider id, key, and base URL into validation.
- `packages/web/src/modules/models/__tests__/ModelsPage.test.tsx`: provider appears in the add dialog and configured-provider card, including live catalog behavior when supported.
- `packages/web/src/modules/setup/__tests__/realAdapter.test.ts`: saved config shape includes the expected API mode, base URL, and fallback models.
- `packages/web/src/shared/providerCatalog.test.ts`: catalog request URL, safety checks, and response filtering.
- `packages/backend/src/services/providerCatalogService.test.ts`: matching backend catalog behavior for web mode.

Run at least:

```bash
(cd packages/web && npx vitest run src/shared/providerCatalog.test.ts src/modules/setup/__tests__/realAdapter.test.ts src/modules/setup/__tests__/SetupWizard.test.tsx src/modules/models/__tests__/ModelsPage.test.tsx)
npm test --workspace=@openclaw-manager/backend
npm run build --workspace=@openclaw-manager/web
npm run build --workspace=@openclaw-manager/backend
```

## i18n Rules (internationalization / 国际化)

All user-facing UI text **must** go through the `t()` translation function. Hard-coded strings in components are not accepted.

- Add keys to all three runtime locale files: `zh.ts`, `en.ts`, `ja.ts` in `packages/web/src/locales/main/`.
- Use nested keys that match the module structure: e.g., `observe.chart.title`.
- Chinese (`zh.ts`) is the primary language. English and Japanese translations should also be provided.

<!-- 所有界面文字必须通过 t() 函数调用，不允许硬编码字符串。新增键值需同时添加到 locales/main 下的 zh.ts、en.ts 和 ja.ts。 -->

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes:

| Prefix     | Usage                          |
|------------|--------------------------------|
| `feat:`    | New feature                    |
| `fix:`     | Bug fix                        |
| `refactor:`| Code restructuring (no behavior change) |
| `docs:`    | Documentation only             |
| `test:`    | Adding or updating tests       |
| `ci:`      | CI/CD changes                  |
| `chore:`   | Dependency updates, tooling    |

Example: `feat: add token usage chart to observe module`

## Review Process

1. All PRs require at least **one approving review** from a maintainer.
2. CI must pass (build succeeds, tests pass).
3. Reviewers may request changes -- please address feedback promptly.
4. Once approved, a maintainer will merge using **squash and merge**.

> [!NOTE]
> First-time contributors: a maintainer will add `/ok-to-test` to trigger the full CI pipeline (including multi-platform Tauri builds) after a quick review of your diff. This protects CI minutes from unknown forks.

## Testing Requirements

Every pull request must be tested before review:

- **Bug fixes** must include a regression test that would have caught the bug.
- **New features** must include unit tests covering the happy path and at least one error path.
- Run `npm test` locally before opening a PR — CI will reject PRs with failing tests.
- New code in `packages/web/src/modules/` and `shared/` targets **80% branch coverage**. Legacy pages in `packages/web/src/pages/` are excluded from this requirement.
- Place tests in co-located `__tests__/` directories following the existing pattern (see `shared/adapters/__tests__/` or `modules/setup/__tests__/`).

> [!TIP]
> `npm test && npm run build` is the minimum bar. Run both locally before pushing.
> For UI changes, also verify the affected flows with [dev-browser](https://github.com/sawyerhood/dev-browser) against `npm run dev:web`.

## What Not to Include in PRs

> [!WARNING]
> PRs containing any of the following will be asked to remove them before merge:

- **No committed screenshots or screen recordings** — UI PRs should include screenshots or short recordings in the PR body under **## Screenshots**, but those assets must not be committed to the repo.
- **No test output logs** or captured terminal output pasted inline.
- **No debug `console.log` calls** left in production code paths.
- **No generated files**: `dist/`, `coverage/`, `*.tsbuildinfo`, `src-tauri/target/`.
- **No new `Cargo.lock` entries** without prior maintainer sign-off on the new crate.

The PR description check CI step will fail if the required template sections are left empty.

## Dependency Policy

Node.js v20+ is the **only permitted runtime dependency**.

- **No Python, Ruby, shell scripts, or other runtimes** as required dependencies. OpenClaw's environment provides Node.js — nothing else is guaranteed to be present.
- **New npm packages**: open an issue first and justify the bundle impact. The Tauri desktop distributable has a size budget; heavy transitive dependencies need explicit sign-off.
- **New Rust crates** (Tauri side): require sign-off from a maintainer with desktop experience before merging.
- **Nothing that requires a separate install step** beyond `npm install` for web/backend, or the standard `cargo build` for Tauri.

> [!CAUTION]
> Adding a dependency that pulls in native binaries, Python, or a separate runtime will be rejected. When in doubt, open an issue first.

## Draft PRs

Open your PR as a **draft** if it is not yet ready for review. This avoids triggering the multi-platform Tauri build (which consumes CI minutes) and signals work-in-progress to maintainers. Mark as ready only when all local checks pass.

## Questions?

Open a [Discussion](https://github.com/openmaster-ai/clawmaster/discussions) or reach out to the OpenClaw community.

<!-- 欢迎参与贡献！如有疑问，请在 GitHub Discussions 中提问。 -->
