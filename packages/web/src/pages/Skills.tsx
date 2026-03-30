import { useEffect, useState } from 'react'
import { platform } from '@/adapters'
import type { SkillInfo } from '@/lib/types'

// ─── 场景推荐数据 ───

const RECOMMENDED_SCENES = [
  {
    id: 'photo-qa',
    title: '拍照答题',
    desc: '拍照 → OCR 识别 → AI 解题 → 返回答案，通过飞书/微信/钉钉直接使用',
    skills: ['paddleocr-doc-parsing', 'paddleocr-text-recognition'],
    icon: '📸',
  },
  {
    id: 'invoice',
    title: '发票整理',
    desc: '拍照/转发发票 → 自动识别抬头金额类型 → 归档整理 → 导出报表',
    skills: ['paddleocr-doc-parsing'],
    icon: '🧾',
  },
  {
    id: 'mistakes',
    title: '错题本',
    desc: '自动收集错题、分类归档、定期推送复习，结合记忆管理长期记忆',
    skills: ['paddleocr-text-recognition'],
    icon: '📝',
  },
]

export default function Skills() {
  const [installedSkills, setInstalledSkills] = useState<SkillInfo[]>([])
  const [searchResults, setSearchResults] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [operating, setOperating] = useState<string | null>(null)
  const [view, setView] = useState<'installed' | 'market'>('installed')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadSkills()
  }, [])

  async function loadSkills() {
    try {
      setLoading(true)
      const skills = await platform.getSkills()
      setInstalledSkills(skills)
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    try {
      setSearching(true)
      const results = await platform.searchSkills(searchQuery)
      setSearchResults(results)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }

  async function handleInstall(slug: string) {
    try {
      setOperating(slug)
      await platform.installSkill(slug)
      await loadSkills()
    } catch (err: any) {
      alert(`安装失败: ${err.message}`)
    } finally {
      setOperating(null)
    }
  }

  async function handleUninstall(slug: string) {
    if (!confirm(`确定要卸载 ${slug} 吗？`)) return
    try {
      setOperating(slug)
      await platform.uninstallSkill(slug)
      await loadSkills()
    } catch (err: any) {
      alert(`卸载失败: ${err.message}`)
    } finally {
      setOperating(null)
    }
  }

  const filteredSkills = installedSkills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  async function handleSceneInstall(skills: string[]) {
    setOperating('scene')
    try {
      for (const slug of skills) {
        await platform.installSkill(slug)
      }
      await loadSkills()
    } catch (err: any) {
      alert(`安装失败: ${err.message}`)
    } finally {
      setOperating(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">技能市场</h1>

      {/* 场景推荐 */}
      <div>
        <h3 className="font-medium mb-3">推荐场景</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RECOMMENDED_SCENES.map((scene) => (
            <div key={scene.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{scene.icon}</span>
                <span className="font-medium">{scene.title}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{scene.desc}</p>
              <button
                onClick={() => handleSceneInstall(scene.skills)}
                disabled={operating === 'scene'}
                className="w-full py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {operating === 'scene' ? '安装中...' : '一键安装'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setView('installed')}
          className={`px-4 py-2 rounded-lg text-sm ${view === 'installed' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
        >
          已安装 ({installedSkills.length})
        </button>
        <button
          onClick={() => setView('market')}
          className={`px-4 py-2 rounded-lg text-sm ${view === 'market' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
        >
          搜索市场
        </button>
      </div>

      {view === 'installed' ? (
        <>
          <input
            type="text"
            placeholder="过滤已安装技能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-card rounded-lg border border-border text-sm"
          />

          {filteredSkills.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {installedSkills.length === 0 ? '暂无已安装技能' : '无匹配结果'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredSkills.map((skill) => (
                <div
                  key={skill.slug}
                  className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      <span className="text-sm text-muted-foreground">{skill.version}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
                  </div>
                  <button
                    onClick={() => handleUninstall(skill.slug)}
                    disabled={operating === skill.slug}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent text-red-500 disabled:opacity-50"
                  >
                    {operating === skill.slug ? '处理中...' : '卸载'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="搜索 ClawHub 5400+ 技能..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-4 py-2 bg-card rounded-lg border border-border text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>

          {searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map((skill) => (
                <div
                  key={skill.slug}
                  className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      <span className="text-sm text-muted-foreground">{skill.version}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
                  </div>
                  <button
                    onClick={() => handleInstall(skill.slug)}
                    disabled={operating === skill.slug}
                    className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {operating === skill.slug ? '安装中...' : '安装'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              输入关键词搜索 ClawHub 技能市场
            </p>
          )}

          <a
            href="https://clawhub.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm"
          >
            访问 ClawHub 在线市场 →
          </a>
        </>
      )}
    </div>
  )
}
