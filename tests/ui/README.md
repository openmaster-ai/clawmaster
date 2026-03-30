# UI 测试用例

龙虾管理大师的 UI 冒烟测试用例集。

## 用例清单

| 文件 | 用例数 | 覆盖范围 |
|------|--------|---------|
| `01-setup-wizard.yaml` | 5 | 安装向导 demo 全流程（检测→就绪→安装→完成→进入主界面） |
| `02-page-navigation.yaml` | 12 | 全部 12 个页面导航可达性 + 渲染验证 |
| `03-memory-module.yaml` | 10 | 记忆管理完整功能（降级/健康/列表/搜索/添加/编辑/删除/Agent 切换） |
| `04-observe-module.yaml` | 9 | 可观测 Dashboard（降级/费用卡片/图表/健康度/建议/会话） |
| `05-config-and-security.yaml` | 10 | 配置编辑 + API Key 脱敏 + 预算 + 主题切换 |
| `06-skills-marketplace.yaml` | 6 | 技能市场（场景推荐/列表/搜索/安装/卸载） |
| `07-setup-install-real.yaml` | 16 | 安装向导真实安装全流程（检测/卸载/安装/CapabilityGuard/错误处理/API） |
| `08-onboarding-config.yaml` | 17 | 安装后配置引导（初始化/API Key/模型/网关/通道/跳过/汇总） |
| **合计** | **85** | |

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

## 逐步丰富

每次新增功能或修复 Bug 时，在对应 `.yaml` 文件中追加用例。
每次发布前执行全量回归。
