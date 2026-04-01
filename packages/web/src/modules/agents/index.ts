import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'agents',
  nameKey: 'nav.agents',
  icon: '🎭',
  navOrder: 60,
  route: {
    path: '/agents',
    LazyPage: lazy(() => import('./AgentsPage')),
  },
} satisfies ClawModule
