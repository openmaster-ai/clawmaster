# 🦐 龙虾管家 (OpenClaw Manager)

[English](./README.md)

[OpenClaw](https://github.com/openclaw/openclaw) 的跨平台图形化管理工具，新手友好！

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

## ✨ 功能特性

- **🖥️ 仪表盘** - 实时查看 Gateway 状态、已连接通道、活跃代理
- **🔌 网关管理** - 启动、停止、重启、配置 OpenClaw Gateway
- **📡 通道配置** - 管理 Telegram、Discord、飞书、WhatsApp 等
- **🤖 模型设置** - 配置 API Key、默认模型、备选链
- **🧩 技能管理** - 浏览、安装、更新、卸载 ClawHub 技能
- **👥 代理管理** - 创建和管理多个 OpenClaw Agent
- **⚙️ 配置编辑** - 可视化编辑器 + JSON 编辑器
- **📖 文档中心** - 离线可用的 OpenClaw 文档
- **📋 日志查看** - 实时日志监控，支持搜索和导出

## 🛠️ 技术栈

- **框架**: [Tauri 2.x](https://tauri.app/) + [React 18](https://react.dev/)
- **语言**: TypeScript
- **UI**: [Shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **状态**: [Zustand](https://zustand-demo.pmnd.rs/)
- **双模式**: 桌面端 (Tauri) + Web 端 (Vite + Node.js 后端)

## 📦 安装

### 下载安装包（推荐）

从 [Releases](https://github.com/stliuexp/openclawmaneger/releases) 页面下载适合你系统的最新版本。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/stliuexp/openclawmaneger.git
cd openclawmaneger

# 安装依赖
pnpm install

# Web 开发模式
pnpm dev:web

# 桌面端开发模式
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

## 🚀 快速开始

1. **启动应用** - 龙虾管家会自动检测你已安装的 OpenClaw
2. **查看状态** - 在仪表盘查看 Gateway 和通道状态
3. **配置** - 根据需要设置通道、模型和技能
4. **管理** - 使用侧边栏导航各个管理模块

## 📸 截图

> 截图即将上线！

## 🤝 参与贡献

欢迎提交 Pull Request！

## 📄 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 本应用所管理的 AI 代理框架
- [Tauri](https://tauri.app/) - 轻量级桌面框架
- [Shadcn/ui](https://ui.shadcn.com/) - 精美的 UI 组件库

---

由 OpenClaw 社区用 ❤️ 制作
