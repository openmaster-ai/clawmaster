# 🦞 ClawMaster

[中文](./README_CN.md) | [Product Vision](./VISION.md)

> **ClawMaster — The Hexagonal Champion of the OpenClaw Ecosystem: Takeover, Observe, Save, Apply, Build, Guard.**

ClawMaster is a one-stop intelligent management platform for the OpenClaw ecosystem, collaboratively built by the open-source community, delivering six core capabilities to every user: Takeover, Observe, Save, Apply, Build, and Guard.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

---

## 🦞 Six Core Capabilities

| Capability | One-liner | Problem Solved |
|------------|-----------|----------------|
| **Takeover** | Install, manage, everything starts here | High installation barrier, complex configuration |
| **Observe** | How much spent, how it runs, crystal clear | Token/cost/health are all black boxes |
| **Save** | PowerMem + seekdb, 96% token reduction | Token burn rate out of control |
| **Apply** | Photo Q&A, mistake notebook, invoice organizer — ready to use | "I installed it... now what?" |
| **Build** | Chat with the butler, agents build themselves | Traditional dev too hard for normal users |
| **Guard** | Encrypted keys, spending circuit breaker, access control | API keys exposed, spending unprotected |

> See [VISION.md](./VISION.md) for the full product positioning.

---

## 🤝 Four Ecosystem Pillars

| Partner | Role | Capabilities |
|---------|------|-------------|
| **OceanBase** | Data Layer | seekdb AI-native database, PowerMem memory engine |
| **Baidu** | Model Layer | PaddleOCR and foundational models for inference |
| **LangChain Community** | Orchestration Layer | DeepAgents, LangGraph workflows, LangSmith observability |
| **Computing Cube** | Hardware Layer | Open-source hardware standard with built-in ClawMaster |

---

## 🛠️ Tech Stack

- **Desktop Framework**: [Tauri 2.x](https://tauri.app/) + [React 18](https://react.dev/)
- **Language**: TypeScript + Rust
- **UI**: [Shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Dual Mode**: Desktop (Tauri) + Web (Vite + Node.js backend)
- **Data Layer**: [seekdb](https://github.com/oceanbase/seekdb) + [PowerMem](https://github.com/oceanbase/powermem)
- **Agent Framework**: [LangChain DeepAgents](https://docs.langchain.com/oss/python/deepagents/overview) + [LangGraph](https://github.com/langchain-ai/langgraph)
- **OCR**: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)

---

## 📦 Installation

### Download Release (Recommended)

Download the latest release for your platform from the [Releases](https://github.com/stliuexp/openclawmaneger/releases) page.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/stliuexp/openclawmaneger.git
cd openclawmaneger

# Install dependencies
pnpm install

# Run in development mode (Web)
pnpm dev:web

# Run in development mode (Desktop)
pnpm tauri dev

# Build for production
pnpm tauri build
```

---

## 🚀 Quick Start

1. **Launch the app** — ClawMaster automatically detects your OpenClaw environment
2. **Takeover or install** — Existing installation? One-click takeover. Fresh start? Guided installation
3. **Start using** — Dashboard for status overview, built-in skills ready out of the box
4. **Go deeper** — Cost tracking, memory management, agent building — six capabilities at your fingertips

---

## 📸 Screenshots

> Screenshots coming soon!

---

## 🤝 Contributing

ClawMaster is a community-driven open-source project. All contributors are welcome:

- Submit Issues and Pull Requests
- Develop built-in skills and application scenarios
- Adapt to more hardware platforms
- Improve documentation and internationalization

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [OpenClaw](https://github.com/nicepkg/openclaw) — The open-source agent framework this project serves
- [OceanBase](https://github.com/oceanbase) — seekdb + PowerMem data layer support
- [Baidu PaddlePaddle](https://github.com/PaddlePaddle) — PaddleOCR model support
- [LangChain](https://github.com/langchain-ai) — DeepAgents + LangGraph orchestration support
- [Tauri](https://tauri.app/) — Lightweight desktop framework
- [Shadcn/ui](https://ui.shadcn.com/) — Beautiful UI components

---

Built with 🦞 by the OpenClaw open-source community
