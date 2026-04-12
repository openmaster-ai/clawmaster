# Desktop E2E Rollout

Tracking issue: [#29](https://github.com/clawmaster-ai/clawmaster/issues/29)

## Goal

Add native desktop end-to-end coverage for ClawMaster so Linux and Windows Tauri builds are exercised in CI with real app launch, shell wiring, and high-value smoke flows, while macOS gets a real build-and-launch smoke lane.

Current slice status:

- slice 1 harness is implemented under [tests/desktop/README.md](/Users/haili/workspaces/clawmaster/tests/desktop/README.md)
- macOS contributors can run a local Tauri build-and-launch smoke via `npm run test:desktop`
- Linux and Windows CI use native WebDriver smoke
- macOS CI uses launch smoke only
- Linux and Windows native smoke now covers command palette page jump, section deep-link, and sidebar navigation
- desktop smoke artifacts are uploaded in CI for screenshots/logs
- CI seeds a temporary minimal OpenClaw profile so Linux/Windows can reach the main app shell
- CI installs the `openclaw` CLI before desktop smoke
- the harness can self-bootstrap an `openclaw` shim and records runtime diagnostics when startup falls back to setup

## Principles

- Keep browser-mode `dev-browser` YAML verification as the release-day exploratory path.
- Add a small native desktop smoke suite first, then grow coverage only where desktop-specific regressions are likely.
- Prefer stable user journeys over exhaustive click coverage.
- Treat macOS native WebDriver coverage as a later follow-up.

## Planned slices

### Slice 1: Harness

- add a `tauri-driver`-based launch path for native desktop tests
- document local prerequisites and how to run the suite
- prove app boot and shell hydration on Linux and Windows

### Slice 2: Core navigation

- verify sidebar navigation across a few representative modules
- verify command palette open, search, and route jump
- verify one hash-section jump on an async page

Status:

- implemented in `tests/desktop/harness.mjs` for Linux and Windows WebDriver smoke

### Slice 3: Desktop-only confidence

- verify Settings renders desktop diagnostics and runtime/local-data state
- verify one destructive flow remains gated by confirmation
- harden CI retries/timeouts and capture screenshots on failure

Status:

- partially implemented in `tests/desktop/harness.mjs` and `.github/workflows/desktop-e2e.yml`
- Settings desktop Local Data read-only state is asserted
- Danger Zone confirmation dialog is asserted
- CI now uploads desktop smoke screenshots/logs as artifacts

## Suggested test matrix

| Platform | Coverage |
| --- | --- |
| Linux x64 | required |
| Windows x64 | required |
| macOS | required launch smoke |

## Exit criteria

- Linux and Windows native desktop smoke tests run in CI
- macOS build-and-launch smoke runs in CI
- failures produce enough logs/screenshots to debug quickly
- contributor docs explain when to use native desktop E2E vs `dev-browser`
