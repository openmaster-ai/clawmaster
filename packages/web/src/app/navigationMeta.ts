export interface NavSectionMeta {
  id: string
  labelKey: string
  descriptionKey: string
  paths: string[]
}

export interface PageMeta {
  sectionId: string
  descriptionKey: string
}

export const NAV_SECTIONS: NavSectionMeta[] = [
  {
    id: 'live',
    labelKey: 'layout.section.live',
    descriptionKey: 'layout.section.liveDesc',
    paths: ['/', '/gateway', '/observe', '/sessions'],
  },
  {
    id: 'workspace',
    labelKey: 'layout.section.workspace',
    descriptionKey: 'layout.section.workspaceDesc',
    paths: ['/channels', '/models', '/agents', '/memory'],
  },
  {
    id: 'extend',
    labelKey: 'layout.section.extend',
    descriptionKey: 'layout.section.extendDesc',
    paths: ['/capabilities', '/skills', '/plugins', '/mcp', '/docs'],
  },
  {
    id: 'control',
    labelKey: 'layout.section.control',
    descriptionKey: 'layout.section.controlDesc',
    paths: ['/config', '/settings'],
  },
]

export const PAGE_META: Record<string, PageMeta> = {
  '/': { sectionId: 'live', descriptionKey: 'layout.page.dashboard' },
  '/gateway': { sectionId: 'live', descriptionKey: 'layout.page.gateway' },
  '/observe': { sectionId: 'live', descriptionKey: 'layout.page.observe' },
  '/sessions': { sectionId: 'live', descriptionKey: 'layout.page.sessions' },
  '/channels': { sectionId: 'workspace', descriptionKey: 'layout.page.channels' },
  '/models': { sectionId: 'workspace', descriptionKey: 'layout.page.models' },
  '/agents': { sectionId: 'workspace', descriptionKey: 'layout.page.agents' },
  '/memory': { sectionId: 'workspace', descriptionKey: 'layout.page.memory' },
  '/capabilities': { sectionId: 'extend', descriptionKey: 'layout.page.capabilities' },
  '/skills': { sectionId: 'extend', descriptionKey: 'layout.page.skills' },
  '/plugins': { sectionId: 'extend', descriptionKey: 'layout.page.plugins' },
  '/mcp': { sectionId: 'extend', descriptionKey: 'layout.page.mcp' },
  '/docs': { sectionId: 'extend', descriptionKey: 'layout.page.docs' },
  '/config': { sectionId: 'control', descriptionKey: 'layout.page.config' },
  '/settings': { sectionId: 'control', descriptionKey: 'layout.page.settings' },
}
