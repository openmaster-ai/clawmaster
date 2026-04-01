import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'settings',
  nameKey: 'nav.settings',
  icon: '🔧',
  navOrder: 100,
  route: {
    path: '/settings',
    LazyPage: lazy(() => import('./SettingsPage')),
  },
} satisfies ClawModule
