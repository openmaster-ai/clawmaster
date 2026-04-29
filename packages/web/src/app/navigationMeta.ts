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
    paths: ['/', '/gateway', '/cron', '/observe', '/sessions'],
  },
  {
    id: 'workspace',
    labelKey: 'layout.section.workspace',
    descriptionKey: 'layout.section.workspaceDesc',
    paths: ['/channels', '/models', '/agents', '/memory', '/wiki'],
  },
  {
    id: 'extend',
    labelKey: 'layout.section.extend',
    descriptionKey: 'layout.section.extendDesc',
    paths: ['/capabilities', '/mcp', '/plugins', '/skills', '/ocr', '/content-drafts'],
  },
  {
    id: 'control',
    labelKey: 'layout.section.control',
    descriptionKey: 'layout.section.controlDesc',
    paths: ['/config', '/docs', '/settings'],
  },
]

export const PAGE_META: Record<string, PageMeta> = {
  '/': { sectionId: 'live', descriptionKey: 'layout.page.dashboard' },
  '/gateway': { sectionId: 'live', descriptionKey: 'layout.page.gateway' },
  '/cron': { sectionId: 'live', descriptionKey: 'layout.page.cron' },
  '/observe': { sectionId: 'live', descriptionKey: 'layout.page.observe' },
  '/sessions': { sectionId: 'live', descriptionKey: 'layout.page.sessions' },
  '/channels': { sectionId: 'workspace', descriptionKey: 'layout.page.channels' },
  '/models': { sectionId: 'workspace', descriptionKey: 'layout.page.models' },
  '/agents': { sectionId: 'workspace', descriptionKey: 'layout.page.agents' },
  '/memory': { sectionId: 'workspace', descriptionKey: 'layout.page.memory' },
  '/wiki': { sectionId: 'workspace', descriptionKey: 'layout.page.wiki' },
  '/ocr': { sectionId: 'extend', descriptionKey: 'layout.page.ocr' },
  '/capabilities': { sectionId: 'extend', descriptionKey: 'layout.page.capabilities' },
  '/skills': { sectionId: 'extend', descriptionKey: 'layout.page.skills' },
  '/content-drafts': { sectionId: 'extend', descriptionKey: 'layout.page.contentDrafts' },
  '/plugins': { sectionId: 'extend', descriptionKey: 'layout.page.plugins' },
  '/mcp': { sectionId: 'extend', descriptionKey: 'layout.page.mcp' },
  '/docs': { sectionId: 'control', descriptionKey: 'layout.page.docs' },
  '/config': { sectionId: 'control', descriptionKey: 'layout.page.config' },
  '/settings': { sectionId: 'control', descriptionKey: 'layout.page.settings' },
}
