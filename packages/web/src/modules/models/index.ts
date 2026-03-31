import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'models',
  name: '模型',
  icon: '🤖',
  navOrder: 40,
  route: {
    path: '/models',
    LazyPage: lazy(() => import('./ModelsPage')),
  },
} satisfies ClawModule
