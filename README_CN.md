# 龙虾管理大师 (ClawMaster)

**OpenClaw 生态的图形化管理工具 -- 在一个界面中管理供应商、频道和智能体。**

[English](./README.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)
![Build](https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main)
![Languages](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-green.svg)

龙虾管理大师将 OpenClaw CLI 封装为桌面应用（Tauri 2）或 Web 界面（Express + Vite），提供安装向导、16 个 LLM 供应商集成、6 种频道类型、可观测仪表盘和记忆管理功能。纯配置驱动，无需数据库。

## 核心功能

- **安装向导** -- 检测、安装、引导配置 OpenClaw（API Key、模型、网关、频道一步到位）
- **16 个 LLM 供应商** -- OpenAI、Anthropic、Google Gemini、xAI、Mistral、Groq、DeepSeek、MiniMax、Kimi、SiliconFlow、OpenRouter、Amazon Bedrock、Google Vertex、Azure OpenAI、Cerebras，以及自定义 OpenAI 兼容端点
- **API Key 验证** -- 保存前通过真实 HTTP 请求验证密钥有效性
- **6 种频道类型** -- Discord、Slack、Telegram、飞书、微信（扫码登录）、WhatsApp（扫码登录）
- **频道配置指南** -- 分步导航，飞书权限模板（26 个 scope 一键复制）
- **可观测仪表盘** -- 通过 ClawProbe 集成展示费用、Token 用量和上下文健康度
- **记忆管理** -- PowerMem 集成，管理记忆生命周期
- **国际化** -- 中文、英文、日文（386 个翻译键）；顶栏和安装向导均可切换语言
- **深色模式** 和颜色主题（龙虾橙、海洋蓝）
- **响应式布局**，移动端汉堡菜单
- **桌面端构建** -- Linux（deb、rpm、AppImage）、macOS（dmg）、Windows（msi）
- **CI/CD** -- 测试门禁（tsc + vitest）后执行多平台 Tauri 构建和发布

## 快速开始

### 下载安装包

从 [Releases](https://github.com/clawmaster-ai/clawmaster/releases) 页面下载适合你系统的最新版本。

### 从源码构建

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install

# Web 模式（前端 + 后端）
npm run dev:web

# 桌面模式（Tauri）
npm run tauri:dev

# 生产构建
npm run build         # web
npm run tauri:build   # 桌面端
```

需要 Node.js 20+。桌面端构建还需要 Rust 1.77+ 和平台相关的系统依赖（参见 [Tauri 前置条件](https://tauri.app/start/prerequisites/)）。

## 截图

> 即将上线。

## 架构

```
clawmaster/
├── packages/web/          React 18 + Vite + Tailwind CSS 前端
│   └── src/
│       ├── modules/       功能模块（setup、observe、memory）
│       ├── shared/        适配器、Hooks、公共组件
│       ├── pages/         旧版页面组件
│       └── i18n/          翻译文件（zh、en、ja）
├── packages/backend/      Express API 服务（端口 3001）+ WebSocket 日志
├── src-tauri/             Tauri 2 Rust 后端（9 个命令）
├── tests/ui/              YAML 格式的 UI 测试计划
└── bin/clawmaster.mjs     CLI 入口
```

两种运行模式：
- **桌面端**：React 通过 `@tauri-apps/api` 的 invoke 调用 Rust 命令
- **Web 端**：React 将 `/api` 请求代理到 Express 后端（Vite 开发代理 3000 -> 3001）

新功能以功能模块形式构建在 `packages/web/src/modules/` 下，通过 `import.meta.glob` 自动发现。

## 开发

```bash
npm install               # 安装所有工作区依赖
npm run dev               # 仅前端（端口 3000）
npm run dev:web           # 前端 + 后端
npm run dev:backend       # 仅 Express 后端（端口 3001）
npm run tauri:dev         # 桌面应用

npm test                  # 运行所有测试（vitest）
npm run build             # Web 生产构建
npm run tauri:build       # 桌面端生产构建
```

## 参与贡献

欢迎贡献代码。请：

1. Fork 本仓库
2. 从 `main` 创建功能分支
3. 修改代码并补充测试
4. 运行 `npm test`，确保 TypeScript 编译通过
5. 提交 Pull Request

版本历史请查看 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

MIT -- 详见 [LICENSE](./LICENSE)。
