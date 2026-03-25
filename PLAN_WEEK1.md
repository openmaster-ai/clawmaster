# 🦞 龙虾管理大师 · 第一周开发计划

> **目标：** 一周内交付可用的六边形战士 MVP，覆盖六大核心能力
> **策略：** 大量能力已在生态中现成可用，大师的核心工作是编排——装好、串好、展示好
> **原则：** 用户看到的是「能力」，不是「类库」

---

## 一、大师自身的安装

三条路径，覆盖所有用户：

### 路径 A：有 Node.js 的用户

```bash
npm install -g clawmaster
clawmaster
```

### 路径 B：没有 Node.js 的用户

```bash
# macOS / Linux
curl -fsSL https://clawmaster.dev/install.sh | bash

# Windows
irm https://clawmaster.dev/install.ps1 | iex
```

脚本自动完成：网络检测 → 镜像配置 → 检测 OS → 安装 Node.js (via fnm) → 安装 Python (如缺失) → `npm install -g clawmaster` → 启动。

### 路径 C：零基础用户

从 GitHub Releases 下载 `.dmg` / `.exe` / `.deb`，双击安装。Tauri 应用本身不依赖 Node.js，启动后自动引导安装缺失环境。

### 网络加速（国内镜像）

所有安装路径（脚本 / npm / Tauri 桌面端）统一处理网络问题：

**自动检测 + 自动切换：**
1. 测试 `registry.npmjs.org` 连通性（2 秒超时）
2. 不通 → 自动切换国内镜像，通 → 使用官方源

**国内镜像配置表：**

| 工具 | 官方源 | 国内镜像 |
|------|--------|---------|
| npm | registry.npmjs.org | `registry.npmmirror.com`（淘宝） |
| Node.js 下载 | nodejs.org | `npmmirror.com/mirrors/node` |
| PyPI (pip) | pypi.org | `pypi.tuna.tsinghua.edu.cn`（清华） |
| uv | pypi.org | `pypi.tuna.tsinghua.edu.cn` |
| fnm 安装 | github.com | `gitee.com` 镜像或内置 binary |

**install.sh 中的镜像逻辑：**
```bash
if ! curl -s --connect-timeout 2 https://registry.npmjs.org > /dev/null 2>&1; then
  echo "检测到网络受限，自动启用国内镜像加速..."
  npm config set registry https://registry.npmmirror.com
  export FNM_NODE_DIST_MIRROR="https://npmmirror.com/mirrors/node"
  pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
  export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"
fi
```

**Tauri 桌面端安装向导中的镜像处理：**
```
┌────────────────────────────────────────────────────┐
│     🌐 网络检测                                    │
│                                                    │
│     ⚠️ 检测到访问国际源较慢                         │
│     已自动启用国内镜像加速：                         │
│                                                    │
│     npm  → npmmirror.com                          │
│     PyPI → pypi.tuna.tsinghua.edu.cn              │
│     Node → npmmirror.com/mirrors/node             │
│                                                    │
│     [继续安装]     [手动配置镜像]                    │
└────────────────────────────────────────────────────┘
```

**npm install 路径的镜像提示：**
如果用户直接 `npm install -g clawmaster`，大师首次启动安装能力时同样检测网络并自动配置镜像。

### 安装相关开发任务

| 任务 | 说明 | 工时 |
|------|------|------|
| `install.sh` 编写 | macOS/Linux 一键安装脚本，含网络检测 + 镜像自动切换 | 3h |
| `install.ps1` 编写 | Windows PowerShell 安装脚本，含镜像切换 | 3h |
| 镜像检测模块 | 统一网络检测 + 镜像配置逻辑，安装脚本和 Tauri 端共用 | 2h |
| npm 包发布配置 | `package.json` 增加 `bin` 入口，CLI 启动脚本 | 3h |
| Tauri 环境引导 UI | 桌面端缺环境时弹出引导，含网络检测 + 镜像选择 | 5h |
| GitHub Actions CI | 三平台自动打包 `.dmg` / `.exe` / `.deb` 发布到 Releases | 3h |

---

## 二、启动流程：安装或接管

用户启动大师后进入统一流程。**用户看到的是「能力」，不是底层组件名。**

