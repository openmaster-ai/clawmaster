# 🦞 龙虾管理大师 · 架构设计文档

> 本文档包含：当前架构评估 → 问题清单 → 目标架构 → 重构路线图

---

## 一、当前架构总览

### 1.1 系统分层

```
┌──────────────────────────────────────────────────────────────┐
│                        前端 (React 18)                        │
│  packages/web/src/                                           │
│  ├── pages/          10 个页面组件（各自管理状态）             │
│  ├── components/     Layout + StartupDetector                │
│  ├── adapters/       平台适配层（单文件 index.ts）            │
│  ├── stores/         Zustand store（已定义，未使用）           │
│  └── lib/            类型定义 + 工具函数                      │
├──────────────────────────────────────────────────────────────┤
│                     平台层（二选一）                           │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │  Tauri (Rust)        │  │  Express (Node.js)           │  │
│  │  src-tauri/src/lib.rs│  │  packages/backend/src/       │  │
│  │  9 个 command        │  │  12 个 API endpoint          │  │
│  └──────────┬───────────┘  └──────────────┬───────────────┘  │
│             └──────────────┬──────────────┘                   │
│                            ▼                                  │
│                   OpenClaw CLI (shell exec)                   │
│                   ~/.openclaw/openclaw.json                   │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 架构评分

| 维度 | 分数 | 说明 |
|------|------|------|
| 架构清晰度 | 6/10 | Adapter 模式思路对，但执行不一致 |
| 可测试性 | 2/10 | 零测试，高耦合，无法 mock |
| 可扩展性 | 3/10 | 路由/导航/状态全部硬编码，无插件入口 |
| 可维护性 | 4/10 | 大量复制粘贴，逻辑散落各页面 |
| 类型安全 | 5/10 | 用了 TypeScript 但 config 是 `any`，跨语言无同步 |
| 开发者体验 | 3/10 | 新人不知该用 store 还是 useState，不知选哪个 dev 命令 |
| 错误处理 | 3/10 | Web adapter 静默吞错，无 ErrorBoundary |

---

## 二、问题清单

### 2.1 结构性问题

| 编号 | 问题 | 现状 | 影响范围 |
|------|------|------|---------|
| P-01 | **adapter 单文件膨胀** | 所有平台适配 + 20+ 方法塞在一个 `index.ts` | 每次新增能力都改这一个文件，冲突风险高 |
| P-02 | **Zustand store 废弃** | 定义了 appStore 但零引用，各页面自管 useState | 页面间数据不同步，重复请求，新人困惑 |
| P-03 | **页面组件臃肿** | 每个页面 300-500 行，数据获取 + 逻辑 + UI 混写 | 相同的 loading/error 模板复制粘贴 10 遍 |
| P-04 | **路由/导航硬编码** | App.tsx 写死 10 条路由，Layout.tsx 写死 10 个菜单项 | 新增页面必须改两个文件，插件无法注册页面 |
| P-05 | **环境检测散落三处** | `adapters/index.ts`、`StartupDetector.tsx`、`lib/types.ts` 各有一套 | 检测逻辑不一致，维护成本高 |

### 2.2 质量问题

| 编号 | 问题 | 现状 | 影响范围 |
|------|------|------|---------|
| Q-01 | **config 类型为 any** | `OpenClawConfig` 内部全是 `[key: string]: any` | 无自动补全，运行时才发现字段错误 |
| Q-02 | **Web adapter 静默吞错** | `if (!res.ok) return []`，不报错直接返回空数据 | 用户看到"无数据"无法区分"真没有"还是"网络挂了" |
| Q-03 | **无 ErrorBoundary** | 页面级无错误边界，CLI 调用失败可能白屏 | 用户体验差，开发难调试 |
| Q-04 | **魔法数字** | `setTimeout(loadData, 1000)` 等硬编码延时 | 慢机器可能超时，快机器浪费等待 |
| Q-05 | **Rust/TS 类型不同步** | Rust `config_path` vs TS `configPath`，手动转换 | 字段遗漏无编译期检查 |

### 2.3 工程化问题

| 编号 | 问题 | 现状 | 影响范围 |
|------|------|------|---------|
| E-01 | **零测试覆盖** | 无 Vitest/Jest/Playwright | 无法安全重构，PR 无自动验证 |
| E-02 | **无代码规范** | 无 ESLint/Prettier 配置 | 风格不一致，review 成本高 |
| E-03 | **无贡献指南** | 无 CONTRIBUTING.md | 社区不知从哪下手 |
| E-04 | **无 CI/CD** | 无 GitHub Actions | 手动测试、手动打包、手动发布 |
| E-05 | **无国际化框架** | 所有中文硬编码在组件里 | 加英文需改每个文件 |
| E-06 | **Mock 数据残留** | Skills 页面 6 个硬编码技能，日志后端 3 条假数据 | 用户被误导，开发者混淆哪些是真功能 |

---

## 三、目标架构

基于六大核心能力（能接管/能观测/能省钱/能应用/能构建/能守护）和社区共建需求，目标架构需要满足：

1. **可插拔** —— 每个能力可独立开发、独立加载
2. **可贡献** —— 新人 30 分钟内能跑起来并提交第一个 PR
3. **可测试** —— 每个模块可独立测试，CI 自动验证
4. **可扩展** —— 新增页面/工具/能力不改核心代码

### 3.1 目标分层

```
┌─────────────────────────────────────────────────────────────────┐
│                          应用壳 (App Shell)                      │
│  路由注册 · 导航注册 · 插件加载 · 全局状态 · 主题/i18n          │
├─────────────────────────────────────────────────────────────────┤
│                          能力模块层 (Modules)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 能接管   │ │ 能观测   │ │ 能省钱   │ │ 能应用   │  ...      │
│  │ setup/   │ │ observe/ │ │ memory/  │ │ skills/  │          │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│       │            │            │            │                  │
│       └────────────┴────────────┴────────────┘                  │
│                          ▼                                      │
├─────────────────────────────────────────────────────────────────┤
│                       共享层 (Shared)                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ UI 组件库    │ │ 数据 Hooks   │ │ 工具适配器   │            │
│  │ components/  │ │ hooks/       │ │ adapters/    │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                       平台层 (Platform)                          │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  Tauri (Rust)        │  │  Web (Express)               │    │
│  │  platform/tauri/     │  │  platform/web/               │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                       外部工具层 (External)                      │
│  OpenClaw CLI · ClawProbe · PowerMem (pmem) · ClawHub          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 目标目录结构

