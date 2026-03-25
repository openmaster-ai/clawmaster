import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'memory',
  name: '记忆',
  icon: '🧠',
  route: {
    path: '/memory',
    component: lazy(() => import('./MemoryPage')),
  },
  navOrder: 25,
} satisfies ClawModule
