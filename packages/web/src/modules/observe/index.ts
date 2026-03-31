import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'observe',
  name: '监控',
  icon: '📡',
  navOrder: 15,
  route: {
    path: '/observe',
    LazyPage: lazy(() => import('./ObservePage')),
  },
} satisfies ClawModule