```
packages/web/src/
├── app/                          # 应用壳
│   ├── App.tsx                   # 路由注册（从模块动态收集）
│   ├── Layout.tsx                # 导航（从模块动态收集）
│   ├── providers.tsx             # 全局 Context 组合
│   └── startup/                  # 启动检测流程
│       ├── StartupDetector.tsx
│       └── InstallWizard.tsx
│
├── modules/                      # 能力模块（每个可独立开发）
│   ├── dashboard/                # 概览
│   │   ├── index.ts              # 模块注册（路由 + 导航 + 状态）
│   │   ├── DashboardPage.tsx
│   │   └── components/
│   ├── gateway/                  # 网关管理
│   │   ├── index.ts
│   │   ├── GatewayPage.tsx
│   │   ├── hooks/useGateway.ts
│   │   └── components/
│   ├── observe/                  # 可观测（新）
│   │   ├── index.ts
│   │   ├── ObservePage.tsx
│   │   ├── hooks/useClawProbe.ts
│   │   └── components/
│   │       ├── CostCard.tsx
│   │       ├── TokenChart.tsx
│   │       └── SessionList.tsx
│   ├── memory/                   # 记忆管理（新）
│   │   ├── index.ts
│   │   ├── MemoryPage.tsx
│   │   ├── hooks/usePowerMem.ts
│   │   └── components/
│   ├── skills/                   # 技能管理
│   ├── agents/                   # Agent 管理
│   ├── channels/                 # 通道管理
│   ├── models/                   # 模型管理
│   ├── config/                   # 配置编辑
│   ├── logs/                     # 日志查看
│   └── settings/                 # 设置
│
├── shared/                       # 共享层
│   ├── components/               # 通用 UI 组件
│   │   ├── StatusCard.tsx
│   │   ├── DataTable.tsx
│   │   ├── ChartPanel.tsx
│   │   ├── AlertBanner.tsx
│   │   ├── LoadingState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── PasswordField.tsx     # 脱敏显示组件
│   ├── hooks/                    # 通用数据 Hooks
│   │   ├── useAdapterCall.ts     # 替代各页面重复的 fetch 模板
│   │   ├── usePolling.ts         # 轮询 Hook
│   │   └── useLocalStorage.ts
│   ├── adapters/                 # 工具适配器（按工具拆文件）
│   │   ├── types.ts              # 统一类型定义
│   │   ├── platform.ts           # 平台检测 + adapter 选择（单一来源）
│   │   ├── openclaw.ts           # OpenClaw CLI 调用
│   │   ├── clawprobe.ts          # ClawProbe 调用
│   │   ├── powermem.ts           # PowerMem (pmem) 调用
│   │   ├── clawhub.ts            # ClawHub 调用
│   │   └── mirror.ts             # 网络检测 + 镜像配置
│   ├── store/                    # 全局状态
│   │   └── appStore.ts           # 统一状态管理（实际使用）
│   └── i18n/                     # 国际化
│       ├── zh.json
│       └── en.json
│
└── types/                        # 全局类型
    ├── config.ts                 # OpenClaw 配置（严格类型，非 any）
    ├── system.ts                 # 系统信息
    ├── gateway.ts                # 网关状态
    ├── module.ts                 # 模块注册接口
    └── adapter.ts                # 适配器接口（按领域拆分）
```

