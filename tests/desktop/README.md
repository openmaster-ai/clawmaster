# Desktop Smoke Tests

This directory holds the first native desktop E2E slice for ClawMaster.

The smoke accepts the two valid desktop entry states:
- main app shell when an existing OpenClaw profile is already available
- startup fullscreen when the runtime is clean and needs install or takeover

When the main app shell is available, the native WebDriver smoke now validates:
- command palette open and page jump to Settings
- command palette section jump to `#settings-profile`
- desktop-only Local Data read-only state in Settings
- danger-zone confirmation gating in Settings
- command palette async section jump to `#capability-runtime`
- sidebar navigation from Capabilities to Gateway

The GitHub Actions workflow uploads desktop smoke artifacts on every run:
- Linux/Windows: screenshots plus metadata, and failure logs when needed
- macOS: launch logs and metadata

In CI we also seed a temporary minimal `~/.openclaw/openclaw.json`, install the `openclaw` CLI, and fall back to a local bootstrap shim when the runner's global npm layout is not directly resolvable. The harness records that bootstrap strategy in the uploaded metadata so startup failures can be traced back to environment setup versus app logic.

## Modes

- `darwin`: launch smoke in local dev and GitHub Actions
- `linux`: native WebDriver smoke through `tauri-driver`
- `win32`: native WebDriver smoke through `tauri-driver`

The macOS path is intentionally a launch smoke only. Tauri's current official WebDriver guidance covers Linux and Windows, while native macOS desktop WebDriver remains unsupported. The mac path still gives us a real Tauri build-and-launch check both on contributor machines and in GitHub Actions.

## Local run

```bash
npm run test:desktop
```

Optional overrides:

```bash
CLAWMASTER_DESKTOP_SKIP_BUILD=1 npm run test:desktop
CLAWMASTER_DESKTOP_SMOKE_MODE=launch npm run test:desktop
CLAWMASTER_DESKTOP_SMOKE_MODE=webdriver npm run test:desktop
```

## Extra prerequisites for native WebDriver mode

Linux:
- `cargo install tauri-driver --locked`
- `sudo apt-get install webkit2gtk-driver xvfb`

Windows:
- `cargo install tauri-driver --locked`
- matching `msedgedriver` on `PATH`
