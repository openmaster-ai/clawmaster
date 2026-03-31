# 🦐 OpenClaw Manager

[中文](./README_CN.md)

A cross-platform desktop GUI for managing [OpenClaw](https://github.com/openclaw/openclaw) with ease. Perfect for beginners!

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

## ✨ Features

- **🖥️ Dashboard** - Real-time overview of Gateway status, connected channels, and active agents
- **🔌 Gateway Management** - Start, stop, restart, and configure the OpenClaw Gateway
- **📡 Channel Configuration** - Manage Telegram, Discord, Feishu, WhatsApp, and more
- **🤖 Model Settings** - Configure API keys, default models, and fallback chains
- **🧩 Skills Management** - Browse, install, update, and uninstall skills from ClawHub
- **👥 Agents Management** - Create and manage multiple OpenClaw agents
- **⚙️ Config Editor** - Visual and JSON configuration editors
- **📖 Documentation Center** - Offline-accessible OpenClaw docs
- **📋 Logs Viewer** - Real-time log monitoring with search and export

## 🛠️ Tech Stack

- **Framework**: [Tauri 2.x](https://tauri.app/) + [React 18](https://react.dev/)
- **Language**: TypeScript
- **UI**: [Shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Dual Mode**: Desktop (Tauri) + Web (Vite + Node.js backend)

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

## 🚀 Quick Start

1. **Launch the app** - OpenClaw Manager will automatically detect your existing OpenClaw installation
2. **Review status** - Check the Dashboard for Gateway and channel status
3. **Configure** - Set up your channels, models, and skills as needed
4. **Manage** - Use the sidebar to navigate different management sections

## 📸 Screenshots

> Screenshots coming soon!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenClaw](https://github.com/openclaw/openclaw) - The AI agent framework this app manages
- [Tauri](https://tauri.app/) - For the lightweight desktop framework
- [Shadcn/ui](https://ui.shadcn.com/) - For the beautiful UI components

---

Made with ❤️ by the OpenClaw community