### 3.3 模块注册机制

每个能力模块导出统一接口，应用壳自动收集：

```typescript
// types/module.ts
export interface ClawModule {
  id: string
  name: string
  icon: string
  route: {
    path: string
    component: React.LazyComponent
  }
  navOrder: number                    // 侧边栏排序
  adapters?: Record<string, Function> // 模块需要的 adapter 扩展
}

// modules/observe/index.ts
import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'observe',
  name: '可观测',
  icon: '📊',
  route: {
    path: '/observe',
    component: lazy(() => import('./ObservePage')),
  },
  navOrder: 20,
} satisfies ClawModule

// app/App.tsx — 自动收集
const modules = import.meta.glob('../modules/*/index.ts', { eager: true })
const routes = Object.values(modules).map(m => m.default.route)
const navItems = Object.values(modules)
  .sort((a, b) => a.default.navOrder - b.default.navOrder)
  .map(m => ({ path: m.default.route.path, label: m.default.name, icon: m.default.icon }))
```

**效果：** 新增页面只需创建 `modules/xxx/index.ts`，无需改 App.tsx 或 Layout.tsx。

### 3.4 adapter 拆分

当前单文件 → 按工具拆分，统一错误处理：

```typescript
// shared/adapters/types.ts
export interface AdapterResult<T> {
  success: boolean
  data?: T
  error?: string
}

// shared/adapters/clawprobe.ts
export async function getClawProbeCost(period: 'day'|'week'|'month'): Promise<AdapterResult<CostData>> {
  try {
    const raw = await execCommand('clawprobe', ['cost', `--${period}`, '--json'])
    return { success: true, data: JSON.parse(raw) }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
```

**效果：** 每个工具一个文件，类型明确，可独立测试，新增工具不影响已有代码。

### 3.5 数据获取 Hook

替代各页面重复的 loading/error 模板：

```typescript
// shared/hooks/useAdapterCall.ts
export function useAdapterCall<T>(
  fetcher: () => Promise<AdapterResult<T>>,
  options?: { pollInterval?: number; deps?: any[] }
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => { /* ... */ }, [fetcher])

  useEffect(() => {
    refetch()
    if (options?.pollInterval) {
      const id = setInterval(refetch, options.pollInterval)
      return () => clearInterval(id)
    }
  }, options?.deps ?? [])

  return { data, loading, error, refetch }
}

// 页面使用 — 从 300 行降到 30 行
export default function ObservePage() {
  const { data: cost, loading } = useAdapterCall(
    () => getClawProbeCost('day'),
    { pollInterval: 30000 }
  )
  if (loading) return <LoadingState />
  return <CostCard data={cost} />
}
```

