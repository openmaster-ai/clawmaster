import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'capabilities',
  nameKey: 'nav.capabilities',
  icon: 'sparkles',
  group: 'main',
  navOrder: 21,
  route: {
    path: '/capabilities',
    LazyPage: lazy(() => import('./CapabilitiesPage')),
  },
} satisfies ClawModule
