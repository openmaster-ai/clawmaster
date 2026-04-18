# UI 测试用例

龙虾管理大师的 UI 冒烟测试用例集。

## 用例清单

| 文件 | 用例数 | 覆盖范围 |
|------|--------|---------|
| `01-setup-wizard.yaml` | 7 | 安装向导 demo 全流程（检测→就绪→进入主界面/CapabilityGuard/回归用例） |
| `02-page-navigation.yaml` | 15 | 全部 15 个页面导航可达性 + 渲染验证 |
| `03-memory-module.yaml` | 11 | 记忆管理（托管 PowerMem 基础层/旧版导入与对比证明 + OpenClaw bridge 漂移/同步就绪 + 原生概览/搜索/文件详情/删除确认/区块 loading/FTS 降级提示） |
| `04-observe-module.yaml` | 10 | 可观测 Dashboard（CapabilityGuard/费用卡片/图表/健康度/建议/会话） |
| `05-config-and-security.yaml` | 18 | 配置编辑 + API Key 脱敏 + 主题切换 + 版本更新 + Profile 与横幅联动 |
| `06-skills-marketplace.yaml` | 13 | 技能市场（ClawHub 前置/4 个重点技能/过滤/SkillGuard/运行时启停/OpenClaw WebUI 效果） |
| `07-setup-install-real.yaml` | 16 | 安装向导真实安装全流程（检测/卸载/安装/CapabilityGuard/错误处理/API） |
| `08-onboarding-config.yaml` | 17 | 安装后配置引导（初始化/API Key/模型/网关/通道/跳过/汇总） |
| `09-gateway-module.yaml` | 6 | 网关管理（状态指示/启动停止/配置概览/Token 复制/重启） |
| `10-mcp-servers.yaml` | 8 | MCP 服务器管理（推荐配置/导入/手动添加/安装进度/OpenClaw WebUI 可见性） |
| `11-sessions-module.yaml` | 8 | 会话管理（列表/Agent 过滤/Token 进度条/对话历史/清理/轮询与 useAdapterCall 稳定性） |
| `12-channels-module.yaml` | 11 | 通道管理（推荐入口/微信扫码流/上下文日志/列表/编辑器/验证连接/启用禁用/账号/移除） |
| `13-models-module.yaml` | 10 | 模型配置（赞助商优先级/令牌入口/添加面板/测试连接/Key 脱敏/默认标识/重置行为） |
| `14-agents-module.yaml` | 8 | 代理管理（默认配置/列表/路由绑定/空状态/main 保护/死按钮回归） |
| `15-plugins-module.yaml` | 9 | 插件管理（运行快照/安装清理/筛选/启停/卸载确认/描述展开/OpenClaw WebUI 效果） |
| `16-docs-module.yaml` | 5 | 文档中心（快速链接/搜索交互/结果展示/外部链接/实时文档回退） |
| `17-logs-module.yaml` | 6 | 日志查看（列表/级别过滤/搜索/颜色编码/刷新/模块上下文入口） |
| `18-dashboard-module.yaml` | 11 | 概览页面（系统信息/网关状态/通道/速览卡片/快捷操作/任务清单/页脚一致性） |
| `19-cross-module-workflows.yaml` | 6 | 跨模块主流程（onboarding→模型→网关→首聊 / 通道→上下文日志 / 技能插件MCP→OpenClaw WebUI 生效） |
| `20-command-palette.yaml` | 7 | 共享命令面板（快捷键打开/页面跳转/区块跳转/主题操作/空状态/移动端入口） |
| `21-ocr-workflow.yaml` | 5 | OCR 主流程（页面引导/保存配置/样例解析/上传解析/OpenClaw WebUI 技能执行） |
| `22-cron-module.yaml` | 5 | Cron 模块（页面渲染/网关依赖/创建对话框/运行记录/筛选器） |
| **合计** | **212** | |

## 用例格式

每个 `.yaml` 文件包含：

```yaml
suite: 套件标识
name: 套件名称
description: 详细说明
preconditions: 前置条件
viewport: 视口尺寸

cases:
  - id: 唯一标识
    name: 用例名称
    preconditions: 用例级前置条件（可选）
    steps:
      - action: navigate / click / fill / wait / screenshot / observe / select / scroll_to
        target: 操作目标（text / role / selector）
        value: 输入值（可选）
        duration: 等待时间（可选）
    assertions:
      - 断言描述（自然语言，可映射到具体选择器验证）
```