### 3.6 通用 UI 组件

提取重复模式，统一视觉语言：

| 组件 | 复用场景 |
|------|---------|
| `StatusCard` | Dashboard/Gateway/Memory 状态卡片 |
| `DataTable` | 会话列表/记忆列表/技能列表/Agent 列表 |
| `ChartPanel` | 费用趋势/Token 柱状图/模型分布 |
| `AlertBanner` | 超支告警/上下文快满/截断检测 |
| `LoadingState` | 全局加载骨架屏 |
| `ErrorBoundary` | 页面级错误兜底 |
| `PasswordField` | API Key 脱敏显示 |
| `ProgressBar` | 安装进度/上下文占用/预算进度 |

---

## 四、测试策略

### 4.1 两层测试体系

```
┌─────────────────────────────────────────────────────┐
│  第二层：UI 冒烟测试 (dev-browser / Playwright)      │
│  → 启动 dev server → 走完关键路径 → 截图验证         │
│  → 每个里程碑交付时执行                               │
├─────────────────────────────────────────────────────┤
│  第一层：单元测试 (Vitest)                           │
│  → adapter 函数 mock CLI 输出 → 验证解析逻辑         │
│  → useAdapterCall Hook → 验证状态流转                │
│  → 每次 commit / CI 自动执行                         │
└─────────────────────────────────────────────────────┘
```

### 4.2 单元测试（Vitest）

**配置：** `vitest.config.ts` + `@testing-library/react` + `jsdom`

**测试范围：** 新架构下的 `shared/` 层，不测旧页面

| 测试对象 | 测什么 | mock 方式 |
|---------|--------|----------|
| `shared/adapters/clawprobe.ts` | 给 ClawProbe JSON 输出 → 验证解析出正确的费用/Token 数据 | mock `execCommand` |
| `shared/adapters/powermem.ts` | 给 pmem list 输出 → 验证记忆列表格式 | mock `execCommand` |
| `shared/adapters/clawhub.ts` | 给 clawhub list 输出 → 验证技能列表格式 | mock `execCommand` |
| `shared/adapters/platform.ts` | mock 版本检测命令 → 验证环境检测结果 | mock child_process |
| `shared/adapters/mirror.ts` | mock fetch 超时 → 验证自动切换镜像 | mock fetch |
| `shared/hooks/useAdapterCall.ts` | 验证 loading→data→error 流转、polling、refetch | `renderHook` + mock adapter |

**示例：**

```typescript
// shared/adapters/__tests__/clawprobe.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getClawProbeCost } from '../clawprobe'

vi.mock('../platform', () => ({
  execCommand: vi.fn()
}))

describe('getClawProbeCost', () => {
  it('parses daily cost correctly', async () => {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockResolvedValue(
      JSON.stringify({ total: 1.23, by_model: { 'gpt-4': 0.8, 'glm-5': 0.43 } })
    )
    const result = await getClawProbeCost('day')
    expect(result.success).toBe(true)
    expect(result.data?.total).toBe(1.23)
  })

  it('returns structured error when clawprobe not installed', async () => {
    const { execCommand } = await import('../platform')
    vi.mocked(execCommand).mockRejectedValue(new Error('command not found'))
    const result = await getClawProbeCost('day')
    expect(result.success).toBe(false)
    expect(result.error).toContain('command not found')
  })
})
```

**关键原则：**
- 不依赖 OpenClaw 真实安装，纯 mock，本地秒跑
- 每个新 adapter 文件同步写测试，不欠债
- CI 中 `vitest run` 卡质量，测试不过不合并

### 4.3 UI 冒烟测试（dev-browser）

用 dev-browser skill 做可视化验证，不需要额外安装 Playwright。在里程碑节点手动执行。

**冒烟路径：**

