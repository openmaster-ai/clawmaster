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
npm run dev:web    # Starts backend (port 3001) + frontend (port 3000)
npm test           # Run all tests
```

For desktop (Tauri) development, see the Rust/Tauri section in `CLAUDE.md`.

## Branch and PR Workflow

1. **Fork** the repository and clone your fork.
2. Create a **feature branch** from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```
3. Make your changes, commit with conventional messages (see below), and push.
4. Open a **Pull Request** against `main` in the upstream repo.
5. Fill in the PR template. Link related issues with `Closes #123`.

Keep PRs focused -- one logical change per PR.

## Code Style

- **TypeScript** with strict mode enabled. No `any` unless absolutely necessary.
- **Tailwind CSS** for all styling. No custom CSS files.
- **Lucide React** for icons. No other icon libraries.
- New features should be built as **capability modules** in `packages/web/src/modules/` (see `CLAUDE.md` for the `ClawModule` pattern).
- Use split adapters in `shared/adapters/` and the `useAdapterCall` hook for data fetching.

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

- **No screenshots or screen recordings** — post demos in [Discussions](https://github.com/openmaster-ai/clawmaster/discussions) instead.
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
