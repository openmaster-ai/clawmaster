# UI 测试用例

龙虾管理大师的 UI 冒烟测试用例集。

## 用例清单

| 文件 | 用例数 | 覆盖范围 |
|------|--------|---------|
| `01-setup-wizard.yaml` | 5 | 安装向导 demo 全流程（检测→就绪→安装→完成→进入主界面） |
| `02-page-navigation.yaml` | 15 | 全部 15 个页面导航可达性 + 渲染验证 |
| `03-memory-module.yaml` | 10 | 记忆管理完整功能（降级/健康/列表/搜索/添加/编辑/删除/Agent 切换） |
| `04-observe-module.yaml` | 9 | 可观测 Dashboard（降级/费用卡片/图表/健康度/建议/会话） |
| `05-config-and-security.yaml` | 10 | 配置编辑 + API Key 脱敏 + 预算 + 主题切换 |
| `06-skills-marketplace.yaml` | 10 | 技能市场（分类过滤/场景推荐/精选目录/安装卸载/市场搜索） |
| `07-setup-install-real.yaml` | 16 | 安装向导真实安装全流程（检测/卸载/安装/CapabilityGuard/错误处理/API） |
| `08-onboarding-config.yaml` | 17 | 安装后配置引导（初始化/API Key/模型/网关/通道/跳过/汇总） |
| `09-gateway-module.yaml` | 6 | 网关管理（状态指示/启动停止/配置概览/Token 复制/重启） |
| `10-mcp-servers.yaml` | 8 | MCP 服务器管理（目录浏览/分类过滤/安装卸载/环境变量/自定义服务器） |
| `11-sessions-module.yaml` | 6 | 会话管理（列表/Agent 过滤/Token 进度条/对话历史/清理） |
| `12-channels-module.yaml` | 7 | 通道管理（列表/添加/编辑器/验证连接/启用禁用/账号/移除） |
| `13-models-module.yaml` | 6 | 模型配置（提供商列表/添加面板/测试连接/Key 脱敏/默认标识） |
| `14-agents-module.yaml` | 5 | 代理管理（默认配置/列表/路由绑定/空状态/main 保护） |
| `15-plugins-module.yaml` | 7 | 插件管理（表格/搜索/状态过滤/启用禁用/安装卸载/描述展开） |
| `16-docs-module.yaml` | 4 | 文档中心（快速链接/搜索交互/结果展示/外部链接） |
| `17-logs-module.yaml` | 5 | 日志查看（列表/级别过滤/搜索/颜色编码/刷新） |
| `18-dashboard-module.yaml` | 6 | 概览页面（系统信息/网关状态/通道/速览卡片/快捷操作/模型代理） |
| **合计** | **152** | |

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

**When to run:**
- After any UI component change
- After i18n key additions/modifications
- After adapter/API changes that affect displayed data
- Before committing structural refactors

## 逐步丰富

每次新增功能或修复 Bug 时，在对应 `.yaml` 文件中追加用例。
每次发布前执行全量回归。
