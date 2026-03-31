import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'settings',
  name: '设置',
  icon: '🔧',
  navOrder: 100,
  route: {
    path: '/settings',
    LazyPage: lazy(() => import('./SettingsPage')),
  },
} satisfies ClawModule
