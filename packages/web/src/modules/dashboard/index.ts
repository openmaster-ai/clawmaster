import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'dashboard',
  name: '概览',
  icon: '📊',
  navOrder: 10,
  route: {
    path: '/',
    LazyPage: lazy(() => import('./DashboardPage')),
  },
} satisfies ClawModule
