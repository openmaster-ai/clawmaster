import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'cron',
  nameKey: 'nav.cron',
  icon: 'timer-reset',
  group: 'main',
  navOrder: 27,
  route: {
    path: '/cron',
    LazyPage: lazy(() => import('./CronPage')),
  },
} satisfies ClawModule
