<!-- Hero image / demo GIF: replace comment with actual asset when available
<p align="center">
  <img src="docs/hero.gif" width="800" alt="ClawMaster demo" />
</p>
-->

<h1 align="center">
  <code>clawmaster</code> · OpenClaw Control Plane
</h1>

<p align="center">
  <strong>Desktop app · Web console · Service CLI — three ways to run OpenClaw without editing config files.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/Web-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Web" />
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="Quick Start" /></a>
  <a href="#roadmap"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="Roadmap" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="Contributing" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <a href="https://github.com/clawmaster-ai/clawmaster/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main" alt="Build" /></a>
  <img src="https://img.shields.io/badge/version-0.3.0-blue" alt="Version" />
  <a href="https://github.com/clawmaster-ai/clawmaster/stargazers"><img src="https://img.shields.io/github/stars/clawmaster-ai/clawmaster?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/tests-74_passing-brightgreen" alt="Tests" />
</p>

<!-- Recognition badges — uncomment once listed:
<p align="center">
  <a href="https://hellogithub.com/repository/FILL_IN"><img src="https://img.shields.io/badge/HelloGitHub-%E6%94%B6%E5%BD%95-red.svg" alt="HelloGitHub" /></a>
  <a href="https://www.producthunt.com/posts/FILL_IN"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=FILL_IN&theme=light" alt="Product Hunt" height="28" /></a>
</p>
-->

<p align="center">
  <a href="https://github.com/clawmaster-ai/clawmaster/releases"><strong>📦 Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/clawmaster-ai/clawmaster/discussions"><strong>💬 Discussions</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/clawmaster-ai/clawmaster/issues"><strong>🐛 Issues</strong></a> &nbsp;·&nbsp;
  <a href="https://discord.gg/openclaw"><strong>Discord</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  English &nbsp;·&nbsp; <a href="./README_CN.md">中文</a> &nbsp;·&nbsp; <a href="./README_JP.md">日本語</a>
</p>

## ClawMaster vs. CLI Only

| | OpenClaw CLI alone | ClawMaster |
|---|---|---|
| Initial setup | Hand-edit `~/.openclaw/openclaw.json` | Guided wizard |
| Provider & model config | Edit JSON, restart | Form UI with live validation |
| Channel setup | Read docs, edit config | Step-by-step guides per platform |
| Observability | None built-in | ClawProbe dashboard (cost, tokens, health) |
| Memory management | `powermem` CLI | Management UI |
| Multiple profiles | Manual file juggling | Profile switcher |
| Desktop app | No | Yes — ships as `.dmg` / `.msi` / `.AppImage` |
| Self-hosted web console | No | Yes — Express, runs anywhere Node.js runs |

## Who It Is For

**"I manage OpenClaw for my team."**
One place to configure channels, rotate API keys, and monitor token spend — no SSH, no JSON editing.

**"I'm building agents with LangChain."**
Quick observability into context usage, memory snapshots, and cost-per-session without writing monitoring code.

**"I'm setting up OpenClaw for the first time."**
The setup wizard walks you through provider, model, gateway, and channel in one flow. No docs required to reach a working state.

## What You Can Do

- **Setup and profiles** — Detect OpenClaw, install missing pieces, create or switch profiles, bootstrap a local environment.
- **Models and providers** — Configure OpenAI-compatible and provider-specific endpoints, validate API keys, set runtime defaults.
- **Gateway and channels** — Bring up the gateway, follow guided setup for Feishu, WeChat, Discord, Slack, Telegram, and WhatsApp.
- **Plugins, skills, and MCP** — Enable or disable capabilities, install curated items, add MCP servers, import MCP definitions.
- **Sessions, memory, and observability** — Inspect sessions, manage memory backends, track token usage and estimated spend.

## Quick Start

<details>
<summary>Option 1: Desktop installer</summary>

Download the latest installer from [GitHub Releases](https://github.com/clawmaster-ai/clawmaster/releases).

| Platform | Format |
|---|---|
| Linux x64 | `.deb`, `.rpm`, `.AppImage` |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` |
| Windows x64 | `.msi`, `.exe` |

> [!NOTE]
> CI also uploads per-platform artifacts for every push to `main` (7-day retention) if you need an unreleased build.

</details>

<details>
<summary>Option 2: Run from source</summary>

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web

# Windows helper
npm run dev:windows

# Desktop app
npm run tauri:dev
```

Requirements: Node.js 20+. For Tauri desktop builds, also Rust — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/).

