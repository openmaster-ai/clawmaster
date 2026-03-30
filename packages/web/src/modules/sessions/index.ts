import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'sessions',
  name: 'sessions',
  icon: 'message-circle',
  route: {
    path: '/sessions',
    component: lazy(() => import('./SessionsPage')),
  },
  navOrder: 30,
} satisfies ClawModule
