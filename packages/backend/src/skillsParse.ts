import { isRecord } from './serverUtils.js'

export function mapSkillJson(raw: string, installed: boolean) {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON from openclaw skills')
  }
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : isRecord(data) && Array.isArray(data.skills)
        ? data.skills
        : []
  return rows.filter(isRecord).map((s) => {
    const slug = (typeof s.slug === 'string' ? s.slug : typeof s.name === 'string' ? s.name : '') || 'unknown'
    return {
      slug,
      name: (typeof s.name === 'string' ? s.name : slug) || slug,
      description: typeof s.description === 'string' ? s.description : '',
      version: typeof s.version === 'string' ? s.version : 'unknown',
      installed,
    }
  })
}
