<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/openmaster-ai/brand/main/logos/clawmaster/wordmarks/dark/horizontal.png" />
    <img src="https://raw.githubusercontent.com/openmaster-ai/brand/main/logos/clawmaster/wordmarks/white/horizontal.png" width="100%" alt="ClawMaster" />
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/Web-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Web" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/openmaster-ai/brand/main/logos/clawmaster/static/amber.svg" width="28" alt="ClawMaster amber mark" />
  &nbsp;
  <img src="https://img.shields.io/badge/Brand-OpenMaster_Universe-F5A623?style=flat" alt="OpenMaster Universe Brand" />
  <img src="https://img.shields.io/badge/Product-ClawMaster-111111?style=flat" alt="ClawMaster" />
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="Quick Start" /></a>
  <a href="#roadmap"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="Roadmap" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="Contributing" /></a>
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/openmaster-ai/clawmaster/build.yml?branch=main" alt="Build" /></a>
  <a href="https://github.com/openmaster-ai/clawmaster/stargazers"><img src="https://img.shields.io/github/stars/openmaster-ai/clawmaster?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0" />
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/releases"><strong>📦 Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/discussions"><strong>💬 Discussions</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/issues"><strong>🐛 Issues</strong></a> &nbsp;·&nbsp;
  <a href="https://deepwiki.com/openmaster-ai/clawmaster"><strong>📘 Ask DeepWiki</strong></a> &nbsp;·&nbsp;
  <a href="https://discord.gg/openclaw"><strong>Discord</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  English &nbsp;·&nbsp; <a href="./README_CN.md">中文</a> &nbsp;·&nbsp; <a href="./README_JP.md">日本語</a>
</p>

## Quick Start

### Desktop App (recommended)

Download the installer for your platform from [GitHub Releases](https://github.com/openmaster-ai/clawmaster/releases):

| Platform | Format |
|---|---|
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Windows x64 | `.msi`, `.exe` |
| Linux x64 | `.deb`, `.rpm`, `.AppImage` |

Open the app — the setup wizard walks you through connecting a model provider and creating your first profile. No terminal needed.

> [!TIP]
> Every push to `main` also uploads per-platform builds as CI artifacts (kept 7 days) if you want the latest unreleased build.

### CLI

```bash
npm i -g clawmaster
clawmaster doctor            # verify your environment
clawmaster serve             # start the web console
```

Open `http://127.0.0.1:3001` in your browser and enter the token printed in the terminal.

```bash
clawmaster serve --daemon    # run in background
clawmaster stop              # stop the service
```

<details>
<summary>From source</summary>

```bash
git clone https://github.com/openmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web              # web console + backend
npm run tauri:dev            # desktop app
```

Requires Node.js 20+. Tauri desktop builds also need Rust — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/).

</details>

### After Launch

1. Pick an existing OpenClaw profile or create a new one.
2. Connect at least one model provider and set a default model.
3. Add channels, plugins, skills, or MCP servers as needed.
4. Enable gateway or observability when you need runtime inspection.

## Why ClawMaster

Most OpenClaw tooling stops at configuration. ClawMaster is your **OpenClaw companion for real life** — it goes beyond setup to help normal, non-technical users actually make practical use of OpenClaw as a digital personal assistant.

That means ClawMaster is not only for:
- editing config safely,
- connecting models and channels,
- monitoring runtime health,

but also for:
- making setup approachable,
- turning advanced agent capability into guided workflows,
- and gradually adding more guided learning and workflow support for real daily work and life goals.

**Positioning:** ClawMaster is the bridge between OpenClaw's power and everyday usability.

## ClawMaster vs. CLI Only

| | OpenClaw CLI alone | ClawMaster |
|---|---|---|
| Initial setup | Hand-edit `~/.openclaw/openclaw.json` | Guided wizard |
| Provider & model config | Edit JSON, restart | Form UI with live validation |
| Channel setup | Read docs, edit config | Step-by-step guides per platform |
| Observability | Mostly CLI and logs | ClawProbe-backed dashboard and runtime views |
| Memory management | `powermem` CLI | Management UI |
| Daily-use enablement | Mostly DIY | Product UX that is moving toward more guided use |
| Multiple profiles | Manual file juggling | Profile switcher |
| Desktop app | No | Yes — ships as `.dmg` / `.msi` / `.AppImage` |
| Self-hosted web console | No | Yes — Express, runs anywhere Node.js runs |

## Who It Is For

**"I want OpenClaw to be useful in my real life, not just correctly configured."**  
ClawMaster is designed to reduce the gap between installation and actual outcomes.

**"I'm non-technical, but I still want a powerful AI personal assistant."**  
The product is moving toward guided setup, guided usage, and outcome-oriented learning instead of assuming comfort with JSON, terminals, or infra concepts.

**"I manage OpenClaw for my team or family."**  
One place to configure channels, inspect runtime state, and make the stack easier for others to adopt.

**"I'm building advanced agent workflows."**  
You still get provider management, observability, memory tooling, sessions, plugins, skills, and MCP in one place.

## What You Can Do Today

