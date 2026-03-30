import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { changeLanguage } from '@/i18n'
import type { SystemInfo } from '@/lib/types'

type ThemeMode = 'system' | 'light' | 'dark'

function getStoredTheme(): ThemeMode {
  return (localStorage.getItem('clawmaster-theme') as ThemeMode) || 'system'
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (mode === 'system') {
    const preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.add(preferDark ? 'dark' : 'light')
  } else {
    root.classList.add(mode)
  }
  localStorage.setItem('clawmaster-theme', mode)
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme)

  useEffect(() => {
    loadSystemInfo()
    applyTheme(theme)
  }, [])

  async function loadSystemInfo() {
    try {
      setLoading(true)
      const info = await platform.detectSystem()
      setSystemInfo(info)
    } catch (err) {
      console.error('Failed to load system info:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {/* 外观 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('settings.appearance')}</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">{t('settings.mode')}</label>
            <div className="flex gap-3">
              {([
                { mode: 'system' as const, label: t('settings.modeSystem') },
                { mode: 'light' as const, label: t('settings.modeLight') },
                { mode: 'dark' as const, label: t('settings.modeDark') },
              ]).map(({ mode: m, label }) => (
                <button
                  key={m}
                  onClick={() => { setTheme(m); applyTheme(m) }}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                    theme === m
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">{t('settings.color')}</label>
            <div className="flex gap-3">
              {([
                { id: '', label: t('settings.colorOrange'), color: 'bg-orange-500' },
                { id: 'theme-ocean', label: t('settings.colorOcean'), color: 'bg-blue-500' },
              ]).map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => {
                    const root = document.documentElement
                    root.classList.remove('theme-ocean')
                    if (ct.id) root.classList.add(ct.id)
                    localStorage.setItem('clawmaster-color-theme', ct.id)
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent transition"
                >
                  <span className={`w-3 h-3 rounded-full ${ct.color}`} />
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">{t('settings.language')}</label>
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="px-3 py-1.5 bg-card rounded-lg border border-border text-sm"
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>
      </section>

      {/* 系统 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('settings.system')}</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">{t('settings.launchOnStartup')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">{t('settings.showTrayIcon')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">{t('settings.minimizeToTray')}</span>
          </label>
        </div>
      </section>

      {/* 花费预算 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('settings.budget')}</h3>
        <p className="text-sm text-muted-foreground mb-3">{t('settings.budgetDesc')}</p>
        <div className="space-y-3">
          {(['day', 'week', 'month'] as const).map((period) => {
            const labelKeys = { day: 'settings.budgetDay', week: 'settings.budgetWeek', month: 'settings.budgetMonth' }
            const key = `clawmaster-budget-${period}`
            return (
              <div key={period} className="flex items-center gap-4">
                <label className="w-20 text-sm text-muted-foreground">{t(labelKeys[period])}:</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm">$</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={t('settings.budgetUnlimited')}
                    defaultValue={localStorage.getItem(key) ?? ''}
                    onChange={(e) => {
                      if (e.target.value) localStorage.setItem(key, e.target.value)
                      else localStorage.removeItem(key)
                    }}
                    className="w-24 px-2 py-1.5 bg-background border border-border rounded text-sm"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 系统信息 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('settings.systemInfo')}</h3>
        {systemInfo && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">OpenClaw</span>
              <span className={systemInfo.openclaw.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.openclaw.installed ? `v${systemInfo.openclaw.version}` : t('common.notInstalled')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Node.js</span>
              <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.nodejs.installed ? systemInfo.nodejs.version : t('common.notInstalled')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">npm</span>
              <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.npm.installed ? systemInfo.npm.version : t('common.notInstalled')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('settings.configPath')}</span>
              <span className="font-mono text-xs">{systemInfo.openclaw.configPath}</span>
            </div>
          </div>
        )}
      </section>

      {/* 更新 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('settings.update')}</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>{t('settings.aboutName')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>OpenClaw CLI</span>
            <span className="text-muted-foreground">
              {systemInfo?.openclaw.installed ? `v${systemInfo.openclaw.version}` : t('common.notInstalled')}
            </span>
          </div>
          <button className="px-4 py-2 border border-border rounded-lg hover:bg-accent">
            {t('settings.checkUpdate')}
          </button>
          <div className="flex items-center gap-4 mt-2">
            <label className="text-muted-foreground">{t('settings.updateChannel')}</label>
            <select className="px-3 py-1.5 bg-card rounded-lg border border-border text-sm">
              <option>Stable</option>
              <option>Beta</option>
              <option>Dev</option>
            </select>
          </div>
        </div>
      </section>

      {/* 危险操作 */}
      <section className="bg-card border border-red-500/50 rounded-lg p-4">
        <h3 className="font-medium text-red-500 mb-3">{t('settings.danger')}</h3>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-border rounded-lg hover:bg-accent">
            {t('settings.resetConfig')}
          </button>
          <button className="px-4 py-2 bg-red-500 text-primary-foreground rounded-lg hover:bg-red-600">
            {t('settings.uninstallOpenClaw')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t('settings.dangerWarning')}</p>
      </section>

      {/* 关于 */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-2">{t('settings.about')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.aboutName')}</p>
        <p className="text-sm text-muted-foreground">{t('settings.aboutDesc')}</p>
        <p className="text-sm text-muted-foreground">{t('settings.aboutCommunity')}</p>
        <div className="mt-3 flex gap-4">
          <a href="https://docs.openclaw.ai" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
            {t('settings.aboutDocs')}
          </a>
          <a href="https://github.com/openclaw/openclaw" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
            GitHub
          </a>
          <a href="https://clawhub.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
            ClawHub
          </a>
        </div>
      </section>
    </div>
  )
}
