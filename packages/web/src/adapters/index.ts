import type { PlatformAdapter } from '@/lib/types'
import { createLegacyPlatformAdapter } from '@/shared/adapters/legacyPlatform'

export { platformResults } from '@/shared/adapters/platformResults'
export type { PlatformResults } from '@/shared/adapters/platformResults'

/** Legacy adapter: throws on failure; prefer platformResults + useAdapterCall in new code */
export const platform: PlatformAdapter = createLegacyPlatformAdapter()

export { getIsTauri, getIsTauri as isTauri } from '@/shared/adapters/platform'
