# Desktop E2E Rollout

Tracking issue: [#29](https://github.com/clawmaster-ai/clawmaster/issues/29)

## Goal

Add native desktop end-to-end coverage for ClawMaster so Linux and Windows Tauri builds are exercised in CI with real app launch, shell wiring, and high-value smoke flows.

## Principles

- Keep browser-mode `dev-browser` YAML verification as the release-day exploratory path.
- Add a small native desktop smoke suite first, then grow coverage only where desktop-specific regressions are likely.
- Prefer stable user journeys over exhaustive click coverage.
- Treat macOS native desktop E2E as a later follow-up.

## Planned slices

### Slice 1: Harness

- add a `tauri-driver`-based launch path for native desktop tests
- document local prerequisites and how to run the suite
- prove app boot and shell hydration on Linux and Windows

### Slice 2: Core navigation

- verify sidebar navigation across a few representative modules
- verify command palette open, search, and route jump
- verify one hash-section jump on an async page

### Slice 3: Desktop-only confidence

- verify Settings renders desktop diagnostics and runtime/local-data state
- verify one destructive flow remains gated by confirmation
- harden CI retries/timeouts and capture screenshots on failure

## Suggested test matrix

| Platform | Coverage |
| --- | --- |
| Linux x64 | required |
| Windows x64 | required |
| macOS | deferred |

## Exit criteria

- Linux and Windows native desktop smoke tests run in CI
- failures produce enough logs/screenshots to debug quickly
- contributor docs explain when to use native desktop E2E vs `dev-browser`