| 步骤 | 操作 | 验证点 |
|------|------|--------|
| 1 | 打开 `http://localhost:5173` | 页面加载无白屏 |
| 2 | 等待 StartupDetector | 看到 Dashboard 或安装向导 |
| 3 | 点击侧边栏"网关" | Gateway 页面渲染，状态灯可见 |
| 4 | 点击侧边栏"配置" | Config 页面渲染，字段可编辑 |
| 5 | 点击侧边栏"可观测" | Observe 页面渲染，费用卡片可见 |
| 6 | 点击侧边栏"记忆" | Memory 页面渲染，记忆列表可见 |
| 7 | 点击侧边栏"技能" | Skills 页面渲染，非 Mock 数据 |
| 8 | 点击侧边栏"设置" | Settings 页面渲染，主题切换生效 |

每步截图存入 `tests/screenshots/`，全套 2-3 分钟。

**执行时机：**
- Day 2 结束（阶段 2 里程碑）：走 Dashboard/网关/配置/技能 4 页
- Day 7 发布前（阶段 6 里程碑）：走全部 8+ 页

### 4.4 测试演进路线

| 阶段 | 测试能力 | 覆盖范围 |
|------|---------|---------|
| **第一周** | Vitest 单元 + dev-browser 冒烟 | 新 adapter/hook + 关键页面路径 |
| **第二周** | 旧页面迁移后补单元测试 | 全部 adapter + hook |
| **第三周** | Playwright E2E 自动化 | 安装流程 + 核心操作路径，CI 自动跑 |
| **第四周** | 插件测试工具 | 插件开发者可用的测试 helper |

### 4.5 第一周不做

| 不做 | 原因 |
|------|------|
| 旧页面组件测试 | 第二周迁移到新架构后再补 |
| E2E 自动化流水线 | 需要 CI 里跑 headless browser，第三周加 |
| Tauri 端集成测试 | 需要真实 Tauri 环境，暂手动验证 |
| 覆盖率指标 | 第三周测试基础完善后再设 |

---

## 五、重构路线图

### Phase 1：基础规范（第一周内，随功能开发同步执行）

| 编号 | 任务 | 说明 |
|------|------|------|
| R-01 | ESLint + Prettier + Vitest 配置 | 统一代码风格 + 测试框架，CI 检查 |
| R-02 | commit 规范 | `feat:` / `fix:` / `refactor:` / `docs:` 前缀 |
| R-03 | 新代码遵循模块结构 | 新建的 Observe/Memory 页面按 `modules/xxx/` 结构组织 |
| R-04 | 新 adapter 函数必须有类型 + 测试 | 入参 + 返回值 + 错误结构 + 对应 `.test.ts` |
| R-05 | CLI 调用统一 `--json` | 返回 `AdapterResult<T>` |
| R-06 | 新页面用 `useAdapterCall` Hook | 不再复制粘贴 loading/error 模板 |
| R-07 | 开发中记录架构问题到 `ARCH_NOTES.md` | 为 Phase 2 积累素材 |

### Phase 2：核心重构（第二周）

| 编号 | 任务 | 说明 |
|------|------|------|
| R-08 | adapter 拆分 | 单文件 → 按工具拆（openclaw/clawprobe/powermem/clawhub） |
| R-09 | `useAdapterCall` Hook 完善 | 缓存、轮询、错误重试、stale-while-revalidate |
| R-10 | 旧页面迁移到模块结构 | Dashboard/Gateway/Config 等迁入 `modules/` |
| R-11 | Zustand store 激活或替换 | 全局状态统一管理，移除各页面独立 useState |
| R-12 | ErrorBoundary 全局加载 | 页面级 + 应用级双重兜底 |
| R-13 | 环境检测统一 | 三处合并为 `shared/adapters/platform.ts` 单一来源 |
| R-14 | config 类型严格化 | `any` → Zod schema 校验 + 强类型 |
| R-15 | 旧页面补单元测试 | 迁移后的模块补齐 adapter + hook 测试 |

### Phase 3：工程化提升（第三周）

| 编号 | 任务 | 说明 |
|------|------|------|
| R-16 | Playwright E2E 测试 | 安装流程 + 核心操作路径自动化 |
| R-17 | GitHub Actions CI 完善 | lint → unit test → E2E → build → 三平台打包 |
| R-18 | 通用 UI 组件库提取 | StatusCard / DataTable / ChartPanel 等 |
| R-19 | i18n 框架（react-i18next） | 中/英双语，提取硬编码文案 |
| R-20 | CONTRIBUTING.md | 环境搭建 + 目录说明 + 开发流程 + PR 规范 |
| R-21 | 覆盖率指标 | 设定 adapter 层 80%+ 覆盖率目标 |

