# ClawMaster

**The GUI for OpenClaw -- manage providers, channels, and agents from one place.**

[中文文档](./README_CN.md) | [日本語ドキュメント](./README_JP.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)
![Build](https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main)
![Languages](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-green.svg)

ClawMaster wraps the OpenClaw CLI in a desktop app (Tauri 2) or web UI (Express + Vite), giving you a setup wizard, 16 LLM provider integrations, 6 channel types, observability dashboards, and memory management -- all config-driven with no database.

## Features

- **Setup wizard** -- detect, install, and onboard OpenClaw in guided steps (API key, model, gateway, channel)
- **17 LLM providers** -- OpenAI, Anthropic, Google Gemini, xAI, Mistral, Groq, DeepSeek, MiniMax, Kimi, SiliconFlow, OpenRouter, Amazon Bedrock, Google Vertex, Azure OpenAI, Cerebras, Ollama (local inference), and custom OpenAI-compatible endpoints
- **Ollama support** -- auto-install, service management, and model pull from the GUI
- **API key validation** -- real HTTP test before saving any key
- **6 channel types** -- Discord, Slack, Telegram, Feishu, WeChat (QR scan), WhatsApp (QR scan)
- **Channel setup guides** -- step-by-step navigation paths with Feishu permissions template (26 scopes, one-click copy)
- **Observability dashboard** -- cost, token usage, and context health via ClawProbe integration
- **Session management** -- conversation history viewer with turn-by-turn breakdown
- **Skill market** -- search, install, and uninstall skills via ClawHub
- **Memory management** -- PowerMem integration for memory lifecycle
- **i18n** -- Chinese, English, Japanese (386 keys); language switcher in header and setup wizard
- **Dark mode** and color themes (Lobster Orange, Ocean Blue)
- **Responsive layout** with mobile hamburger menu
- **Desktop builds** -- Linux (deb, rpm, AppImage), macOS (dmg), Windows (msi)
- **CI/CD** -- test gate (tsc + vitest) then multi-platform Tauri build with release drafts

## Quick Start

### Download a Release

Grab the latest installer for your platform from [Releases](https://github.com/clawmaster-ai/clawmaster/releases).

### Build from Source

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install

# Web (frontend + backend)
npm run dev:web

# Desktop (Tauri)
npm run tauri:dev

# Production build
npm run build         # web
npm run tauri:build   # desktop
```

Requires Node.js 20+. Desktop builds also require Rust 1.77+ and platform-specific system libraries (see [Tauri prerequisites](https://tauri.app/start/prerequisites/)).

## Screenshots

> Coming soon.

## Architecture

```
clawmaster/
├── packages/web/          React 18 + Vite + Tailwind CSS frontend
│   └── src/
│       ├── modules/       Capability modules (setup, observe, memory)
│       ├── shared/        Adapters, hooks, components
│       ├── pages/         Legacy page components
│       └── i18n/          Translation files (zh, en, ja)
├── packages/backend/      Express API server (port 3001) + WebSocket logs
├── src-tauri/             Tauri 2 Rust backend (9 commands)
├── tests/ui/              YAML-based UI test plans
└── bin/clawmaster.mjs     CLI entry point
```

Two runtime modes:
- **Desktop**: React calls Rust via `@tauri-apps/api` invoke
- **Web**: React proxies `/api` to Express backend (Vite dev proxy 3000 -> 3001)

New features are built as capability modules in `packages/web/src/modules/` and auto-discovered via `import.meta.glob`.

## Development

```bash
npm install               # install all workspace dependencies
npm run dev               # frontend only (port 3000)
npm run dev:web           # frontend + backend together
npm run dev:backend       # Express backend only (port 3001)
npm run tauri:dev         # desktop app

npm test                  # run all tests (vitest)
npm run build             # production web build
npm run tauri:build       # production desktop build
```

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests where applicable
4. Run `npm test` and ensure TypeScript compiles cleanly
5. Open a pull request

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT -- see [LICENSE](./LICENSE).
