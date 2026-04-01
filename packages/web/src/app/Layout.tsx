import { Outlet, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getClawModules } from './moduleRegistry'

function normalizeLang(lng: string): 'en' | 'zh' | 'ja' {
  if (lng.startsWith('zh')) return 'zh'
  if (lng.startsWith('ja')) return 'ja'
  return 'en'
}

export default function Layout() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const currentPath = location.pathname
  const navItems = getClawModules().map((m) => ({
    path: m.route.path,
    label: t(m.nameKey),
    icon: m.icon,
  }))

  const currentTitle = navItems.find((item) => item.path === currentPath)?.label ?? t('layout.appTitle')

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white text-lg">
              🦞
            </div>
            <div>
              <h1 className="font-semibold text-sm">{t('layout.appTitle')}</h1>
              <p className="text-xs text-muted-foreground">{t('layout.appSubtitle')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <label className="text-xs text-muted-foreground mb-1 block">{t('layout.instance')}</label>
          <select className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border">
            <option>{t('layout.defaultInstance')}</option>
          </select>
        </div>

        <div className="p-3 border-t border-border">
          <label className="text-xs text-muted-foreground mb-1 block">{t('layout.language')}</label>
          <select
            className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border"
            value={normalizeLang(i18n.language)}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="en">{t('layout.langEn')}</option>
            <option value="zh">{t('layout.langZh')}</option>
            <option value="ja">{t('layout.langJa')}</option>
          </select>
        </div>

        <div className="p-3 border-t border-border">
          <label className="text-xs text-muted-foreground mb-1 block">{t('layout.theme')}</label>
          <select
            className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border"
            onChange={(e) => {
              const html = document.documentElement
              html.classList.remove('dark', 'theme-ocean')
              if (e.target.value === 'ocean') {
                html.classList.add('theme-ocean')
              } else if (e.target.value === 'dark') {
                html.classList.add('dark')
              }
            }}
          >
            <option value="default">{t('layout.themeDefault')}</option>
            <option value="ocean">{t('layout.themeOcean')}</option>
            <option value="dark">{t('layout.themeDark')}</option>
          </select>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-12 border-b border-border flex items-center px-4">
          <h2 className="font-medium">{currentTitle}</h2>
        </header>

        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>

        <footer className="h-8 border-t border-border flex items-center px-4 text-xs text-muted-foreground gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {t('layout.footerGatewayRunning')}
          </span>
          <span>|</span>
          <span>
            {t('layout.footerModel')}: GLM-5
          </span>
          <span>|</span>
          <span>{t('layout.footerVersion')}</span>
        </footer>
      </div>
    </div>
  )
}
