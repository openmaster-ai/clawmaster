<!-- Hero image / demo GIF: replace comment with actual asset when available
<p align="center">
  <img src="docs/hero.gif" width="800" alt="ClawMaster demo" />
</p>
-->

<h1 align="center">
  <code>clawmaster</code> · OpenClaw 控制台
</h1>

<p align="center">
  <strong>桌面应用 · Web 控制台 · 服务 CLI — 三种运行 OpenClaw 的方式，无需手动编辑配置文件。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black" alt="Linux" />
  <img src="https://img.shields.io/badge/Web-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Web" />
</p>

<p align="center">
  <a href="#快速开始"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="快速开始" /></a>
  <a href="#路线图"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="路线图" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="贡献指南" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="许可证" /></a>
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
  <a href="./README.md">English</a> &nbsp;·&nbsp; 中文 &nbsp;·&nbsp; <a href="./README_JP.md">日本語</a>
</p>

## ClawMaster vs. 纯 CLI

| | 仅 OpenClaw CLI | ClawMaster |
|---|---|---|
| 初始安装 | 手动编辑 `~/.openclaw/openclaw.json` | 向导引导完成 |
| 供应商与模型配置 | 编辑 JSON，重启 | 表单 UI，实时校验 |
| 频道接入 | 查阅文档，手动配置 | 各平台逐步引导 |
| 可观测性 | 无内置支持 | ClawProbe 面板（费用 / Token / 健康度） |
| 记忆管理 | `powermem` CLI | 管理 UI（PowerMem） |
| 多 Profile | 手动管理文件 | Profile 切换器 |
| 桌面应用 | 无 | 有 — 提供 `.dmg` / `.msi` / `.AppImage` |
| 自托管 Web 控制台 | 无 | 有 — Express，任何 Node.js 环境均可运行 |

## 适用人群

**「我在帮团队管理 OpenClaw。」**
一个地方完成频道配置、API Key 轮换和 Token 用量监控，无需 SSH，无需编辑 JSON。

**「我在用 LangChain 构建智能体。」**
无需编写监控代码，即可快速查看上下文用量、记忆快照和单次会话费用。

**「我是第一次安装 OpenClaw。」**
安装向导将带你一步完成供应商、模型、网关和频道的配置，无需阅读文档即可达到可用状态。

## 功能概览

- **安装与 Profile** — 检测 OpenClaw、安装缺失组件、创建或切换 Profile，快速引导到可用环境。
- **模型与供应商** — 配置 OpenAI 兼容或各家专有端点，校验 API Key，设置默认模型。
- **网关与频道** — 启动网关，跟随飞书、微信、Discord、Slack、Telegram、WhatsApp 的逐步接入向导。
- **插件、技能与 MCP** — 启用 / 禁用能力，安装精选项目，添加 MCP 服务，导入 MCP 定义。
- **会话、记忆与可观测** — 查看会话，管理记忆后端，追踪 Token 用量和费用估算。

## 快速开始

<details>
<summary>方式一：下载桌面安装包</summary>