</details>

<details>
<summary>Option 3: Service CLI</summary>

```bash
npm i -g clawmaster
clawmaster doctor
clawmaster serve --daemon
clawmaster status
```

Default service URL: `http://127.0.0.1:3001`. `clawmaster serve` prints a service token — enter it in the browser UI when prompted.

Common flags:

```bash
clawmaster serve --host 127.0.0.1 --port 3001 --daemon
clawmaster serve --host 127.0.0.1 --port 3001 --token your-own-token
clawmaster stop
clawmaster doctor
```

</details>

## First Run

1. Launch ClawMaster.
2. Choose an existing OpenClaw profile or create a new one.
3. Connect at least one model provider and set a default model.
4. Enable gateway or observability if you need runtime inspection.
5. Add channels, plugins, skills, or MCP servers as needed.

## Roadmap

Six capabilities — tracked as labeled issues:

| Capability | Status | What it covers |
|---|---|---|
| Setup | Released | Wizard, 16 providers, 6 channel types, profile management |
| Observe | Released | ClawProbe integration, cost / token / health dashboard |
| Save | In progress | PowerMem UI, seekdb integration, token-reduction workflows |
| Apply | Planned | Photo OCR, invoice processing, flashcard tools |
| Build | Planned | Conversational agent builder (LangChain DeepAgents) |
| Guard | Planned | Key encryption, spend limits, RBAC |

Browse [`label:roadmap`](https://github.com/clawmaster-ai/clawmaster/issues?q=label%3Aroadmap) to pick up an item. Leave a comment before starting — core contributors who land roadmap features can claim model credits from the OpenClaw team.

## 📰 News

- **2026-04-13** 🏗️ Contribution workflow tightened with issue forms, a stronger PR template, PR description validation, and architecture boundary tests.

<!-- Add entries here as notable user-facing changes ship. -->

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

CI covers: TypeScript check, unit tests, backend integration smoke, web smoke, desktop smoke, and multi-platform Tauri builds.

- [Test Suite](https://github.com/clawmaster-ai/clawmaster/actions/workflows/test.yml)
- [Desktop Bundles](https://github.com/clawmaster-ai/clawmaster/actions/workflows/build.yml)

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

Runtime model: Desktop — React calls Tauri commands via `invoke()`; Web — React proxies `/api` to Express.

</details>

## Contributing

**Using an AI coding agent?** Point it at [AGENTS.md](./AGENTS.md) first — it covers the full contribution workflow, module patterns, and hard rules in agent-readable form.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, testing requirements, dependency policy, commit convention, and PR checklist.

> [!IMPORTANT]
> PRs must pass `npm test` locally before opening. No screenshots, test logs, or generated files in commits. Node.js is the only permitted runtime — no new language dependencies.

Community: [GitHub Discussions](https://github.com/clawmaster-ai/clawmaster/discussions) · [Discord](https://discord.gg/openclaw) · [Feishu](https://openclaw.feishu.cn/community)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=clawmaster-ai/clawmaster)](https://github.com/clawmaster-ai/clawmaster/graphs/contributors)

---

<!-- Repobeats activity widget — configure at repobeats.axiom.co then uncomment:
[![Repobeats analytics image](https://repobeats.axiom.co/api/embed/HASH.svg "Repobeats analytics image")](https://repobeats.axiom.co)
-->

<details>
<summary>Acknowledgments</summary>

| Project | Role |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | Core runtime and configuration model |
| [ClawProbe](https://github.com/openclaw/clawprobe) | Observability daemon |
| [ClawHub](https://clawhub.ai) | Skill registry |
| [PowerMem](https://github.com/openclaw/powermem) | Memory backend |
| [Tauri](https://tauri.app) | Desktop app framework |
| [React](https://react.dev) | Frontend UI |
| [Vite](https://vitejs.dev) | Frontend toolchain |
| [Playwright](https://playwright.dev) | Browser automation and smoke testing |

</details>

## License

MIT. See [LICENSE](./LICENSE).
