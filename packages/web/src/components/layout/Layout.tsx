import { useState, useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { changeLanguage } from '@/i18n'
import { registeredModules } from '@/modules/registry'
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Radio,
  MessageSquare,
  Box,
  Zap,
  Users,
  Settings2,
  FileText,
  ScrollText,
  Wrench,
  Plug,
  Shell,
  Sun,
  Moon,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  path: string
  labelKey: string
  icon: LucideIcon
}

interface LayoutProps {
  children: React.ReactNode
}

const moduleIconMap: Record<string, LucideIcon> = {
  observe: BarChart3,
  memory: Brain,
  sessions: MessageSquare,
  mcp: Plug,
}

// Nav label keys map to layout.nav.* in translations
const moduleNavLabelKeys: Record<string, string> = {
  observe: 'layout.nav.observe',
  memory: 'layout.nav.memory',
  sessions: 'layout.nav.sessions',
  mcp: 'layout.nav.mcp',
}

const mainNav: NavItem[] = [
  { path: '/', labelKey: 'layout.nav.overview', icon: LayoutDashboard },
  ...registeredModules.map((m) => ({
    path: m.route.path,
    labelKey: moduleNavLabelKeys[m.id] ?? `layout.nav.${m.id}`,
    icon: moduleIconMap[m.id] ?? Box,
  })),
]

const manageNav: NavItem[] = [
  { path: '/gateway', labelKey: 'layout.nav.gateway', icon: Radio },
  { path: '/channels', labelKey: 'layout.nav.channels', icon: MessageSquare },
  { path: '/models', labelKey: 'layout.nav.models', icon: Box },
  { path: '/skills', labelKey: 'layout.nav.skills', icon: Zap },
  { path: '/agents', labelKey: 'layout.nav.agents', icon: Users },
]

const systemNav: NavItem[] = [
  { path: '/config', labelKey: 'layout.nav.config', icon: Settings2 },
  { path: '/docs', labelKey: 'layout.nav.docs', icon: FileText },
  { path: '/logs', labelKey: 'layout.nav.logs', icon: ScrollText },
  { path: '/settings', labelKey: 'layout.nav.settings', icon: Wrench },
]

const allNavItems = [...mainNav, ...manageNav, ...systemNav]

// ─── Dark mode ───

type DarkMode = 'system' | 'light' | 'dark'

function getStoredDarkMode(): DarkMode {
  return (localStorage.getItem('clawmaster-theme') as DarkMode) || 'system'
}

function applyDarkMode(mode: DarkMode) {
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

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

// ─── Component ───

export default function Layout({ children }: LayoutProps) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const currentPath = location.pathname
  const [dark, setDark] = useState(isDark)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    applyDarkMode(getStoredDarkMode())
    setDark(isDark())
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [currentPath])

  function toggleDarkMode() {
    const next = isDark() ? 'light' : 'dark'
    applyDarkMode(next)
    setDark(next === 'dark')
  }

  const sidebarContent = (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            <Shell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight">{t('layout.appName')}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">{t('layout.appSub')}</p>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded-md text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-auto py-2 px-2 space-y-4">
        <NavGroup items={mainNav} currentPath={currentPath} />
        <NavGroup label={t('layout.group.manage')} items={manageNav} currentPath={currentPath} />
        <NavGroup label={t('layout.group.system')} items={systemNav} currentPath={currentPath} />
      </nav>
    </>
  )

  const currentLabel = allNavItems.find(item => item.path === currentPath)
  const pageTitle = currentLabel ? t(currentLabel.labelKey) : t('layout.appName')

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden lg:flex w-52 border-r border-border flex-col bg-card/50 shrink-0">
        {sidebarContent}
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 w-64 bg-background border-r border-border flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-11 border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent">
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-medium text-sm">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="px-1.5 py-1 text-xs bg-transparent border border-border rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <option value="zh">中文</option>
              <option value="en">EN</option>
              <option value="ja">日本語</option>
            </select>
            <button
              onClick={toggleDarkMode}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={dark ? t('layout.darkMode.toLight') : t('layout.darkMode.toDark')}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4">{children}</main>

        <footer className="h-7 border-t border-border flex items-center px-4 text-[11px] text-muted-foreground gap-3 shrink-0">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {t('layout.status.gatewayRunning')}
          </span>
          <span className="text-border">|</span>
          <span>v2026.3.8</span>
        </footer>
      </div>
    </div>
  )
}

function NavGroup({ label, items, currentPath }: { label?: string; items: NavItem[]; currentPath: string }) {
  const { t } = useTranslation()
  return (
    <div>
      {label && (
        <p className="px-3 mb-1 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">{label}</p>
      )}
      {items.map((item) => {
        const isActive = currentPath === item.path
        const Icon = item.icon
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{t(item.labelKey)}</span>
          </Link>
        )
      })}
    </div>
  )
}
