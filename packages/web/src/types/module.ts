import type { ComponentType, LazyExoticComponent } from 'react'

/** Feature module registration: shell collects via import.meta.glob for routes and nav */
export interface ClawModule {
  id: string
  /** i18n key under `nav.*` */
  nameKey: string
  icon: string
  navOrder: number
  route: {
    path: string
    LazyPage: LazyExoticComponent<ComponentType<object>>
  }
}
