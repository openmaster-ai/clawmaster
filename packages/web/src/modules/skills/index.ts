import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'skills',
  name: '技能',
  icon: '⚡',
  navOrder: 50,
  route: {
    path: '/skills',
    LazyPage: lazy(() => import('./SkillsPage')),
  },
} satisfies ClawModule
