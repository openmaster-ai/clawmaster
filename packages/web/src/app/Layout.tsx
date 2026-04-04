import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { changeLanguage } from '@/i18n'
import type { GatewayStatus } from '@/lib/types'
import { getGatewayStatusResult } from '@/shared/adapters/gateway'
import { platformResults } from '@/shared/adapters/platformResults'
import { getClawModules } from './moduleRegistry'
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Radio,
  MessageSquare,
  MessageCircle,
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
  HardDrive,
  ArrowUpCircle,
  type LucideIcon,
} from 'lucide-react'

// ─── Lucide icon registry ───

const ICON_MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'bar-chart-3': BarChart3,
  brain: Brain,
  radio: Radio,
  'message-square': MessageSquare,
  'message-circle': MessageCircle,
  box: Box,
  zap: Zap,
  users: Users,
  'settings-2': Settings2,
  'file-text': FileText,
  'scroll-text': ScrollText,
  wrench: Wrench,
  plug: Plug,
  shell: Shell,
  'hard-drive': HardDrive,
}

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Box
}

interface NavItem {
  path: string
  labelKey: string
  icon: LucideIcon
}

interface NavSection {
  id: string
  labelKey: string
  descriptionKey: string
  paths: string[]
}

const NAV_SECTIONS: NavSection[] = [
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
    paths: ['/skills', '/plugins', '/mcp', '/docs'],
  },
  {
    id: 'control',
    labelKey: 'layout.section.control',
    descriptionKey: 'layout.section.controlDesc',
    paths: ['/config', '/settings'],
  },
]

const PAGE_META: Record<string, { sectionId: string; descriptionKey: string }> = {
  '/': { sectionId: 'live', descriptionKey: 'layout.page.dashboard' },
  '/gateway': { sectionId: 'live', descriptionKey: 'layout.page.gateway' },
  '/observe': { sectionId: 'live', descriptionKey: 'layout.page.observe' },
  '/sessions': { sectionId: 'live', descriptionKey: 'layout.page.sessions' },
  '/channels': { sectionId: 'workspace', descriptionKey: 'layout.page.channels' },
  '/models': { sectionId: 'workspace', descriptionKey: 'layout.page.models' },
  '/agents': { sectionId: 'workspace', descriptionKey: 'layout.page.agents' },
  '/memory': { sectionId: 'workspace', descriptionKey: 'layout.page.memory' },
  '/skills': { sectionId: 'extend', descriptionKey: 'layout.page.skills' },
  '/plugins': { sectionId: 'extend', descriptionKey: 'layout.page.plugins' },
  '/mcp': { sectionId: 'extend', descriptionKey: 'layout.page.mcp' },
  '/docs': { sectionId: 'extend', descriptionKey: 'layout.page.docs' },
  '/config': { sectionId: 'control', descriptionKey: 'layout.page.config' },
  '/settings': { sectionId: 'control', descriptionKey: 'layout.page.settings' },
}

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

interface LayoutProps {
  children: React.ReactNode
}

type UpdateBannerState =
  | { status: 'idle' | 'checking' | 'unavailable' | 'up-to-date' | 'error' }
  | { status: 'available'; currentVersion: string; latestVersion: string }

function normalizeVersion(version: string | undefined): string {
  const raw = String(version ?? '').replace(/^v/i, '').trim()
  const match = raw.match(/\d+\.\d+\.\d+[\w.-]*/)
  return match ? match[0] : raw
}