### Phase 4：插件系统（第四周）

| 编号 | 任务 | 说明 |
|------|------|------|
| R-22 | ClawModule 接口定义 | 模块注册标准：路由 + 导航 + 状态 + adapter |
| R-23 | 模块自动发现 | `import.meta.glob` 收集 modules/*/index.ts |
| R-24 | 动态路由注册 | App.tsx 从模块列表生成路由，支持懒加载 |
| R-25 | 动态导航注册 | Layout 从模块列表生成菜单，支持排序 |
| R-26 | 事件总线 | 跨模块通信（配置变更通知、状态同步） |
| R-27 | 插件开发文档 | 模板 + 示例 + API 参考 |
| R-28 | 插件测试工具 | 插件开发者可用的 mock helper + 测试模板 |

### Phase 5：高级能力（第五周+）

| 编号 | 任务 | 说明 |
|------|------|------|
| R-29 | Python sidecar 架构 | DeepAgents 进程管理、IPC 协议、生命周期 |
| R-30 | 本地代理层 (Local Proxy) | Rust 实现 HTTP 代理，请求拦截 + 计费 + 路由 |
| R-31 | seekdb 集成 | 替换 SQLite 作为 PowerMem 存储后端 |
| R-32 | 实时更新（WebSocket） | 日志流、状态变更推送、费用实时更新 |

---

## 五、开发规范（即刻生效）

### 5.1 文件规范

| 类型 | 命名 | 示例 |
|------|------|------|
| 页面组件 | PascalCase | `ObservePage.tsx` |
| 通用组件 | PascalCase | `StatusCard.tsx` |
| Hook | camelCase，use 前缀 | `useAdapterCall.ts` |
| Adapter | camelCase，按工具命名 | `clawprobe.ts` |
| 类型 | camelCase | `types/config.ts` |
| 模块入口 | 固定 `index.ts` | `modules/observe/index.ts` |

### 5.2 代码规范

| 规则 | 要求 |
|------|------|
| adapter 返回值 | 统一 `AdapterResult<T>` 结构 |
| CLI 调用 | 必须使用 `--json` 输出 |
| 错误处理 | adapter 层 try-catch + 结构化错误；UI 层显示友好信息 |
| 组件结构 | 数据获取（Hook）→ 业务逻辑（Handler）→ UI 渲染（JSX） |
| 全局 CSS | 禁止。使用 Tailwind 类名 |
| `any` 类型 | 新代码禁止。必须定义明确类型 |
| 硬编码字符串 | UI 文案放 i18n 文件（第三周 i18n 框架就位后迁移） |

### 5.3 Git 规范

| 规则 | 格式 |
|------|------|
| commit | `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` 前缀 |
| 分支 | `feat/xxx` / `fix/xxx` / `refactor/xxx` |
| PR | 标题简洁，描述包含改动范围和测试方法 |
| merge | Squash merge 到 main |

---

## 六、插件开发者指南（预告）

> Phase 4 完成后发布完整指南。以下为接口预览。

### 创建一个新能力模块

```bash
# 第四周后将提供脚手架
npx clawmaster create-module my-feature
```

生成结构：
```
modules/my-feature/
├── index.ts              # 模块注册
├── MyFeaturePage.tsx      # 页面
├── hooks/
│   └── useMyFeature.ts    # 数据 Hook
└── components/
    └── MyWidget.tsx        # 子组件
```

### 模块注册

```typescript
// modules/my-feature/index.ts
import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'my-feature',
  name: '我的功能',
  icon: '🔧',
  route: {
    path: '/my-feature',
    component: lazy(() => import('./MyFeaturePage')),
  },
  navOrder: 100,
} satisfies ClawModule
```

放进 `modules/` 目录即自动注册，无需改任何其他文件。

---

*本文档随项目演进持续更新。*
