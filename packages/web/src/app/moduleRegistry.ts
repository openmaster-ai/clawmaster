import type { ClawModule } from '@/types/module'

const modulesGlob = import.meta.glob<{ default: ClawModule }>('../modules/*/index.ts', {
  eager: true,
})

export function getClawModules(): ClawModule[] {
  return Object.values(modulesGlob)
    .map((m) => m.default)
    .sort((a, b) => a.navOrder - b.navOrder)
}
