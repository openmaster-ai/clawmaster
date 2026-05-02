import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'wiki',
  nameKey: 'nav.wiki',
  icon: 'book-open',
  group: 'manage',
  navOrder: 29,
  route: {
    path: '/wiki',
    LazyPage: lazy(() => import('./WikiPage')),
  },
} satisfies ClawModule
