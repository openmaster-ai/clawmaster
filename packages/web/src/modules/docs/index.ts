import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'docs',
  name: '文档',
  icon: '📚',
  navOrder: 80,
  route: {
    path: '/docs',
    LazyPage: lazy(() => import('./DocsPage')),
  },
} satisfies ClawModule
