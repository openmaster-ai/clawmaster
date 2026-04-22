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
  <a href="#快速开始"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="Quick Start" /></a>
  <a href="#路线图"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="Roadmap" /></a>
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
  <a href="./README.md">English</a> &nbsp;·&nbsp; 中文 &nbsp;·&nbsp; <a href="./README_JP.md">日本語</a>
</p>

## 快速开始

### CLI + Web 控制台（推荐）

```bash
npm i -g clawmaster
clawmaster                   # 启动 Web 控制台
```

打开 http://localhost:16223 —— 安装向导会引导你完成 OpenClaw 引擎检测和 LLM 供应商配置，无需手动编辑配置文件。

```bash
clawmaster serve --daemon    # 后台运行
clawmaster stop              # 停止服务
clawmaster doctor            # 检查环境
```

> [!NOTE]
> 当前版本为 **v0.3.0-rc.1**（候选发布）。安装命令：`npm i -g clawmaster@rc`。

### 桌面应用（Beta 测试版）

从 [GitHub Releases](https://github.com/openmaster-ai/clawmaster/releases) 下载对应平台安装包：

| 平台 | 格式 |
|---|---|
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Windows x64 | `.msi`、`.exe` |
| Linux x64 | `.deb`、`.AppImage` |

> [!WARNING]
> 桌面版目前处于 **Beta 测试阶段**。推荐使用 CLI + Web 控制台方式，这是经过最充分测试的安装方式。

<details>
<summary>从源码运行</summary>

```bash
git clone https://github.com/openmaster-ai/clawmaster.git
cd clawmaster
npm install
npm run dev:web              # Web 控制台 + 后端
npm run tauri:dev            # 桌面应用
```

依赖：Node.js 20+。构建桌面端还需 Rust，参考 [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)。

</details>

### 启动后

1. 选择已有的 OpenClaw Profile，或新建一个。
2. 至少接入一个模型供应商并设置默认模型。
3. 按需添加频道、插件、技能或 MCP 服务。
4. 如需运行时观测，启用网关或可观测模块。

## 为什么是 ClawMaster

大多数 OpenClaw 工具，重点都停留在”把配置配对”。ClawMaster 是你**真正走进日常生活的 OpenClaw 伙伴** —— 不仅帮助用户完成配置，更重要的是帮助普通、非技术用户，开始把 OpenClaw 实际用于日常工作与生活。

这意味着 ClawMaster 不只是：
- 更安全地编辑配置，
- 更方便地连接模型和频道，
- 更直观地观察运行状态，

还要进一步做到：
- 让上手过程更友好，
- 把复杂能力包装成可理解、可执行的引导式流程，
- 逐步补充更清晰的引导、教学与工作流支持，帮助用户完成真实的工作与生活目标。

**一句话定位：** ClawMaster 是连接 OpenClaw 强大能力与日常可用性的桥梁。

## ClawMaster vs. 纯 CLI

| | 仅 OpenClaw CLI | ClawMaster |
|---|---|---|
| 初始安装 | 手动编辑 `~/.openclaw/openclaw.json` | 向导引导完成 |
| 供应商与模型配置 | 编辑 JSON，重启 | 表单 UI，实时校验 |
| 频道接入 | 查阅文档，手动配置 | 各平台逐步引导 |
| 可观测性 | 主要依赖 CLI 与日志 | 基于 ClawProbe 的面板与运行态视图 |
| 记忆管理 | `powermem` CLI | 管理 UI |
| 日常使用引导 | 主要靠自己摸索 | 正在逐步增强引导式体验 |
| 多 Profile | 手动管理文件 | Profile 切换器 |
| 桌面应用 | 无 | 有 — 提供 `.dmg` / `.msi` / `.AppImage` |
| 自托管 Web 控制台 | 无 | 有 — Express，任何 Node.js 环境均可运行 |

## 适合谁

**「我不想只是把 OpenClaw 配好，我想让它真的能帮我做事。」**  
ClawMaster 的核心目标，是缩短“安装完成”到“真实产出”之间的距离。

**「我不是技术人员，但我也想拥有强大的 AI 私人助理。」**  
产品会越来越强调引导式安装、引导式使用、结果导向学习，而不是默认用户熟悉 JSON、命令行和基础设施。

**「我在帮团队、家人或客户管理 OpenClaw。」**  
一个地方完成频道配置、运行状态查看，也让其他人更容易真正上手。

**「我也需要更专业的能力管理界面。」**  
你仍然可以获得模型管理、可观测、记忆、会话、插件、技能和 MCP 的完整能力。

## 现在已经能做什么

- **安装与 Profile** —— 检测 OpenClaw、安装缺失组件、创建或切换 Profile，快速引导到可用环境。
- **模型与供应商** —— 配置 OpenAI 兼容或各家专有端点，校验 API Key，设置默认模型。
- **网关与频道** —— 启动网关，跟随飞书、微信、Discord、Slack、Telegram、WhatsApp 的逐步接入向导。
- **插件、技能与 MCP** —— 启用 / 禁用能力，安装精选项目，添加 MCP 服务，导入 MCP 定义。
- **会话、记忆与可观测** —— 查看会话，管理记忆后端，追踪 Token 用量和费用估算。

## 路线图

六大核心能力 —— 每一项都从基础设施走向日常可用：

| # | 能力 | 状态 | 已有 | 下一步 |
|---|---|---|---|---|
| 1 | **能接管** | 可用 | 引导式向导、6+ LLM 供应商并校验 Key、6 种频道（飞书 / 微信 / Discord / Slack / Telegram / WhatsApp）、Profile 切换 | 一键环境迁移（[#1](https://github.com/openmaster-ai/clawmaster/issues/1)）、Windows + WSL2 一等支持 |
| 2 | **能观测** | 可用 | 基于 ClawProbe 的面板、按会话的费用与 Token 追踪、网关健康监控 | 历史花费分析、异常告警、多 Profile 对比 |
| 3 | **能省钱** | 进行中 | PowerMem UI + FTS5 本地搜索、记忆工作区管理、自动降级到 markdown grep | 完整 seekdb 向量检索（[#12](https://github.com/openmaster-ai/clawmaster/issues/12)）、LLM Wiki —— 持续积累的知识库（[#49](https://github.com/openmaster-ai/clawmaster/issues/49)） |
| 4 | **能应用** | 进行中 | PaddleOCR 流水线（上传 → 解析 → 结构化 Markdown）、版面感知提取 | 拍照 → 闪卡自动生成、发票提取模板、更多场景优先的引导式工作流 |
| 5 | **能构建** | 规划中 | 插件 / 技能安装与开关、MCP 服务管理、技能安全审计 | 可视化智能体编排器、LangChain Deep Agents 集成、对话式智能体构建 |
| 6 | **能守护** | 规划中 | Skill Guard 安全扫描（维度 / 严重性 / 风险评分）、基础能力门控 | API Key 加密保险箱、按 Profile 的花费上限、团队部署 RBAC |

浏览 [`label:roadmap`](https://github.com/openmaster-ai/clawmaster/issues?q=label%3Aroadmap) 领取任务。开始前请先在对应 issue 留言，避免重复工作。

## 版本策略

ClawMaster 采用 [Pride Versioning](https://pridever.org/)（自豪版本号）—— `PROUD.DEFAULT.SHAME`：

| 位 | 何时递增 |
|---|---|
| **Proud** | 你真心引以为豪的发布 |
| **Default** | 正常、稳定的发布 |
| **Shame** | 修复了不好意思说出口的问题 |

预发布使用 `-rc.N` 标签。

## 📰 动态

- **2026-04-22** 🚀 v0.3.0-rc.1 —— 首个候选发布。两步式安装向导、PaddleOCR 文档解析、文心大模型图像生成、费用可观测、定时任务管理。CLI 为推荐安装方式，桌面版为 Beta。
- **2026-04-17** ✨ 品牌与定位正式发布 —— ClawMaster 定位为真正走进日常生活的 OpenClaw 伙伴，而非单纯的控制台。全新 Wordmark、Apache 2.0 许可、Pride Versioning。

## 开发

```bash
npm install
npm run dev:web       # 前端 + 后端
npm run dev           # 仅前端（端口 16223）
npm run dev:backend   # 仅后端（端口 16224）
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

CI 覆盖核心检查，包括 TypeScript 检查、单元测试以及桌面 / Web 构建验证。

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

运行模型：Desktop — React 通过 Tauri 命令调用；Web — React 通过 `/api` 代理到 Express。

</details>

## 贡献

我们非常欢迎更多贡献者加入，包括开发者、设计师、技术写作者、测试人员，以及真正使用 OpenClaw 的深度用户。

如果你愿意帮助 ClawMaster 变得对普通用户更有用，欢迎直接参与 —— 无论是修 bug、打磨体验、完善文档、优化引导流程，还是补充未来“大师课”方向，都会非常有价值。

建议从这里开始：
- [AGENTS.md](./AGENTS.md) —— 面向 AI / Agent 的贡献规则
- [CONTRIBUTING.md](./CONTRIBUTING.md) —— 环境、测试、提交和 PR 指南
- [Ask DeepWiki](https://deepwiki.com/openmaster-ai/clawmaster) —— 改代码前先快速了解仓库

> [!IMPORTANT]
> 提 PR 前请先在本地运行 `npm test`。请不要提交生成文件或测试日志。Node.js 是唯一允许的运行时，禁止引入新的语言依赖。

社区：[GitHub Discussions](https://github.com/openmaster-ai/clawmaster/discussions) · [Discord](https://discord.gg/openclaw) · [飞书社区](https://openclaw.feishu.cn/community)

## 贡献者

[![Contributors](https://contrib.rocks/image?repo=openmaster-ai/clawmaster)](https://github.com/openmaster-ai/clawmaster/graphs/contributors)

<details>
<summary>致谢</summary>

| 项目 | 作用 |
|---|---|
| [OpenClaw](https://github.com/openclaw/openclaw) | 核心运行时与配置模型 |
| [ClawProbe](https://github.com/openclaw/clawprobe) | 可观测守护进程 |
| [PowerMem](https://github.com/openclaw/powermem) | 记忆后端 |
| [seekdb](https://github.com/openclaw/seekdb) | 检索与搜索工作流 |
| [Tauri](https://tauri.app) | 桌面应用框架 |
| [React](https://react.dev) | 前端 UI |
| [Vite](https://vitejs.dev) | 前端工具链 |
| [Playwright](https://playwright.dev) | 浏览器自动化与冒烟测试 |

</details>
