// Module Registry
// Auto-collects modules via import.meta.glob

import type { ClawModule } from '@/types/module'

const moduleFiles = import.meta.glob<{ default: ClawModule }>('./*/index.ts', { eager: true })

export const registeredModules: ClawModule[] = Object.values(moduleFiles)
  .map((m) => m.default)
  .filter((m) => m && m.showInNav !== false)
  .sort((a, b) => a.navOrder - b.navOrder)
