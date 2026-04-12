# Desktop Smoke Tests

This directory holds the first native desktop E2E slice for ClawMaster.

The smoke accepts the two valid desktop entry states:
- main app shell when an existing OpenClaw profile is already available
- startup fullscreen when the runtime is clean and needs install or takeover

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
