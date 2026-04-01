import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'docs',
  nameKey: 'nav.docs',
  icon: '📚',
  navOrder: 80,
  route: {
    path: '/docs',
    LazyPage: lazy(() => import('./DocsPage')),
  },
} satisfies ClawModule
