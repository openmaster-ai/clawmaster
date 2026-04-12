import { describe, it, expect } from 'vitest'
import {
  SKILL_CATALOG,
  SCENE_BUNDLES,
  CATEGORY_ORDER,
  CATEGORY_COLORS,
  FEATURED_SKILLS,
} from '../catalog'
import {
  PADDLEOCR_DOC_SKILL_ID,
  PADDLEOCR_DOC_SKILL_NAME,
  PADDLEOCR_TEXT_SKILL_ID,
  PADDLEOCR_TEXT_SKILL_NAME,
} from '@/shared/paddleocr'
import en from '@/i18n/en.json'

describe('Skills catalog', () => {
  it('has at least 10 curated skills', () => {
    expect(SKILL_CATALOG.length).toBeGreaterThanOrEqual(10)
  })

  it('all skills have required fields', () => {
    for (const s of SKILL_CATALOG) {
      expect(s.slug).toBeTruthy()
      expect(s.name).toBeTruthy()
      expect(s.descriptionKey).toBeTruthy()
      expect(s.category).toBeTruthy()
    }
  })

  it('all slugs are unique', () => {
    const slugs = SKILL_CATALOG.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('all categories have a defined color', () => {
    for (const s of SKILL_CATALOG) {
      expect(CATEGORY_COLORS[s.category]).toBeTruthy()
    }
  })

  it('keeps four featured ClawHub skills for the landing shelf', () => {
    expect(FEATURED_SKILLS).toHaveLength(4)
    expect(FEATURED_SKILLS.every((skill) => skill.skillKey)).toBe(true)
  })

  it('uses installable registry slugs for featured skills', () => {
    expect(FEATURED_SKILLS.every((skill) => skill.slug)).toBe(true)
    expect(FEATURED_SKILLS.find((skill) => skill.skillKey === 'find-skills')?.slug).toBe('find-skills-skill')
  })

  it('keeps PaddleOCR skill names aligned with official ClawHub entries', () => {
    expect(SKILL_CATALOG.find((skill) => skill.slug === PADDLEOCR_DOC_SKILL_ID)?.name)
      .toBe(PADDLEOCR_DOC_SKILL_NAME)
    expect(SKILL_CATALOG.find((skill) => skill.slug === PADDLEOCR_TEXT_SKILL_ID)?.name)
      .toBe(PADDLEOCR_TEXT_SKILL_NAME)
  })

  it('CATEGORY_ORDER covers all used categories', () => {
    const usedCategories = new Set(SKILL_CATALOG.map((s) => s.category))
    for (const cat of usedCategories) {
      expect(CATEGORY_ORDER).toContain(cat)
    }
  })

  it('descriptionKeys follow skills.catalog.* pattern', () => {
    for (const s of SKILL_CATALOG) {
      expect(s.descriptionKey).toMatch(/^skills\.catalog\.\w+\.desc$/)
    }
  })

  it('every descriptionKey has a matching i18n entry', () => {
    const keys = en as Record<string, string>
    for (const s of SKILL_CATALOG) {
      expect(keys[s.descriptionKey]).toBeTruthy()
    }
  })

  it('every category has a matching i18n label', () => {
    const keys = en as Record<string, string>
    for (const cat of CATEGORY_ORDER) {
      expect(keys[`skills.category.${cat}`]).toBeTruthy()
    }
  })
})

describe('Scene bundles', () => {
  it('has at least 3 bundles', () => {
    expect(SCENE_BUNDLES.length).toBeGreaterThanOrEqual(3)
  })

  it('all bundles have required fields', () => {
    for (const b of SCENE_BUNDLES) {
      expect(b.id).toBeTruthy()
      expect(b.titleKey).toBeTruthy()
      expect(b.descKey).toBeTruthy()
      expect(b.skills.length).toBeGreaterThan(0)
      expect(b.icon).toBeTruthy()
      expect(b.color).toBeTruthy()
    }
  })

  it('all bundle ids are unique', () => {
    const ids = SCENE_BUNDLES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all bundle skills reference catalog entries or known slugs', () => {
    const catalogSlugs = new Set(SKILL_CATALOG.map((s) => s.slug))
    for (const b of SCENE_BUNDLES) {
      for (const slug of b.skills) {
        expect(catalogSlugs.has(slug)).toBe(true)
      }
    }
  })

  it('every bundle titleKey and descKey has a matching i18n entry', () => {
    const keys = en as Record<string, string>
    for (const b of SCENE_BUNDLES) {
      expect(keys[b.titleKey]).toBeTruthy()
      expect(keys[b.descKey]).toBeTruthy()
    }
  })
})