export default function Layout({ children }: LayoutProps) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const currentPath = location.pathname
  const [dark, setDark] = useState(isDark)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null)
  const [updateBanner, setUpdateBanner] = useState<UpdateBannerState>({ status: 'idle' })
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false)

  // Poll gateway status for footer indicator
  const pollGateway = useCallback(async () => {
    const r = await getGatewayStatusResult()
    if (r.success && r.data) setGwStatus(r.data)
  }, [])

  useEffect(() => {
    void pollGateway()
    const id = window.setInterval(() => void pollGateway(), 30_000)
    return () => window.clearInterval(id)
  }, [pollGateway])

  useEffect(() => {
    let cancelled = false

    async function checkForOpenclawUpdate() {
      setUpdateBanner({ status: 'checking' })

      const system = await platformResults.detectSystem()
      const currentVersion = normalizeVersion(system.data?.openclaw.version)
      if (!system.success || !system.data?.openclaw.installed || !currentVersion) {
        if (!cancelled) setUpdateBanner({ status: 'unavailable' })
        return
      }

      const versions = await platformResults.listOpenclawNpmVersions()
      const latestVersion = normalizeVersion(
        versions.data?.distTags.latest ?? versions.data?.versions[0]
      )

      if (!versions.success || !latestVersion) {
        if (!cancelled) setUpdateBanner({ status: 'error' })
        return
      }

      if (!cancelled) {
        setUpdateBanner(
          currentVersion === latestVersion
            ? { status: 'up-to-date' }
            : { status: 'available', currentVersion, latestVersion },
        )
      }
    }

    void checkForOpenclawUpdate()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (updateBanner.status === 'available') {
      setUpdateBannerDismissed(false)
    }
  }, [updateBanner])

  const modules = getClawModules()
  const navItems: NavItem[] = useMemo(() =>
    modules.map((m) => ({
      path: m.route.path,
      labelKey: m.nameKey,
      icon: resolveIcon(m.icon),
    })),
    [modules],
  )

  const navItemsByPath = useMemo(() => new Map(navItems.map((item) => [item.path, item])), [navItems])

  const navSections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.paths
        .map((path) => navItemsByPath.get(path))
        .filter((item): item is NavItem => Boolean(item)),
    })).filter((section) => section.items.length > 0)
  }, [navItemsByPath])

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

  const currentLabel = navItems.find((item) => item.path === currentPath)
  const pageTitle = currentLabel ? t(currentLabel.labelKey) : t('layout.appName')
  const currentMeta = PAGE_META[currentPath]
  const currentSection = navSections.find((section) => section.id === currentMeta?.sectionId) ?? navSections[0]
  const pageDescription = currentMeta ? t(currentMeta.descriptionKey) : t('layout.section.liveDesc')

  const sidebarContent = (
    <>
      <div className="app-sidebar-header shrink-0">
        <div className="app-brand">
          <div className="app-brand-mark">
            <Shell className="h-4 w-4" />
          </div>
          <div className="app-brand-copy">
            <h1 className="app-brand-name">{t('layout.appName')}</h1>
            <p className="app-brand-subtitle">{t('layout.appSub')}</p>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="app-icon-button lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="app-sidebar-overview">
        <div className="app-sidebar-overview-card">
          <p className="app-sidebar-eyebrow">{currentSection ? t(currentSection.labelKey) : t('layout.appName')}</p>
          <p className="app-sidebar-summary">{pageTitle}</p>
          <p className="app-sidebar-note">{pageDescription}</p>
          <div className="app-sidebar-status-row">
            <span className={`h-2 w-2 rounded-full ${gwStatus?.running ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{gwStatus?.running ? t('layout.status.gatewayRunning') : t('layout.status.gatewayStopped')}</span>
          </div>
        </div>
      </div>

      <nav className="app-sidebar-nav">
        {navSections.map((section) => {
          const items = section.items
          return (
            <div key={section.id} className="app-nav-section">
              <div className="app-nav-section-head">
                <p className="app-nav-section-title">{t(section.labelKey)}</p>
                <p className="app-nav-section-copy">{t(section.descriptionKey)}</p>
              </div>
              {items.map((item) => {
                const isActive = currentPath === item.path
                const Icon = item.icon
                const showUpdateBadge =
                  item.path === '/settings' &&
                  updateBanner.status === 'available' &&
                  !isActive
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn('app-nav-link', isActive && 'app-nav-link-active')}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                    {isActive && <span className="app-nav-link-chip">{t('layout.current')}</span>}
                    {showUpdateBadge && (
                      <span className="app-nav-link-chip">{t('layout.update.badge')}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
    </>
  )

  return (
    <div className="app-shell">
      <aside className="app-sidebar hidden shrink-0 lg:flex lg:w-[clamp(15rem,18vw,17rem)] lg:flex-col">
        {sidebarContent}
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="app-sidebar relative z-50 flex w-[min(84vw,18rem)] flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="app-icon-button lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <div className="app-topbar-copy">
              <p className="app-topbar-meta">{currentSection ? t(currentSection.labelKey) : t('layout.appName')}</p>
              <h2 className="app-topbar-title">{pageTitle}</h2>
              <p className="app-topbar-subtitle">{pageDescription}</p>
            </div>
          </div>
          <div className="app-topbar-controls">
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="app-mini-select"
            >
              <option value="zh">中文</option>
              <option value="en">EN</option>
              <option value="ja">日本語</option>
            </select>
            <button
              onClick={toggleDarkMode}
              className="app-icon-button"
              title={dark ? t('layout.darkMode.toLight') : t('layout.darkMode.toDark')}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {updateBanner.status === 'available' && !updateBannerDismissed && (
          <div className="px-4 pt-3 lg:px-6">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 shrink-0 text-primary" />
                <p className="min-w-0 text-foreground">
                  {t('layout.update.available', { version: updateBanner.latestVersion })}
                </p>
              </div>
              <Link to="/settings" className="button-secondary text-xs">
                {t('layout.update.action')}
              </Link>
              <button
                onClick={() => setUpdateBannerDismissed(true)}
                className="app-icon-button"
                aria-label={t('layout.update.dismiss')}
                title={t('layout.update.dismiss')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <main className="app-main">{children}</main>

        <footer className="app-footer shrink-0">
          <span className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${gwStatus?.running ? 'bg-green-500' : 'bg-red-500'}`} />
            {gwStatus?.running ? t('layout.status.gatewayRunning') : t('layout.status.gatewayStopped')}
          </span>
          {gwStatus?.running && gwStatus.port && (
            <>
              <span className="text-border">|</span>
              <span>:{gwStatus.port}</span>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
