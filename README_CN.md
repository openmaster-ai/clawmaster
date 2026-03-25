# 🦞 龙虾管理大师 (ClawMaster)

[English](./README.md) | [产品定位](./VISION.md)

> **龙虾管理大师——OpenClaw 生态的六边形战士：能接管、能观测、能省钱、能应用、能构建、能守护。**

龙虾管理大师（ClawMaster）是 OpenClaw 生态的一站式智能管理平台，由开源社区协作共建，为每一位用户提供六大核心能力：接管、观测、省钱、应用、构建、守护。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

---

## 🦞 六大核心能力

| 能力 | 一句话 | 解决什么问题 |
|------|--------|-------------|
| **能接管** | 帮你装、帮你管、一切从这里开始 | 安装门槛高，配置复杂 |
| **能观测** | 花了多少、跑得如何、一目了然 | Token/费用/健康度全是黑盒 |
| **能省钱** | PowerMem + seekdb，Token 降 96% | 花钱如流水，记忆管理缺失 |
| **能应用** | 拍照答题/错题本/发票整理，开箱即用 | 装完不知道能干什么 |
| **能构建** | 跟管家聊天，智能体就建好了 | 传统开发门槛高，普通人玩不转 |
| **能守护** | 密钥加密、花费熔断、权限管控 | API Key 裸奔，花费失控无保护 |

> 详细产品定位请参阅 [VISION.md](./VISION.md)

---

## 🤝 四大生态支柱

| 生态伙伴 | 角色 | 提供能力 |
|----------|------|---------|
| **OceanBase** | 数据层 | seekdb AI 原生数据库、PowerMem 记忆引擎 |
| **百度** | 模型层 | PaddleOCR 等强力模型，支撑推理能力 |
| **LangChain 社区** | 编排层 | DeepAgents 深度智能体、LangGraph 工作流、LangSmith 可观测 |
| **算力魔方** | 硬件层 | 开源硬件标准，内置龙虾管家，边缘算力 |

---

## 🛠️ 技术栈

- **桌面框架**: [Tauri 2.x](https://tauri.app/) + [React 18](https://react.dev/)
- **语言**: TypeScript + Rust
- **UI**: [Shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/)
- **状态管理**: [Zustand](https://zustand-demo.pmnd.rs/)
- **双模式**: 桌面端 (Tauri) + Web 端 (Vite + Node.js 后端)
- **数据层**: [seekdb](https://github.com/oceanbase/seekdb) + [PowerMem](https://github.com/oceanbase/powermem)
- **智能体**: [LangChain DeepAgents](https://docs.langchain.com/oss/python/deepagents/overview) + [LangGraph](https://github.com/langchain-ai/langgraph)
- **OCR**: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)

---

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

---

## 🚀 快速开始

1. **启动应用** —— 龙虾管理大师会自动检测你的 OpenClaw 环境
2. **接管或安装** —— 已有安装则一键接管，没有则引导安装
3. **开始使用** —— Dashboard 查看状态，内置技能开箱即用
4. **深入探索** —— 费用追踪、记忆管理、智能体构建，六大能力随你用

---

## 📸 截图

> 截图即将上线！

---

## 🤝 参与贡献

龙虾管理大师是一个开源社区协作项目，欢迎所有开发者参与共建：

- 提交 Issue 和 Pull Request
- 开发内置技能和应用场景
- 适配更多硬件平台
- 完善文档和国际化

---

## 📄 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [OpenClaw](https://github.com/nicepkg/openclaw) — 本项目所服务的开源智能体框架
- [OceanBase](https://github.com/oceanbase) — seekdb + PowerMem 数据层支持
- [百度 PaddlePaddle](https://github.com/PaddlePaddle) — PaddleOCR 模型支持
- [LangChain](https://github.com/langchain-ai) — DeepAgents + LangGraph 编排支持
- [Tauri](https://tauri.app/) — 轻量级桌面框架
- [Shadcn/ui](https://ui.shadcn.com/) — 精美的 UI 组件库

---

由 OpenClaw 开源社区共建 🦞
