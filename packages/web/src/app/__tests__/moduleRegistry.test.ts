import { describe, it, expect } from 'vitest'
import { getClawModules } from '../moduleRegistry'

describe('moduleRegistry', () => {
  const modules = getClawModules()

  it('discovers all expected modules', () => {
    expect(modules.length).toBeGreaterThanOrEqual(14)
  })

  it('returns modules sorted by navOrder', () => {
    for (let i = 1; i < modules.length; i++) {
      expect(modules[i].navOrder).toBeGreaterThanOrEqual(modules[i - 1].navOrder)
    }
  })

  it('every module has required fields', () => {
    for (const m of modules) {
      expect(m.id).toBeTruthy()
      expect(m.nameKey).toBeTruthy()
      expect(m.icon).toBeTruthy()
      expect(typeof m.navOrder).toBe('number')
      expect(m.route.path).toBeTruthy()
      expect(m.route.LazyPage).toBeDefined()
    }
  })

  it('all module ids are unique', () => {
    const ids = modules.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all module paths are unique', () => {
    const paths = modules.map((m) => m.route.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('all nameKeys follow nav.* pattern', () => {
    for (const m of modules) {
      expect(m.nameKey).toMatch(/^nav\./)
    }
  })

  it('includes expected core modules', () => {
    const ids = modules.map((m) => m.id)
    expect(ids).toContain('dashboard')
    expect(ids).toContain('gateway')
    expect(ids).toContain('observe')
    expect(ids).toContain('mcp')
    expect(ids).toContain('channels')
    expect(ids).toContain('memory')
    expect(ids).toContain('wiki')
    expect(ids).toContain('sessions')
    expect(ids).toContain('models')
    expect(ids).toContain('ocr')
    expect(ids).toContain('skills')
    expect(ids).toContain('config')
    expect(ids).toContain('settings')
  })

  it('excludes setup module (showInNav=false)', () => {
    const ids = modules.map((m) => m.id)
    expect(ids).not.toContain('setup')
  })

  it('dashboard is first (lowest navOrder)', () => {
    expect(modules[0].id).toBe('dashboard')
  })

  it('settings is last (highest navOrder)', () => {
    expect(modules[modules.length - 1].id).toBe('settings')
  })

  it('every module has a group', () => {
    for (const m of modules) {
      expect(['main', 'manage', 'system', undefined]).toContain(m.group)
    }
  })

  it('places wiki immediately after memory in nav order', () => {
    const ids = modules.map((m) => m.id)
    expect(ids.indexOf('wiki')).toBe(ids.indexOf('memory') + 1)
  })
})