从 [GitHub Releases](https://github.com/clawmaster-ai/clawmaster/releases) 下载对应平台安装包。

| 平台 | 格式 |
|---|---|
| Linux x64 | `.deb`、`.rpm`、`.AppImage` |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` |
| Windows x64 | `.msi`、`.exe` |

> [!NOTE]
> 每次推送 `main` 分支，CI 也会上传各平台 artifacts（保留 7 天），如需获取未正式发布的构建可前往 Actions 下载。

</details>

<details>
<summary>方式二：从源码运行</summary>

```bash
git clone https://github.com/clawmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web     # Web 控制台 + 后端
npm run tauri:dev   # 桌面应用
```

依赖：Node.js 20+。构建桌面端还需 Rust，参考 [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)。

</details>

<details>
<summary>方式三：服务 CLI</summary>

```bash
npm i -g clawmaster
clawmaster doctor
clawmaster serve --daemon
clawmaster status
```

默认服务地址：`http://127.0.0.1:3001`。`clawmaster serve` 会打印服务令牌，在浏览器 UI 提示时输入即可。

常用参数：

```bash
clawmaster serve --host 127.0.0.1 --port 3001 --daemon
clawmaster serve --host 127.0.0.1 --port 3001 --token your-own-token
clawmaster stop
clawmaster doctor
```

</details>

## 首次使用

1. 启动 ClawMaster。
2. 选择已有的 OpenClaw Profile，或新建一个。
3. 至少接入一个模型供应商并设置默认模型。
4. 如需运行时观测，启用网关或可观测模块。
5. 按需添加频道、插件、技能或 MCP 服务。

## 路线图

六大核心能力 — 通过 issue 标签追踪进度：

| 能力 | 状态 | 覆盖范围 |
|---|---|---|
| 接管 | 已发布 | 向导、16 个供应商、6 种频道类型、Profile 管理 |
| 可观测 | 已发布 | ClawProbe 集成、费用 / Token / 健康度面板 |
| 省钱 | 进行中 | PowerMem UI、seekdb 集成、降 Token 工作流 |
| 应用 | 规划中 | 拍照答题、发票整理、错题本工具 |
| 构建 | 规划中 | 对话式智能体构建器（LangChain DeepAgents） |
| 守护 | 规划中 | 密钥加密、花费熔断、权限管控（RBAC） |

浏览 [`label:roadmap`](https://github.com/clawmaster-ai/clawmaster/issues?q=label%3Aroadmap) 领取任务。开始前请先在对应 issue 留言 — 完成路线图功能的核心贡献者可向 OpenClaw 团队申领模型额度。

## 📰 动态

- **2026-04-13** 🏗️ 贡献流程升级：issue 表单、更严格的 PR 模板、PR 描述自动校验，以及架构边界测试。

<!-- 有重要用户可见更新时在此补充条目。 -->

## 开发

```bash
npm install
npm run dev:web       # 前端 + 后端
npm run dev           # 仅前端（端口 3000）
npm run dev:backend   # 仅后端（端口 3001）
npm run tauri:dev     # 桌面应用
```

<details>
<summary>测试与 CI</summary>

```bash
npm test              # 单元测试（Vitest）
npm run build         # 类型检查 + 生产构建
npm run test:desktop  # 桌面冒烟（macOS：真实 Tauri 构建；Linux/Win：WebDriver）
```

> [!TIP]
> 提 PR 前请先跑 `npm test && npm run build`，与 CI 流程保持一致。

CI 覆盖：TypeScript 检查、单元测试、后端接口冒烟、Web 冒烟、桌面冒烟及多平台 Tauri 构建。

</details>

<details>
<summary>项目结构</summary>

```text
clawmaster/
├── packages/web/          React + Vite 前端
├── packages/backend/      Web 模式 Express 后端
├── src-tauri/             Tauri 桌面宿主
├── tests/ui/              YAML 手动 UI 流程规约
└── bin/clawmaster.mjs     CLI 入口
```

运行模型：Desktop — React 通过 `invoke()` 调用 Tauri 命令；Web — React 通过 `/api` 代理到 Express。

</details>

## 贡献

**使用 AI 编程助手？** 请先阅读 [AGENTS.md](./AGENTS.md) — 它以机器可读的格式覆盖了完整的贡献流程、模块模式和硬性规则。

详细说明请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)：环境搭建、测试要求、依赖策略、提交规范与 PR 检查清单。

> [!IMPORTANT]
> 提 PR 前必须在本地通过 `npm test`。禁止在提交中包含截图、测试日志或生成文件。Node.js 是唯一允许的运行时。

社区：[GitHub Discussions](https://github.com/clawmaster-ai/clawmaster/discussions) · [Discord](https://discord.gg/openclaw) · [飞书社区](https://openclaw.feishu.cn/community)

## 贡献者

[![Contributors](https://contrib.rocks/image?repo=clawmaster-ai/clawmaster)](https://github.com/clawmaster-ai/clawmaster/graphs/contributors)

---

<!-- Repobeats activity widget — configure at repobeats.axiom.co then uncomment:
[![Repobeats analytics image](https://repobeats.axiom.co/api/embed/HASH.svg "Repobeats analytics image")](https://repobeats.axiom.co)
-->

<details>
<summary>致谢</summary>

| 项目 | 作用 |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | 核心运行时与配置模型 |
| [ClawProbe](https://github.com/openclaw/clawprobe) | 可观测守护进程 |
| [ClawHub](https://clawhub.ai) | 技能注册中心 |
| [PowerMem](https://github.com/openclaw/powermem) | 记忆后端 |
| [Tauri](https://tauri.app) | 桌面应用框架 |
| [React](https://react.dev) | 前端 UI |
| [Vite](https://vitejs.dev) | 前端工具链 |
| [Playwright](https://playwright.dev) | 浏览器自动化与冒烟测试 |

</details>

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
