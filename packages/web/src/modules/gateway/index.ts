import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'gateway',
  nameKey: 'nav.gateway',
  icon: '🔌',
  navOrder: 20,
  route: {
    path: '/gateway',
    LazyPage: lazy(() => import('./GatewayPage')),
  },
} satisfies ClawModule
