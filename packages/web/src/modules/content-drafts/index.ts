import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'content-drafts',
  nameKey: 'nav.contentDrafts',
  icon: 'file-text',
  navOrder: 41,
  route: {
    path: '/content-drafts',
    LazyPage: lazy(() => import('./ContentDraftsPage')),
  },
} satisfies ClawModule
