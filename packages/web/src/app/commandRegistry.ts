import type { ClawModule } from '@/types/module'
import { isWindowsHostPlatform } from '@/shared/hostPlatform'
import { PAGE_META } from './navigationMeta'

export type CommandKind = 'page' | 'section' | 'action'

interface BaseCommandDescriptor {
  id: string
  kind: CommandKind
  icon: string
  keywords: string[]
}

export interface PageCommandDescriptor extends BaseCommandDescriptor {
  kind: 'page'
  path: string
  labelKey: string
  descriptionKey: string
}

export interface SectionCommandDescriptor extends BaseCommandDescriptor {
  kind: 'section'
  path: string
  hash: string
  labelKey: string
  descriptionKey: string
}

export interface ActionCommandDescriptor extends BaseCommandDescriptor {
  kind: 'action'
  actionId: 'toggle-theme'
  labelKey: string
  descriptionKey: string
}

export type CommandDescriptor =
  | PageCommandDescriptor
  | SectionCommandDescriptor
  | ActionCommandDescriptor

const CURATED_SECTION_COMMANDS: SectionCommandDescriptor[] = [
  {
    id: 'capability-status',
    kind: 'section',
    icon: 'sparkles',
    path: '/capabilities',
    hash: 'capability-status',
    labelKey: 'command.jump.capabilityStatus',
    descriptionKey: 'command.jump.capabilityStatusDesc',
    keywords: ['capabilities', 'capability center', 'extensions', 'status', 'verify'],
  },
  {
    id: 'settings-runtime',
    kind: 'section',
    icon: 'settings-2',
    path: '/settings',
    hash: 'settings-runtime',
    labelKey: 'command.jump.settingsRuntime',
    descriptionKey: 'command.jump.settingsRuntimeDesc',
    keywords: ['settings', 'runtime', 'wsl', 'native'],
  },
  {
    id: 'settings-profile',
    kind: 'section',
    icon: 'settings-2',
    path: '/settings',
    hash: 'settings-profile',
    labelKey: 'command.jump.settingsProfile',
    descriptionKey: 'command.jump.settingsProfileDesc',
    keywords: ['settings', 'profile', 'config path', 'workspace'],
  },
  {
    id: 'settings-logs',
    kind: 'section',
    icon: 'settings-2',
    path: '/settings',
    hash: 'settings-logs',
    labelKey: 'command.jump.settingsLogs',
    descriptionKey: 'command.jump.settingsLogsDesc',
    keywords: ['settings', 'logs', 'diagnostics', 'debug'],
  },
  {
    id: 'gateway-runtime',
    kind: 'section',
    icon: 'radio',
    path: '/gateway',
    hash: 'gateway-runtime',
    labelKey: 'command.jump.gatewayRuntime',
    descriptionKey: 'command.jump.gatewayRuntimeDesc',
    keywords: ['gateway', 'status', 'start', 'stop'],
  },
  {
    id: 'gateway-config',
    kind: 'section',
    icon: 'radio',
    path: '/gateway',
    hash: 'gateway-config',
    labelKey: 'command.jump.gatewayConfig',
    descriptionKey: 'command.jump.gatewayConfigDesc',
    keywords: ['gateway', 'config', 'port', 'bind', 'auth'],
  },
  {
    id: 'channel-focus',
    kind: 'section',
    icon: 'message-square',
    path: '/channels',
    hash: 'channel-focus',
    labelKey: 'command.jump.channelFocus',
    descriptionKey: 'command.jump.channelFocusDesc',
    keywords: ['channels', 'wechat', 'feishu', 'discord', 'slack'],
  },
  {
    id: 'models-providers',
    kind: 'section',
    icon: 'brain',
    path: '/models',
    hash: 'models-providers',
    labelKey: 'command.jump.modelsProviders',
    descriptionKey: 'command.jump.modelsProvidersDesc',
    keywords: ['models', 'providers', 'api key', 'default model'],
  },
  {
    id: 'skills-featured',
    kind: 'section',
    icon: 'zap',
    path: '/skills',
    hash: 'skills-featured',
    labelKey: 'command.jump.skillsFeatured',
    descriptionKey: 'command.jump.skillsFeaturedDesc',
    keywords: ['skills', 'featured', 'clawhub', 'install'],
  },
  {
    id: 'plugins-groups',
    kind: 'section',
    icon: 'plug',
    path: '/plugins',
    hash: 'plugins-groups',
    labelKey: 'command.jump.pluginsGroups',
    descriptionKey: 'command.jump.pluginsGroupsDesc',
    keywords: ['plugins', 'groups', 'enable', 'disable'],
  },
  {
    id: 'mcp-import',
    kind: 'section',
    icon: 'box',
    path: '/mcp',
    hash: 'mcp-import',
    labelKey: 'command.jump.mcpImport',
    descriptionKey: 'command.jump.mcpImportDesc',
    keywords: ['mcp', 'import', 'claude', 'codex'],
  },
  {
    id: 'observe-runtime',
    kind: 'section',
    icon: 'bar-chart-3',
    path: '/observe',
    hash: 'observe-runtime',
    labelKey: 'command.jump.observeRuntime',
    descriptionKey: 'command.jump.observeRuntimeDesc',
    keywords: ['observe', 'runtime', 'health', 'probe'],
  },
  {
    id: 'config-editor',
    kind: 'section',
    icon: 'file-text',
    path: '/config',
    hash: 'config-editor',
    labelKey: 'command.jump.configEditor',
    descriptionKey: 'command.jump.configEditorDesc',
    keywords: ['config', 'json', 'editor', 'raw'],
  },
]

const ACTION_COMMANDS: ActionCommandDescriptor[] = [
  {
    id: 'toggle-theme',
    kind: 'action',
    actionId: 'toggle-theme',
    icon: 'moon-star',
    labelKey: 'command.action.toggleTheme',
    descriptionKey: 'command.action.toggleThemeDesc',
    keywords: ['theme', 'dark', 'light', 'appearance'],
  },
]

interface CommandRegistryOptions {
  hostPlatform?: string | null
}

export function getCommandDescriptors(
  modules: ClawModule[],
  options: CommandRegistryOptions = {},
): CommandDescriptor[] {
  const pageCommands: PageCommandDescriptor[] = modules
    .filter((module) => module.showInNav !== false)
    .filter((module) => PAGE_META[module.route.path])
    .sort((left, right) => left.navOrder - right.navOrder)
    .map((module) => ({
      id: `page:${module.id}`,
      kind: 'page' as const,
      path: module.route.path,
      icon: module.icon,
      labelKey: module.nameKey,
      descriptionKey: PAGE_META[module.route.path].descriptionKey,
      keywords: [module.id, module.route.path.replace(/^\//, '')],
    }))

  const sectionCommands = CURATED_SECTION_COMMANDS.filter((command) => {
    if (command.id !== 'settings-runtime') return true
    return isWindowsHostPlatform(options.hostPlatform)
  })

  return [...ACTION_COMMANDS, ...pageCommands, ...sectionCommands]
}
