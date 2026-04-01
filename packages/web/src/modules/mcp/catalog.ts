import type { McpServerConfig } from '@/shared/adapters/mcp'

// ─── 类型定义 ───

export type McpCategory = 'developer' | 'productivity' | 'utilities' | 'monitoring'

export interface McpEnvVar {
  key: string
  labelKey: string
  required: boolean
  sensitive: boolean
}

export interface CatalogMcpServer {
  id: string
  name: string
  descriptionKey: string
  package: string
  category: McpCategory
  envVars: McpEnvVar[]
  defaultArgs?: string[]
  docsUrl?: string
}

// ─── 精选目录 ───

export const MCP_CATALOG: CatalogMcpServer[] = [
  // Developer Tools
  {
    id: 'context7',
    name: 'Context7',
    descriptionKey: 'mcp.catalog.context7.desc',
    package: '@upstash/context7-mcp',
    category: 'developer',
    envVars: [],
    docsUrl: 'https://github.com/upstash/context7',
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    descriptionKey: 'mcp.catalog.deepwiki.desc',
    package: 'deepwiki-mcp',
    category: 'developer',
    envVars: [],
    docsUrl: 'https://deepwiki.com',
  },
  {
    id: 'github',
    name: 'GitHub',
    descriptionKey: 'mcp.catalog.github.desc',
    package: '@modelcontextprotocol/server-github',
    category: 'developer',
    envVars: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', labelKey: 'mcp.env.githubToken', required: true, sensitive: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers',
  },
  // Productivity
  {
    id: 'linear',
    name: 'Linear',
    descriptionKey: 'mcp.catalog.linear.desc',
    package: 'linear-mcp',
    category: 'productivity',
    envVars: [
      { key: 'LINEAR_API_KEY', labelKey: 'mcp.env.linearKey', required: true, sensitive: true },
    ],
    docsUrl: 'https://linear.app',
  },
  {
    id: 'notion',
    name: 'Notion',
    descriptionKey: 'mcp.catalog.notion.desc',
    package: '@notionhq/notion-mcp-server',
    category: 'productivity',
    envVars: [
      { key: 'NOTION_API_TOKEN', labelKey: 'mcp.env.notionToken', required: true, sensitive: true },
    ],
    docsUrl: 'https://developers.notion.com',
  },
  {
    id: 'slack',
    name: 'Slack',
    descriptionKey: 'mcp.catalog.slack.desc',
    package: '@modelcontextprotocol/server-slack',
    category: 'productivity',
    envVars: [
      { key: 'SLACK_BOT_TOKEN', labelKey: 'mcp.env.slackToken', required: true, sensitive: true },
    ],
  },
  // Utilities
  {
    id: 'filesystem',
    name: 'Filesystem',
    descriptionKey: 'mcp.catalog.filesystem.desc',
    package: '@modelcontextprotocol/server-filesystem',
    category: 'utilities',
    envVars: [],
    defaultArgs: ['/home'],
  },
  {
    id: 'memory',
    name: 'Memory',
    descriptionKey: 'mcp.catalog.memory.desc',
    package: '@modelcontextprotocol/server-memory',
    category: 'utilities',
    envVars: [],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    descriptionKey: 'mcp.catalog.sequentialThinking.desc',
    package: '@modelcontextprotocol/server-sequential-thinking',
    category: 'utilities',
    envVars: [],
  },
  // Monitoring
  {
    id: 'sentry',
    name: 'Sentry',
    descriptionKey: 'mcp.catalog.sentry.desc',
    package: '@sentry/mcp-server',
    category: 'monitoring',
    envVars: [
      { key: 'SENTRY_AUTH_TOKEN', labelKey: 'mcp.env.sentryToken', required: true, sensitive: true },
    ],
    docsUrl: 'https://sentry.io',
  },
]

export const CATEGORY_ORDER: McpCategory[] = ['developer', 'productivity', 'utilities', 'monitoring']

export const CATEGORY_COLORS: Record<McpCategory, string> = {
  developer: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  productivity: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  utilities: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  monitoring: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
}

// ─── 工具函数 ───

export function buildMcpServerConfig(
  catalog: CatalogMcpServer,
  env: Record<string, string>,
  extraArgs?: string[],
): McpServerConfig {
  return {
    command: 'npx',
    args: ['-y', catalog.package, ...(extraArgs ?? catalog.defaultArgs ?? [])],
    env,
    enabled: true,
  }
}
