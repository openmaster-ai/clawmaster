import { lazy } from 'react'
import type { ClawModule } from '@/types/module'

export default {
  id: 'ocr',
  nameKey: 'nav.ocr',
  icon: 'scan-text',
  group: 'manage',
  navOrder: 37,
  route: {
    path: '/ocr',
    LazyPage: lazy(() => import('./OcrPage')),
  },
} satisfies ClawModule
