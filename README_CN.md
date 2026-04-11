# ClawMaster / 龙虾管理大师

**OpenClaw 的统一控制台。在一个界面里管理运行时、频道、技能、插件、MCP 与可观测性。**

[English](./README.md) | [日本語](./README_JP.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey.svg)
![Build](https://img.shields.io/github/actions/workflow/status/clawmaster-ai/clawmaster/build.yml?branch=main)
![Languages](https://img.shields.io/badge/i18n-中文%20%7C%20English%20%7C%20日本語-green.svg)

ClawMaster 将 OpenClaw 生态封装为桌面应用（Tauri）和 Web 控制台（Express + Vite）。它面向希望更轻松安装、配置、观察、运维 OpenClaw 的用户，不必为每次变更都手工编辑配置文件。

## 为什么使用 ClawMaster

- **更快启动**：通过向导完成 OpenClaw、供应商、模型、网关和频道的初始化。
- **统一管理**：模型、智能体、会话、记忆、插件、技能、MCP、设置都在同一个界面内。
- **运行可见**：基于 ClawProbe 展示状态、Token 用量、上下文健康度和费用信息。
- **双运行模式**：既可以作为本地桌面应用使用，也可以用浏览器访问 Web 控制台。
- **配置优先**：围绕 OpenClaw 的文件配置工作，不额外引入数据库层。

## 可以完成什么

- **安装与 Profile 管理**
  检测 OpenClaw、安装缺失组件、创建或切换 Profile，并快速引导到可用状态。

- **模型与供应商配置**
  配置 OpenAI 兼容或各家专有端点，校验 API Key，并设置默认模型。

- **网关与频道**
  启动网关，配置常见频道，并跟随飞书、微信、Discord、Slack、Telegram、WhatsApp 等平台的向导完成接入。

- **插件、技能与 MCP**
  启用或禁用已安装能力，安装精选项目，手动添加 MCP 服务，并从已有工具配置中导入 MCP 定义。

- **会话、记忆与可观测**
  查看会话、管理记忆后端，并追踪 ClawProbe 状态、Token 使用量和费用估算。

## 快速开始

### 方式一：下载桌面安装包

从 [GitHub Releases](https://github.com/clawmaster-ai/clawmaster/releases) 下载对应平台的安装包。

当前 CI 构建目标：
- Linux x64：`.deb`、`.rpm`、`.AppImage`
- macOS Intel：`.dmg`
- macOS Apple Silicon：`.dmg`
- Windows x64：`.msi`、`.exe`

对于未发布的 QA 构建，也可以在 GitHub Actions 中下载各平台 workflow artifacts。

### 方式二：从源码运行

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install

# Web 控制台 + 后端
npm run dev:web

# 桌面应用
npm run tauri:dev
```

### 方式三：安装服务 CLI

```bash
npm i -g clawmaster
clawmaster doctor
clawmaster serve --daemon
clawmaster status
```

默认服务地址：
- `http://127.0.0.1:3001`
- `clawmaster serve` 会打印一枚服务令牌，浏览器访问 UI 时按提示输入即可。

常用命令：
- `clawmaster serve --host 127.0.0.1 --port 3001`
- `clawmaster serve --host 127.0.0.1 --port 3001 --daemon`
- `clawmaster serve --host 127.0.0.1 --port 3001 --token your-own-token`
- `clawmaster status`
- `clawmaster status --token your-own-token`
- `clawmaster stop`
- `clawmaster doctor`

生产构建：

```bash
npm run build
npm run tauri:build
```

依赖要求：
- Node.js 20 或更高版本
- 如需构建桌面端，还需要 Rust 与对应平台的 Tauri 前置依赖
- 参考 [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## 首次使用流程

1. 启动 ClawMaster。
2. 选择已有的 OpenClaw Profile，或新建一个。
3. 至少接入一个模型供应商，并设置默认模型。
4. 如果需要运行时观测，启用网关或可观测模块。
5. 按你的工作流继续添加频道、插件、技能或 MCP 服务。

## 开发

```bash
npm install

# 仅前端
npm run dev

# 前端 + 后端
npm run dev:web

# 仅后端
npm run dev:backend

# Tauri 桌面应用
npm run tauri:dev
```

## 测试与 CI

本地验证：

```bash
npm test
npm run build
```

仓库 CI 当前覆盖：
- TypeScript 检查与单元测试
- 后端接口集成冒烟检查
- Web 页面渲染冒烟
- 部分 YAML UI 测试套件
- 多平台桌面安装包构建

工作流：
- [Test Suite](https://github.com/clawmaster-ai/clawmaster/actions/workflows/test.yml)
- [Desktop Bundles](https://github.com/clawmaster-ai/clawmaster/actions/workflows/build.yml)

## 项目结构

```text
clawmaster/
├── packages/web/          React + Vite 前端
├── packages/backend/      Web 模式下的 Express 后端
├── src-tauri/             Tauri 桌面宿主
├── tests/ui/              YAML UI 测试套件
└── bin/clawmaster.mjs     CLI 入口
```

运行模型：
- **Desktop**：React 调用 Tauri commands
- **Web**：React 通过 `/api` 调用 Express 后端

## 致谢

ClawMaster 构建于以下项目之上：

| 项目 | 作用 |
| --- | --- |
| [OpenClaw](https://github.com/openclaw/openclaw) | 核心运行时与配置模型 |
| [ClawProbe](https://github.com/openclaw/clawprobe) | 可观测守护进程 |
| [ClawHub](https://clawhub.ai) | 技能注册中心 |
| [PowerMem](https://github.com/openclaw/powermem) | 记忆后端 |
| [Tauri](https://tauri.app) | 桌面应用框架 |
| [React](https://react.dev) | 前端 UI |
| [Vite](https://vitejs.dev) | 前端工具链 |
| [Playwright](https://playwright.dev) | 浏览器自动化与冒烟测试 |

## 贡献

欢迎贡献。

1. Fork 仓库。
2. 从 `main` 创建分支。
3. 修改代码，并在适用时补充测试。
4. 运行 `npm test` 与 `npm run build`。
5. 提交 Pull Request。

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
