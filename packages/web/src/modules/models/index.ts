import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'models',
  nameKey: 'nav.models',
  icon: '🤖',
  navOrder: 40,
  route: {
    path: '/models',
    LazyPage: lazy(() => import('./ModelsPage')),
  },
} satisfies ClawModule
