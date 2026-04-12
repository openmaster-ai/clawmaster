# ClawMaster

**A control plane for OpenClaw. Configure runtime, channels, skills, plugins, MCP servers, and observability from one UI.**

[中文](./README_CN.md) | [日本語](./README_JP.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)
![Build](https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main)
![Languages](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-green.svg)

ClawMaster wraps the OpenClaw ecosystem in a desktop app (Tauri) and a web console (Express + Vite). It is designed for people who want OpenClaw to be easier to install, inspect, and operate day to day without hand-editing config files for every change.

## Why ClawMaster

- **Start faster** with a guided setup flow for OpenClaw, providers, models, gateway, and channels.
- **Manage the full stack** from one place: models, agents, sessions, memory, plugins, skills, MCP, and settings.
- **Operate with visibility** through ClawProbe-backed status, token usage, context health, and cost views.
- **Run the same product in two modes**: desktop app for local operators, web mode for browser-based management.
- **Stay config-first**: ClawMaster works with OpenClaw's file-based runtime instead of introducing a separate database layer.

## What You Can Do

- **Setup and profiles**
  Detect OpenClaw, install missing pieces, create or switch profiles, and bootstrap a usable local environment.

- **Models and providers**
  Configure OpenAI-compatible and provider-specific endpoints, validate API keys, and choose defaults for runtime use.

- **Gateway and channels**
  Bring up the gateway, configure common channel integrations, and follow guided setup for platforms such as Feishu, WeChat, Discord, Slack, Telegram, and WhatsApp.

- **Plugins, skills, and MCP**
  Enable or disable installed capabilities, install curated items, add MCP servers manually, and import MCP definitions from existing tool configs.

- **Sessions, memory, and observability**
  Inspect sessions, manage memory backends, and track ClawProbe state, token usage, and estimated spend.

## Quick Start

### Option 1: Download a Desktop Build

Download the latest installer from [GitHub Releases](https://github.com/clawmaster-ai/clawmaster/releases).

Current CI packaging targets:
- Linux x64: `.deb`, `.rpm`, `.AppImage`
- macOS Intel: `.dmg`
- macOS Apple Silicon: `.dmg`
- Windows x64: `.msi`, `.exe`

For unreleased QA builds, GitHub Actions also uploads per-platform workflow artifacts.

### Option 2: Run from Source

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install

# Web app + backend
npm run dev:web

# Desktop app
npm run tauri:dev
```

### Option 3: Install the Service CLI

```bash
npm i -g clawmaster
clawmaster doctor
clawmaster serve --daemon
clawmaster status
```

Default service URL:
- `http://127.0.0.1:3001`
- `clawmaster serve` prints a service token. Enter that token in the browser UI when prompted.

Useful commands:
- `clawmaster serve --host 127.0.0.1 --port 3001`
- `clawmaster serve --host 127.0.0.1 --port 3001 --daemon`
- `clawmaster serve --host 127.0.0.1 --port 3001 --token your-own-token`
- `clawmaster status`
- `clawmaster status --token your-own-token`
- `clawmaster stop`
- `clawmaster doctor`

Production builds:

```bash
npm run build
npm run tauri:build
```

Requirements:
- Node.js 20 or newer
- Rust and platform prerequisites for Tauri desktop builds
- See [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## First Run Flow

1. Launch ClawMaster.
2. Choose an existing OpenClaw profile or create a new one.
3. Connect at least one model provider and set a default model.
4. Enable gateway or observability if you need runtime inspection.
5. Add channels, plugins, skills, or MCP servers as needed for your workflow.

## Development

```bash
npm install

# Frontend only
npm run dev

# Frontend + backend
npm run dev:web

# Backend only
npm run dev:backend

# Tauri desktop
npm run tauri:dev
```

## Testing and CI

Local verification:

```bash
npm test
npm run build
npm run test:desktop
```

`npm run test:desktop` behaves differently by platform:
- macOS: real Tauri build + launch smoke
- Linux / Windows: native desktop WebDriver smoke

What the repository CI covers:
- TypeScript check and unit tests
- Backend integration smoke checks
- Web smoke rendering
- Selected YAML UI suites
- Multi-platform desktop bundle builds

Workflows:
- [Test Suite](https://github.com/clawmaster-ai/clawmaster/actions/workflows/test.yml)
- [Desktop Bundles](https://github.com/clawmaster-ai/clawmaster/actions/workflows/build.yml)

## Project Layout

```text
clawmaster/
├── packages/web/          React + Vite frontend
├── packages/backend/      Express backend for web mode
├── src-tauri/             Tauri desktop host
├── tests/ui/              YAML-based UI test suites
└── bin/clawmaster.mjs     CLI entry point
```

Runtime model:
- **Desktop**: React calls Tauri commands
- **Web**: React calls the Express backend through `/api`

## Acknowledgments

ClawMaster builds on top of:

| Project | Role |
| --- | --- |
| [OpenClaw](https://github.com/openclaw/openclaw) | Core runtime and configuration model |
| [ClawProbe](https://github.com/openclaw/clawprobe) | Observability daemon |
| [ClawHub](https://clawhub.ai) | Skill registry |
| [PowerMem](https://github.com/openclaw/powermem) | Memory backend |
| [Tauri](https://tauri.app) | Desktop app framework |
| [React](https://react.dev) | Frontend UI |
| [Vite](https://vitejs.dev) | Frontend toolchain |
| [Playwright](https://playwright.dev) | Browser automation and smoke testing |

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a branch from `main`.
3. Make changes with tests where appropriate.
4. Run `npm test` and `npm run build`.
5. Open a pull request.

## License

MIT. See [LICENSE](./LICENSE).
