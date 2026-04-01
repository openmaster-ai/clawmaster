import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'channels',
  nameKey: 'nav.channels',
  icon: '📡',
  navOrder: 30,
  route: {
    path: '/channels',
    LazyPage: lazy(() => import('./ChannelsPage')),
  },
} satisfies ClawModule
