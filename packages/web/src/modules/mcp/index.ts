import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'mcp',
  name: 'MCP',
  icon: 'plug',
  route: {
    path: '/mcp',
    component: lazy(() => import('./McpPage')),
  },
  navOrder: 22,
} satisfies ClawModule