- **Setup and profiles** — Detect OpenClaw, install missing pieces, create or switch profiles, bootstrap a local environment.
- **Models and providers** — Configure OpenAI-compatible and provider-specific endpoints, validate API keys, set runtime defaults.
- **Gateway and channels** — Bring up the gateway, follow guided setup for Feishu, WeChat, Discord, Slack, Telegram, and WhatsApp.
- **Plugins, skills, and MCP** — Enable or disable capabilities, install curated items, add MCP servers, import MCP definitions.
- **Sessions, memory, and observability** — Inspect sessions, manage memory backends, track token usage and estimated spend.

## What We Are Building Next

- **More guided onboarding and usage** — clearer paths for people who do not want to learn OpenClaw from raw config first.
- **Outcome-oriented workflows** — more guided routes for common scenarios instead of configuration surfaces alone.
- **Learning layers around the product** — including future class- or playbook-style guidance for practical use cases.

## Roadmap

Six capabilities — tracked as labeled issues:

| Capability | Status | What it covers |
|---|---|---|
| Setup | Available | Wizard, provider setup, channel setup, profile management |
| Observe | Available | ClawProbe integration and runtime inspection views |
| Save | In progress | PowerMem UI, seekdb-related flows, token-efficiency work |
| Apply | Planned | OCR and more guided applied workflows |
| Build | Planned | More builder-oriented workflows and composition tools |
| Guard | Planned | Safer operations, limits, and access controls |

Browse [`label:roadmap`](https://github.com/openmaster-ai/clawmaster/issues?q=label%3Aroadmap) to pick up an item. Leave a comment before starting so work does not overlap.

## Versioning

ClawMaster follows [Pride Versioning](https://pridever.org/) — `PROUD.DEFAULT.SHAME`:

| Segment | When to bump |
|---|---|
| **Proud** | A release you are genuinely proud of |
| **Default** | Normal, solid releases |
| **Shame** | Fixing something too embarrassing to talk about |

Pre-release tags (`-rc.N`) are used for release candidates.

## 📰 News

- **2026-04-13** 🏗️ Contribution workflow tightened with issue forms, a stronger PR template, PR description validation, and architecture boundary tests.
- **2026-04-17** ✨ Positioning refined: ClawMaster is not just an OpenClaw control plane, but a product to help everyday users fully benefit from OpenClaw as a digital personal assistant.

## Development

```bash
npm install
npm run dev:web       # frontend + backend
npm run dev           # frontend only (port 3000)
npm run dev:backend   # backend only (port 3001)
npm run tauri:dev     # desktop app
```

<details>
<summary>Testing and CI</summary>

```bash
npm test              # unit tests (Vitest)
npm run build         # type check + production build
npm run test:desktop  # desktop smoke (macOS: real Tauri build; Linux/Win: WebDriver)
```

> [!TIP]
> Run `npm test && npm run build` before opening a PR — the same steps run in CI.

CI covers core checks including TypeScript, unit tests, and desktop/web build validation.

- [Test Suite](https://github.com/openmaster-ai/clawmaster/actions/workflows/test.yml)
- [Desktop Bundles](https://github.com/openmaster-ai/clawmaster/actions/workflows/build.yml)

</details>

<details>
<summary>Project layout</summary>

```text
clawmaster/
├── packages/web/          React + Vite frontend
├── packages/backend/      Express backend for web mode
├── src-tauri/             Tauri desktop host
├── tests/ui/              YAML-based manual UI flow specs
└── bin/clawmaster.mjs     CLI entry point
```

Runtime model: Desktop uses Tauri commands; Web mode talks to an Express backend over `/api`.

</details>

## Contributing

We warmly welcome more contributions from builders, designers, technical writers, testers, and OpenClaw power users.

If you want to help ClawMaster become more useful for everyday users, please jump in — bug fixes, UX polish, docs improvements, onboarding flows, and future Master Class ideas are all valuable.

Start here:
- [AGENTS.md](./AGENTS.md) — agent-friendly contributor rules
- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup, testing, commit, and PR guidance
- [Ask DeepWiki](https://deepwiki.com/openmaster-ai/clawmaster) — explore the repo before changing code

> [!IMPORTANT]
> Run `npm test` locally before opening a PR. Please do not commit generated files or test logs. Node.js is the only permitted runtime — no new language dependencies.

Community: [GitHub Discussions](https://github.com/openmaster-ai/clawmaster/discussions) · [Discord](https://discord.gg/openclaw) · [Feishu](https://openclaw.feishu.cn/community)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=openmaster-ai/clawmaster)](https://github.com/openmaster-ai/clawmaster/graphs/contributors)

<details>
<summary>Acknowledgments</summary>

| Project | Role |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | Core runtime and configuration model |
| [ClawProbe](https://github.com/openclaw/clawprobe) | Observability daemon |
| [PowerMem](https://github.com/openclaw/powermem) | Memory backend |
| [seekdb](https://github.com/openclaw/seekdb) | Retrieval and search workflows |
| [Tauri](https://tauri.app) | Desktop app framework |
| [React](https://react.dev) | Frontend UI |
| [Vite](https://vitejs.dev) | Frontend toolchain |
| [Playwright](https://playwright.dev) | Browser automation and smoke testing |

</details>