```
启动龙虾管理大师
       │
       ▼
   环境检测（2-3 秒）
       │
       ├─ 没装 OpenClaw ──→ 一键安装全部能力 ──→ 进入 Dashboard
       │
       └─ 已装 OpenClaw ──→ 检测能力完整性
                                  │
                                  ├─ 全部就绪 → 进入 Dashboard
                                  └─ 有缺失 → 一键补全 → 进入 Dashboard
```

### 安装向导用户界面

```
┌────────────────────────────────────────────────────┐
│                                                    │
│              🦞 龙虾管理大师                        │
│                                                    │
│     即将为您安装以下能力：                           │
│                                                    │
│     ✅ 核心引擎                                    │
│     ✅ 记忆管理                                    │
│     ✅ 可观测性                                    │
│     ✅ 文档与图像识别                               │
│     ✅ 智能体编排                                  │
│                                                    │
│     [一键安装全部能力]                              │
│                                                    │
└────────────────────────────────────────────────────┘
```

安装中：
```
┌────────────────────────────────────────────────────┐
│                                                    │
│     安装进度  ████████████░░░░░  72%               │
│                                                    │
│     ✅ 核心引擎 — 已就绪                           │
│     ✅ 记忆管理 — 已就绪                           │
│     🔄 可观测性 — 安装中...                        │
│     ○  文档与图像识别 — 等待中                      │
│     ○  智能体编排 — 等待中                         │
│                                                    │
│     > npm install -g clawprobe                     │
│     > added 4 packages in 2.3s                     │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 能力与底层组件映射（用户不可见，仅开发参考）

| 用户看到的能力 | 实际安装的组件 | 安装命令 |
|--------------|--------------|---------|
| 核心引擎 | OpenClaw | `npm install -g openclaw` + `openclaw setup` |
| 记忆管理 | PowerMem + 插件 | `pip install powermem` + `openclaw plugins install memory-powermem` |
| 可观测性 | ClawProbe | `npm install -g clawprobe` |
| 文档与图像识别 | PaddleOCR Skills | `clawhub install paddleocr-doc-parsing paddleocr-text-recognition` |
| 智能体编排 | LangChain + DeepAgents | `pip install langchain langgraph deepagents` |

### 安装向导开发任务

| 任务 | 说明 | 工时 |
|------|------|------|
| 改造 StartupDetector | 三态：检测中 → 安装/接管 → 进入主界面；增加 Python/pip 检测 | 4h |
| 安装执行器 | 按序执行 5 项安装命令，stdout 实时流式输出到 UI | 5h |
| 能力完整性检测 | 接管模式下检测 5 项能力哪些缺失，生成补全列表 | 3h |
| 安装结果页 | 展示 5 项能力状态，"全部就绪，进入管理大师" 按钮 | 2h |

---

## 三、第一周完整功能清单

### 核心一：能接管

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 1.1 | 三种安装路径 | npm / curl 脚本 / 桌面安装包 | **需开发** |
| 1.2 | 全链路环境检测 | Node.js / npm / Python / pip / OpenClaw + 五项能力 | 改造现有 |
| 1.3 | 一键安装全部能力 | 一个按钮装好全家桶，进度条 + 实时日志 | **需开发** |
| 1.4 | 接管 + 能力补全 | 已有用户自动检测，缺啥补啥 | **需开发** |
| 1.5 | 安装就绪总览 | 5 项能力全绿，进入 Dashboard | **需开发** |
| 1.6 | 配置可视化编辑（可写） | 所有配置可编辑、保存 | 修复 setConfig |
| 1.7 | JSON 编辑器（可写） | JSON 模式可编辑、保存 | 移除 readOnly |
| 1.8 | 网关可靠启停 | 启停有 loading + 轮询验证 | 修复验证逻辑 |
| 1.9 | 网关 Token 复制 | 一键复制认证 Token | 已实现 |

### 核心二：能观测

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 2.1 | **可观测 Dashboard（新页面）** | 侧边栏新增入口，费用/Token/健康度全景 | **新建页面** |
| 2.2 | 今日/本周/本月费用卡片 | 顶部三张卡片，数据来自 `clawprobe cost --json` | **需开发** |
| 2.3 | 费用趋势折线图 | 按天显示费用趋势（Recharts） | **需开发** |
| 2.4 | 模型费用分布饼图 | 按模型/提供商分组的费用占比 | **需开发** |
| 2.5 | Token 用量统计 | input/output/cache 分别统计，柱状图 | **需开发** |
| 2.6 | 会话列表 | 所有会话：时间、模型、Token 数、费用 | **需开发** |
| 2.7 | 会话详情 | 点击展开完整对话，每轮显示 Token 消耗 | **需开发** |
| 2.8 | 上下文健康度 | 进度条 + 红/黄/绿色告警 | **需开发** |
| 2.9 | 智能优化建议 | 5 类告警卡片（截断/压缩/满载/飙升/膨胀） | **需开发** |
| 2.10 | 守护进程管理 | 一键启停可观测后台，状态指示灯 | **需开发** |

### 核心三：能省钱

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 3.1 | **记忆管理页面（新页面）** | 侧边栏新增入口，Agent 记忆全景 | **新建页面** |
| 3.2 | 记忆列表 | 分页展示所有记忆（内容摘要、时间、Agent、重要度） | **需开发** |
| 3.3 | 记忆搜索 | 关键词搜索相关记忆 | **需开发** |
| 3.4 | 记忆详情 | 完整内容、元数据、衰减状态 | **需开发** |
| 3.5 | 记忆删除 | 选中删除 | **需开发** |
| 3.6 | 记忆健康状态 | 连接状态、记忆总数、存储引擎 | **需开发** |
| 3.7 | 多 Agent 记忆切换 | 下拉选择不同 Agent 的独立记忆空间 | **需开发** |
| 3.8 | 记忆统计 | 总数、衰减率、本周新增/遗忘 | **需开发** |

### 核心四：能应用

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 4.1 | 技能市场真实对接 | 展示真实已安装技能（替换 Mock），来自 `clawhub list` | 替换 Mock |
| 4.2 | 技能搜索 | 真实调用 `clawhub search`，5400+ 技能 | 调用命令 |
| 4.3 | 一键安装技能 | 执行 `clawhub install <slug>` | 调用命令 |
| 4.4 | 一键卸载技能 | 执行 `clawhub uninstall <slug>` | 调用命令 |
| 4.5 | **场景推荐：拍照答题** | 推荐卡片，展示流程，一键安装对应技能组合 | **新建区块** |
| 4.6 | **场景推荐：发票整理** | 同上 | **新建区块** |
| 4.7 | **场景推荐：错题本** | 同上，含自编 SKILL.md | **新建区块 + 编写 SKILL** |
| 4.8 | 通道列表展示 | 已配置通道展示（飞书/微信/钉钉/TG 等） | 已实现 |

### 核心五：能构建

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 5.1 | 环境已安装 | 安装向导中已包含 DeepAgents + LangGraph + LangChain | 安装向导覆盖 |
| 5.2 | 就绪状态指示 | Dashboard/Settings 展示"智能体编排"就绪状态 | **需开发** |

> 对话式构建 UI 放第二周

### 核心六：能守护

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| 6.1 | API Key 脱敏 | 显示 `sk-••••1234`，点击切换完整显示 | **需开发** |
| 6.2 | 花费预算设置 | Settings 中设日/周/月预算上限 | **需开发** |
| 6.3 | 预算进度条 | 可观测 Dashboard 顶部，当前花费 vs 预算 | **需开发** |
| 6.4 | 超支告警 | 超 80% 红色横幅告警 | **需开发** |
| 6.5 | 数据 100% 本地 | 零云端上传，零遥测（继承现有架构） | 已实现 |

### 辅助功能

| # | 功能 | 说明 | 状态 |
|---|------|------|------|
| A.1 | Dashboard 升级 | 首页增加费用速览、记忆状态、能力就绪三张新卡片 | **需开发** |
| A.2 | 侧边栏更新 | 新增"可观测""记忆"两个导航项 | 修改 Layout |
| A.3 | 真实日志 | 读取真实 log 文件替换硬编码 | 修复后端 |
| A.4 | 主题切换生效 | 绑定 localStorage + CSS | 绑定事件 |
| A.5 | Zustand 状态整合 | 各页面改用 appStore 统一管理 | 重构 |
| A.6 | 截图更新 README | 真实截图替换 "Screenshots coming soon!" | 截图 |
| A.7 | Demo GIF | 30s 操作录屏：安装→观测→记忆 | 录制 |

---

## 四、工作量汇总

| 类别 | 数量 |
|------|------|
| **架构骨架（S-01 ~ S-07）** | **7 项**（AdapterResult 类型、useAdapterCall Hook、模块结构、平台检测统一、ErrorBoundary、ESLint/Prettier/Vitest、Hook 单元测试） |
| 功能任务（T-001 ~ T-057） | **57 项**（含 4 项测试任务：adapter 单元测试 ×3 + dev-browser 冒烟测试 ×2） |
| 新建模块页面 | 3 个（`modules/setup/`、`modules/observe/`、`modules/memory/`） |
| 新建 adapter 文件 | 4 个（`platform.ts`、`clawprobe.ts`、`powermem.ts`、`clawhub.ts`） |
| 新建通用组件 | 4+ 个（ErrorBoundary、LoadingState、PasswordField、StatusCard 等） |
| 新建图表组件 | 4 个（费用趋势、模型分布、Token 柱状图、预算/健康度进度条） |
| 修复/增强现有页面（旧架构最小改动） | 7 个（Config、Gateway、Skills、Settings、Models、Logs、Layout） |
| 安装脚本 | 2 个（install.sh、install.ps1） |
| SKILL 编写 | 1 个（错题本场景） |
| CI/发布 | 1 项（GitHub Actions 三平台打包） |
| 文档/截图 | 2 项（README 截图、Demo GIF） |

**新旧并存策略：** 阶段 0 搭好骨架后，新代码（安装向导/可观测/记忆）按 `modules/` + `shared/` 新架构开发；旧代码（Config/Gateway/Skills 等）最小修复让功能可用，第二周统一迁移到新架构。

---

## 五、开发任务清单

### 阶段 0：架构骨架（Day 1 上午）

> 先花半天搭好地基，后续所有新代码直接按新架构写。旧代码最小修复不重构。
> 详细架构设计见 [ARCHITECTURE.md](./ARCHITECTURE.md)

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| S-01 | 创建 `shared/adapters/types.ts`，定义统一 `AdapterResult<T>` 类型 | 新建 `shared/adapters/types.ts` |
| S-02 | 创建 `shared/hooks/useAdapterCall.ts`，通用数据获取 Hook（loading/error/refetch/polling） | 新建 `shared/hooks/useAdapterCall.ts` |
| S-03 | 创建 `modules/` 目录 + `types/module.ts` 定义 `ClawModule` 接口 | 新建目录 + 类型文件 |
| S-04 | 创建 `shared/adapters/platform.ts`，环境检测统一入口（合并三处散落逻辑） | 新建文件 |
| S-05 | 创建 `shared/components/ErrorBoundary.tsx` + `LoadingState.tsx` | 新建两个组件 |
| S-06 | ESLint + Prettier + Vitest 配置 | `.eslintrc.js`, `.prettierrc`, `vitest.config.ts`, tsconfig 包含 test |
| S-07 | `useAdapterCall.test.ts` 单元测试 | 验证 loading→data→error 状态流转、polling、refetch |

**里程碑：** 新架构骨架就绪，测试框架可用，后续新页面全部按 `modules/xxx/` 结构开发

### 阶段 1：大师自身安装 + 安装向导（Day 1 下午 ~ Day 2 上午）

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| T-001 | npm 包发布配置（bin 入口 + CLI 启动脚本） | `package.json` |
| T-002 | install.sh 编写（含网络检测 + 镜像切换） | 新建 `scripts/install.sh` |
| T-003 | install.ps1 编写（含镜像切换） | 新建 `scripts/install.ps1` |
| T-004 | 镜像检测模块（统一逻辑，脚本和 Tauri 共用） | 新建 `shared/adapters/mirror.ts` + Rust 端 |
| T-005 | 改造 StartupDetector（五项能力检测 + 三态流程），使用 S-04 的统一检测 | `StartupDetector.tsx`, `lib.rs` |
| T-006 | 安装向导页面（按 `modules/setup/` 结构），用 `useAdapterCall` Hook | 新建 `modules/setup/` |
| T-007 | 安装执行器（按序执行 5 项安装，stdout 流式输出到 UI） | `modules/setup/`, `lib.rs` |
| T-008 | 能力补全逻辑（接管模式检测缺失 → 自动补装） | `modules/setup/` |
| T-009 | 安装结果页（5 项能力状态总览 → 进入 Dashboard） | `modules/setup/` |

**里程碑：** `npm install -g clawmaster` → `clawmaster` → 一键安装全部能力 → 进入 Dashboard

### 阶段 2：让现有功能真正可用（Day 2 下午）

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| T-010 | 修复 setConfig 深层合并 bug | `adapters/index.ts`（旧文件最小修复） |
| T-011 | Config 页面可写（移除 readOnly + 保存按钮） | `pages/Config.tsx` |
| T-012 | 网关启停轮询验证 + loading 状态 | `adapters/index.ts`, `pages/Gateway.tsx` |
| T-013 | 后端日志真实化（读 ~/.openclaw/logs/） | `backend/src/index.ts` |
| T-014 | Skills 页面替换 Mock，对接 clawhub list/search | `pages/Skills.tsx` |
| T-015 | Settings 主题/语言绑定 localStorage + CSS | `pages/Settings.tsx` |

**里程碑：** 配置可编辑保存，网关可靠启停，技能真实展示

### 阶段 3：可观测 Dashboard（Day 3）

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| T-016 | 引入 Recharts 依赖 | `package.json` |
| T-017 | 创建 `shared/adapters/clawprobe.ts`（cost/session/context/suggest 调用封装，返回 `AdapterResult<T>`） | 新建文件 |
| T-018 | 新建 `modules/observe/` 页面骨架 + `index.ts` 模块注册 | 新建 `modules/observe/` |
| T-019 | 费用汇总卡片（今日/周/月），用 `useAdapterCall` + `shared/components/StatusCard` | `modules/observe/components/` |
| T-020 | 费用趋势折线图 | `modules/observe/components/CostTrend.tsx` |
| T-021 | 模型费用分布饼图 | `modules/observe/components/ModelDistribution.tsx` |
| T-022 | Token 用量柱状图 | `modules/observe/components/TokenChart.tsx` |
| T-023 | 上下文健康度进度条 | `modules/observe/components/ContextHealth.tsx` |
| T-024 | 智能优化建议卡片（5 类告警） | `modules/observe/components/Suggestions.tsx` |
| T-025 | 会话列表 + 会话详情展开 | `modules/observe/components/SessionList.tsx` |
| T-026 | ClawProbe 守护进程启停管理 | `modules/observe/` |

| T-027 | `clawprobe.test.ts` 单元测试（mock CLI 输出，验证 cost/session/context 解析） | `shared/adapters/__tests__/` |
| T-028 | **dev-browser 冒烟测试**：启动 dev server → 走 Dashboard/网关/配置/可观测 4 个页面 → 截图存证 | 手动执行 |

**里程碑：** 可观测 Dashboard 可用，能看到费用/Token/健康度

### 阶段 4：记忆管理（Day 4）

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| T-029 | 创建 `shared/adapters/powermem.ts`（list/search/delete/stats 封装，返回 `AdapterResult<T>`） | 新建文件 |
| T-030 | 新建 `modules/memory/` 页面骨架 + `index.ts` 模块注册 | 新建 `modules/memory/` |
| T-031 | 记忆列表（分页展示），用 `useAdapterCall` + `shared/components/DataTable` | `modules/memory/components/` |
| T-032 | 记忆搜索 | `modules/memory/components/` |
| T-033 | 记忆详情 + 删除 | `modules/memory/components/` |
| T-034 | 记忆健康状态卡片 | `modules/memory/components/` |
| T-035 | 多 Agent 记忆切换 | `modules/memory/` |
| T-036 | 记忆统计（总数/衰减率/新增/遗忘） | `modules/memory/components/` |
| T-037 | `powermem.test.ts` 单元测试（mock CLI 输出，验证 list/search/stats 解析） | `shared/adapters/__tests__/` |

**里程碑：** 记忆管理页面可用，能浏览/搜索/删除 Agent 记忆

### 阶段 5：能应用 + 能守护（Day 5）

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| T-038 | 创建 `shared/adapters/clawhub.ts`（install/uninstall/list/search 封装） | 新建文件 |
| T-039 | 技能安装/卸载对接 | `pages/Skills.tsx` |
| T-040 | 场景推荐区块（拍照答题/发票整理/错题本） | `pages/Skills.tsx` |
| T-041 | 编写错题本 SKILL.md | 新建 `skills/mistake-notebook/SKILL.md` |
| T-042 | API Key 脱敏显示（用 `shared/components/PasswordField`） | `pages/Models.tsx` |
| T-043 | 花费预算设置（Settings 表单 + localStorage） | `pages/Settings.tsx` |
| T-044 | 预算进度条 + 超支告警横幅 | `modules/observe/` |
| T-045 | `clawhub.test.ts` 单元测试 | `shared/adapters/__tests__/` |

**里程碑：** 技能可装卸、场景推荐可用、安全基础就位

### 阶段 6：整合 + 发布准备（Day 6-7）

| 编号 | 任务 | 涉及文件 |
|------|------|---------|
| T-046 | App.tsx 改造：从 `modules/*/index.ts` 自动收集路由（新页面自动注册） | `App.tsx` |
| T-047 | Layout 改造：从模块注册生成侧边栏导航（新页面自动出现在菜单） | `Layout.tsx` |
| T-048 | Dashboard 升级（费用速览/记忆状态/能力就绪卡片） | `pages/Dashboard.tsx` |
| T-049 | 能构建就绪状态指示 | `pages/Dashboard.tsx` 或 `pages/Settings.tsx` |
| T-050 | Tauri 环境引导 UI（缺 Node.js/Python 时弹出） | `StartupDetector.tsx`, `lib.rs` |
| T-051 | GitHub Actions CI（三平台打包 + `vitest run` 卡质量） | 新建 `.github/workflows/` |
| T-052 | **dev-browser 全流程冒烟测试**：走完安装→Dashboard→可观测→记忆→技能→设置全路径 → 截图 | 手动执行 |
| T-053 | 全流程 Bug 修复 | — |
| T-054 | 截取所有页面截图 | README 更新 |
| T-055 | 录制 30s Demo GIF | README 更新 |
| T-056 | README 更新（放入截图 + Demo） | `README.md`, `README_CN.md` |
| T-057 | npm publish + GitHub Release | — |

**里程碑：** 可发布版本，测试通过，README 有截图，三平台安装包可下载

---

## 六、里程碑验收标准

| 时间点 | 里程碑 | 验收标准 |
|--------|--------|---------|
| **Day 1 结束** | 大师可安装，能装龙虾 | `npm install -g clawmaster` → `clawmaster` → 一键安装全部能力 → 进入 Dashboard |
| **Day 2 结束** | 核心管理可用 | 配置可编辑保存、网关可靠启停、技能列表真实 |
| **Day 4 结束** | 可观测 + 记忆 | 打开可观测页面看到费用/Token/健康度，打开记忆页面管理 Agent 记忆 |
| **Day 5 结束** | 六大核心就位 | 六大核心至少有 MVP 级别功能可演示 |
| **Day 7 结束** | 可发布 | npm 可安装、README 有截图、Demo 可演示、三平台安装包可下载 |

---

## 七、第一周明确不做

| 不做 | 原因 | 排期 |
|------|------|------|
| 本地代理 (Local Proxy) | 用 ClawProbe 文件读取方案替代，效果等同 | 第二周 |
| seekdb 替换 SQLite | PowerMem 默认用 SQLite 已足够 MVP | 第二周 |
| 对话式智能体构建 UI | 需要 Python sidecar 架构设计 | 第二周 |
| LangSmith 对接 | 可观测 MVP 先用 ClawProbe 数据 | 第二周 |
| 花费熔断（自动暂停 API） | 需要本地代理层支持 | 第二周 |
| 操作审计 / 权限管控 | 需要用户系统 | 第三周 |
| 通道 CRUD 表单 | 配置编辑器已可写，通道可通过 Config 页面修改 | 第二周 |
| 多实例管理 | 低优先级 | 第三周 |

---

## 八、架构改进

> 详见 [ARCHITECTURE.md](./ARCHITECTURE.md) —— 完整的架构现状评估、问题清单、目标架构与重构路线图。
>
> 第一周以交付功能为主，开发过程中在 `ARCH_NOTES.md` 中记录遇到的架构问题，为第二周架构升级积累素材。

---

## 九、六大核心第一周达成度

```
              能接管 80%
            ╱        ╲
     能守护 15%       能观测 50%
        │                │
     能构建 5%         能省钱 40%
            ╲        ╱
            能应用 30%
```

---

*第一周结束后，龙虾管理大师将是一个：可安装、能用、能看到钱花在哪、能管理记忆、有内置场景推荐、API Key 安全的六边形战士 MVP。*
