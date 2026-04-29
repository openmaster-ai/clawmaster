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
  <a href="https://github.com/openmaster-ai/clawmaster-workshop"><img src="https://img.shields.io/badge/Workshop-hands--on-0A7EA4?style=flat" alt="Workshop" /></a>
</p>

<p align="center">
  <a href="#快速开始"><img src="https://img.shields.io/badge/Quick_Start-5_min-006DFF?style=for-the-badge" alt="Quick Start" /></a>
  <a href="#路线图"><img src="https://img.shields.io/badge/Roadmap-6_capabilities-ff69b4?style=for-the-badge" alt="Roadmap" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributing-welcome-21bb42?style=for-the-badge" alt="Contributing" /></a>
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/openmaster-ai/clawmaster/build.yml?branch=main" alt="Build" /></a>
  <a href="https://github.com/openmaster-ai/clawmaster/milestone/1"><img src="https://img.shields.io/badge/milestone-v0.4.0-6f42c1" alt="下一个里程碑: v0.4.0" /></a>
  <a href="https://github.com/openmaster-ai/clawmaster/stargazers"><img src="https://img.shields.io/github/stars/openmaster-ai/clawmaster?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0" />
</p>

<p align="center">
  <a href="https://github.com/openmaster-ai/clawmaster/releases"><strong>📦 Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/discussions"><strong>💬 Discussions</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/openmaster-ai/clawmaster/issues"><strong>🐛 Issues</strong></a> &nbsp;·&nbsp;
  <a href="https://deepwiki.com/openmaster-ai/clawmaster"><strong>📘 Ask DeepWiki</strong></a>
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
> 当前版本为 **v0.3.1**。下一个里程碑是 [**v0.4.0**](https://github.com/openmaster-ai/clawmaster/milestone/1) —— 已经合并的功能会随发布一起落地。

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

### 选一条上手路径

- 🧪 **动手实操** —— 跟着 [**clawmaster-workshop**](https://github.com/openmaster-ai/clawmaster-workshop) 练一遍 —— 三语（EN / 中文 / 日本語）任务按六大核心能力分组，还有把任务串成真实场景的日期化实验。想*动手做*的首选。
- 🖼️ **图示导览** —— 看下面的[产品功能总览](#产品功能总览)，每张截图对应一个具体任务，不装就能看懂产品在做什么。

## 为什么是 ClawMaster

大多数 OpenClaw 工具都停在“把配置配对”。ClawMaster 是你**真正走进日常生活的 OpenClaw 伙伴** —— 是连接 OpenClaw 强大能力与日常可用性的桥梁。它面向这样的用户：想让 OpenClaw 在日常生活里真的有用（而不只是配好），不想天天跟 JSON 和终端打交道，或在替团队、家人管理 OpenClaw。

## 记忆亮点

记忆是**能省钱**能力的主干。我们基于 [**PowerMem**](https://github.com/oceanbase/powermem)（[Python](https://github.com/oceanbase/powermem) · [TypeScript SDK](https://github.com/ob-labs/powermem-ts) · [OpenClaw 插件](https://github.com/ob-labs/memory-powermem)）构建，而不是自己重造：

- **原生 OpenClaw 公民** —— PowerMem 自带 OpenClaw 记忆插件，智能体每一轮自动 recall / capture。
- **智能抽取，而不是堆积 chunk** —— 把对话蒸馏成持久事实，并用艾宾浩斯衰减模型驱动回忆，与我们“建了也要养”的方向高度契合。
- **多智能体隔离开箱即用** —— 按用户 / 智能体 / 工作区自动隔离，无需自己搭身份系统。
- **数据库级持久化** —— 与 [OceanBase seekdb](https://github.com/oceanbase/seekdb) 搭配可做向量 + 全文 + SQL 混合检索，SQLite 作为跨平台兜底。
- **开源、多语言 SDK** —— 不绑定单一运行时；从 JS 到 Python 到 Go 的语义一致。

**已经上线**

- 托管 PowerMem 运行时 + OpenClaw 桥接，覆盖 Web、后端和桌面 —— 智能体每一轮开箱即用地自动 recall / capture。
- 本地工作区导入 —— 把 markdown / `memory/` 导入托管 PowerMem，有 seekdb 时用 seekdb，其他情况降级到 SQLite。
- 首个端到端记忆驱动技能：每日 npm 包下载摘要，支持周期同比对比。
- 记忆相关的可观测：按会话花费、定时费用摘要、models.dev 定价。

**下一步（v0.4.0）**：完整的 seekdb 混合检索，以及自维护的 LLM Wiki 模块 —— 每次投入都会让 Wiki 页面自动交叉链接并积累，艾宾浩斯衰减与新鲜度加权让内容保持“活着”。具体进展见 [v0.4.0 里程碑](https://github.com/openmaster-ai/clawmaster/milestone/1)。

## 产品功能总览

<table>
  <tr>
    <td align="center" width="25%">
      <a href="./docs/screenshots/wizard-provider.png"><img src="./docs/screenshots/wizard-provider.png" alt="分层展示的引导向导" /></a><br/>
      <sub><b>引导向导</b> · 两步安装，分层展示供应商</sub>
    </td>
    <td align="center" width="25%">
      <a href="./docs/screenshots/page-dashboard.png"><img src="./docs/screenshots/page-dashboard.png" alt="总览仪表盘" /></a><br/>
      <sub><b>总览</b> · 运行态健康与下一步任务</sub>
    </td>
    <td align="center" width="25%">
      <a href="./docs/screenshots/page-models.png"><img src="./docs/screenshots/page-models.png" alt="模型与供应商" /></a><br/>
      <sub><b>模型</b> · 多供应商配置与实时校验</sub>
    </td>
    <td align="center" width="25%">
      <a href="./docs/screenshots/page-channels.png"><img src="./docs/screenshots/page-channels.png" alt="频道接入" /></a><br/>
      <sub><b>频道</b> · 6 个消息平台的接入向导</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="./docs/screenshots/page-observe.png"><img src="./docs/screenshots/page-observe.png" alt="可观测 · ClawProbe" /></a><br/>
      <sub><b>可观测</b> · ClawProbe 驱动的成本、Token、会话健康</sub>
    </td>
    <td align="center">
      <a href="./docs/screenshots/page-memory.png"><img src="./docs/screenshots/page-memory.png" alt="记忆工作区" /></a><br/>
      <sub><b>记忆</b> · PowerMem 运行时，支持 seekdb / SQLite 降级</sub>
    </td>
    <td align="center">
      <a href="./docs/screenshots/page-mcp.png"><img src="./docs/screenshots/page-mcp.png" alt="MCP 服务器" /></a><br/>
      <sub><b>MCP</b> · 服务器、端点与技能定义</sub>
    </td>
    <td align="center">
      <a href="./docs/screenshots/page-skills.png"><img src="./docs/screenshots/page-skills.png" alt="技能市场" /></a><br/>
      <sub><b>技能</b> · ClawHub 市场，一键安装与审计</sub>
    </td>
  </tr>
</table>

## 适合谁

- **「想让 OpenClaw 真的能帮我做事，不只是配好。」** —— 缩短“安装完成”到“真实产出”的距离。
- **「我不是技术人员，但也想有强大的 AI 助理。」** —— 引导式安装、引导式使用，不要求你懂 JSON。
- **「我在帮团队或家人管 OpenClaw。」** —— 一个地方搞定频道、运行态、上手流程。
- **「我在搭高级智能体工作流。」** —— 模型、可观测、记忆、会话、插件、技能、MCP 一站式。

## 路线图

六大核心能力 —— 每一项都从基础设施走向日常可用：

| # | 能力 | 状态 | 已有 | 下一步 |
|---|---|---|---|---|
| 1 | **能接管** | 可用 | 引导式向导、6+ LLM 供应商并校验 Key、6 种频道（飞书 / 微信 / Discord / Slack / Telegram / WhatsApp）、Profile 切换 | 一键环境迁移、Windows + WSL2 一等支持 |
| 2 | **能观测** | 可用 | 基于 ClawProbe 的面板、按会话的费用与 Token 追踪、网关健康监控 | 历史花费分析、异常告警、多 Profile 对比 |
| 3 | **能省钱** | 进行中 | 托管 PowerMem 运行时 + OpenClaw 桥接、本地工作区导入、首个记忆驱动技能 —— 详见[记忆亮点](#记忆亮点) | 完整 seekdb 混合检索、自维护 LLM Wiki —— 详见 [v0.4.0 里程碑](https://github.com/openmaster-ai/clawmaster/milestone/1) |
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

- **2026-04-25** 🚀 v0.3.0 —— 首个正式版。安装向导、PaddleOCR 文档解析、文心大模型图像生成、费用可观测、定时任务管理、内置技能刷新与托管 PowerMem 支持已就绪。CLI 为推荐安装方式，桌面版仍为 Beta。
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
| [PowerMem](https://github.com/oceanbase/powermem) · [TS SDK](https://github.com/ob-labs/powermem-ts) | 记忆后端 |
| [OceanBase seekdb](https://github.com/oceanbase/seekdb) | 检索与搜索工作流 |
| [Tauri](https://tauri.app) | 桌面应用框架 |
| [React](https://react.dev) | 前端 UI |
| [Vite](https://vitejs.dev) | 前端工具链 |
| [Playwright](https://playwright.dev) | 浏览器自动化与冒烟测试 |

</details>
