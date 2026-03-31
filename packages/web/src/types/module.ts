import type { ComponentType, LazyExoticComponent } from 'react'

/** Feature module registration: shell collects via import.meta.glob for routes and nav */
export interface ClawModule {
  id: string
  name: string
  icon: string
  navOrder: number
  route: {
    path: string
    LazyPage: LazyExoticComponent<ComponentType<object>>
  }
}
