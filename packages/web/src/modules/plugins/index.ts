import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'plugins',
  nameKey: 'nav.plugins',
  icon: '🔌',
  /** Nav order: after Skills (50), before Agents (60) */
  navOrder: 52,
  route: {
    path: '/plugins',
    LazyPage: lazy(() => import('./PluginsPage')),
  },
} satisfies ClawModule