## 选择器约定

- `text("...")` — 按文本内容匹配
- `role(link, "...")` — 按 ARIA role + accessible name 匹配
- `input[placeholder*="..."]` — CSS 选择器
- `textarea[placeholder*="..."]` — CSS 选择器

## 执行方式

用例与执行工具解耦，可用以下任意工具实现执行层：

| 工具 | 适用场景 |
|------|---------|
| dev-browser | 开发阶段手动验证 |
| Playwright | CI 自动化 |
| Cypress | E2E 测试 |
| 手动 | 截图对照检查 |

## Native Desktop E2E Track

桌面原生 E2E 单独跟踪于 [#29](https://github.com/openmaster-ai/clawmaster/issues/29)，规划文档见 [DESKTOP_E2E_ROLLOUT.md](/Users/haili/workspaces/clawmaster/tests/ui/DESKTOP_E2E_ROLLOUT.md)。

当前建议：
- 日常 UI 改动继续优先使用 `dev-browser` + YAML 描述流做快速验证
- Linux / Windows 的 Tauri 原生冒烟覆盖单独建设，不与浏览器描述流混用
- 在原生 E2E 落地前，发布验证仍以 `19-cross-module-workflows.yaml` 为主
- 本地 macOS 开发机可先运行 `npm run test:desktop`，执行真实 Tauri 构建 + 启动冒烟

## dev-browser Quick Verification (Recommended)

During development, use headless Playwright via `dev-browser` for rapid visual + functional checks:

```bash
# 1. Start services
npm run dev:backend   # port 3001
npm run dev           # port 3000

# 2. In dev-browser session:
page.goto('http://localhost:3000/observe')
page.waitForTimeout(3000)
page.screenshot({ path: '/tmp/observe.png' })

# 3. Extract text to verify data loaded
page.evaluate(() => document.body.innerText)

# 4. Interact and re-verify
page.click('text=Refresh')
page.waitForTimeout(2000)
page.screenshot({ path: '/tmp/observe-refreshed.png' })
```

**Checklist per page:**
- Screenshot renders correctly (no blank/broken layout)
- Text extraction shows expected content (no missing i18n keys like `mcp.title`)
- No 500 errors in browser console (`page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('api') && r.responseStatus >= 500))`)
- Responsive check: `page.setViewportSize({ width: 375, height: 812 })` + screenshot

**Extra checks for runtime-sensitive flows:**
- If the profile is already configured, verify the app lands in the main shell rather than setup/onboarding.
- Compare the UI-reported OpenClaw version and config path against the real host output of `openclaw --version` and the active profile path.
- For desktop verification, treat any native shell that silently falls back to browser `/api` behavior as a regression even if the page still renders.

**When to run:**
- After any UI component change
- After i18n key additions/modifications
- After adapter/API changes that affect displayed data
- Before committing structural refactors

## Golden Regression Checklist

发布前，至少手动跑完以下 6 条主流程。优先参考 [19-cross-module-workflows.yaml](/Users/haili/workspaces/clawmaster/tests/ui/19-cross-module-workflows.yaml)：

记录证据时可直接使用 [EVIDENCE_TEMPLATE.md](/Users/haili/workspaces/clawmaster/tests/ui/EVIDENCE_TEMPLATE.md)。

1. Onboarding → 模型配置
   确认初始化、凭证填写、默认模型选择能够一路完成，没有阻断性报错。
2. 模型配置 → 网关启动 → OpenClaw WebUI 首聊
   确认网关能启动，OpenClaw WebUI 能打开并完成首次对话。
3. 通道配置 → 上下文日志
   确认推荐入口易于进入，配置失败时能直接看到当前模块相关日志。
4. 技能安装或启用 → OpenClaw WebUI 生效
   确认新会话能识别已启用技能，禁用后能力消失。
5. 插件启用或禁用 → OpenClaw WebUI 生效
   确认工具、通道或模型相关能力随插件状态同步变化。
6. MCP 启用 → OpenClaw WebUI 生效
   确认启用的服务能在 OpenClaw WebUI 被识别，禁用后不可用。

建议每条流程至少保留：
- 1 张 ClawMaster 截图
- 1 张 OpenClaw WebUI 截图
- 1 条能证明状态变化真实生效的文本或行为证据

## 逐步丰富

每次新增功能或修复 Bug 时，在对应 `.yaml` 文件中追加用例。
每次发布前执行全量回归。
