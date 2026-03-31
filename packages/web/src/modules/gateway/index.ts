import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'gateway',
  name: '网关',
  icon: '🔌',
  navOrder: 20,
  route: {
    path: '/gateway',
    LazyPage: lazy(() => import('./GatewayPage')),
  },
} satisfies ClawModule
