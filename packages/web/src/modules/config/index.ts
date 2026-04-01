import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'config',
  nameKey: 'nav.config',
  icon: '⚙️',
  navOrder: 70,
  route: {
    path: '/config',
    LazyPage: lazy(() => import('./ConfigPage')),
  },
} satisfies ClawModule
