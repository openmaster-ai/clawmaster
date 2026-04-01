import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'skills',
  nameKey: 'nav.skills',
  icon: '⚡',
  navOrder: 50,
  route: {
    path: '/skills',
    LazyPage: lazy(() => import('./SkillsPage')),
  },
} satisfies ClawModule
