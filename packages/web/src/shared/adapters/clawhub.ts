/**
 * ClawHub 适配器
 *
 * 封装 clawhub CLI 命令，管理技能的安装/卸载/列表/搜索
 */

import { execCommand } from './platform'
import { wrapAsync, type AdapterResult } from './types'

// ─── 类型定义 ───

export interface HubSkill {
  slug: string
  name: string
  description: string
  version: string
  installed: boolean
}

// ─── API 函数 ───

export function listInstalledSkills(): Promise<AdapterResult<HubSkill[]>> {
  return wrapAsync(async () => {
    const raw = await execCommand('clawhub', ['list', '--json'])
    const data = JSON.parse(raw)
    const skills = Array.isArray(data) ? data : data.skills ?? data.installed ?? []
    return skills.map((s: any) => ({
      slug: s.slug ?? s.name,
      name: s.name ?? s.slug,
      description: s.description ?? '',
      version: s.version ?? 'unknown',
      installed: true,
    }))
  })
}

export function searchSkills(query: string): Promise<AdapterResult<HubSkill[]>> {
  return wrapAsync(async () => {
    const raw = await execCommand('clawhub', ['search', query, '--json'])
    const data = JSON.parse(raw)
    const skills = Array.isArray(data) ? data : data.skills ?? data.results ?? []
    return skills.map((s: any) => ({
      slug: s.slug ?? s.name,
      name: s.name ?? s.slug,
      description: s.description ?? '',
      version: s.version ?? 'unknown',
      installed: false,
    }))
  })
}

export function installSkill(slug: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('clawhub', ['install', slug])
    return raw.trim()
  })
}

export function uninstallSkill(slug: string): Promise<AdapterResult<string>> {
  return wrapAsync(async () => {
    const raw = await execCommand('clawhub', ['uninstall', slug])
    return raw.trim()
  })
}
