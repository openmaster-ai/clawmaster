import { lazy } from 'react'
import type { ClawModule } from '@/types/module'
import { getIsTauri } from '@/shared/adapters/platform'

export default {
  id: 'wiki',
  nameKey: 'nav.wiki',
  icon: 'book-open',
  group: 'manage',
  navOrder: 29,
  showInNav: !getIsTauri(),
  route: {
    path: '/wiki',
    LazyPage: lazy(() => import('./WikiPage')),
  },
} satisfies ClawModule
