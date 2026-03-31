import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'agents',
  name: '代理',
  icon: '🎭',
  navOrder: 60,
  route: {
    path: '/agents',
    LazyPage: lazy(() => import('./AgentsPage')),
  },
} satisfies ClawModule
