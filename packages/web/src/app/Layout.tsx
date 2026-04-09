import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { changeLanguage } from '@/i18n'
import type { GatewayStatus } from '@/lib/types'
import { getGatewayStatusResult } from '@/shared/adapters/gateway'
import { isWindowsHostPlatform } from '@/shared/hostPlatform'
import { platformResults } from '@/shared/adapters/platformResults'
import { getClawModules } from './moduleRegistry'
import { CommandPalette, type CommandEntry } from './CommandPalette'
import { getCommandDescriptors } from './commandRegistry'
import { getCommandShortcutLabel, isAppleClientPlatform } from './commandShortcut'
import { resolveIcon } from './iconRegistry'
import { NAV_SECTIONS, PAGE_META } from './navigationMeta'
import {
  Shell,
  Sun,
  Moon,
  Menu,
  Search,
  X,
  ArrowUpCircle,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  path: string
  labelKey: string
  icon: LucideIcon
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

const COMMAND_HINT_DISMISSED_KEY = 'clawmaster-command-palette-hint-dismissed'
const HASH_SCROLL_OBSERVER_TIMEOUT_MS = 10_000

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const editableRoot = target.closest('input, textarea, select, [contenteditable="true"]')
  return Boolean(editableRoot)
}

function hasActiveModalDialog(): boolean {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
}

function isCommandPaletteTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('.command-palette-panel'))
}

function isCommandPaletteShortcutKey(event: KeyboardEvent): boolean {
  if (event.code) {
    return event.code === 'KeyK'
  }

  return event.key.toLowerCase() === 'k'
}

function decodeHashTargetId(hashValue: string): string | null {
  try {
    const targetId = decodeURIComponent(hashValue.replace(/^#/, ''))
    return targetId || null
  } catch {
    return null
  }
}

function normalizeVersion(version: string | undefined): string {
  const raw = String(version ?? '').replace(/^v/i, '').trim()
  const match = raw.match(/\d+\.\d+\.\d+[\w.-]*/)
  return match ? match[0] : raw
}

export default function Layout({ children }: LayoutProps) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname
  const [dark, setDark] = useState(isDark)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandHintVisible, setCommandHintVisible] = useState(() => (
    typeof window !== 'undefined' && localStorage.getItem(COMMAND_HINT_DISMISSED_KEY) !== '1'
  ))
  const [hostPlatform, setHostPlatform] = useState<string | undefined>()
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
      const detectedHostPlatform = system.data?.runtime?.hostPlatform
      if (detectedHostPlatform) {
        setHostPlatform(detectedHostPlatform)
      }
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

  const scrollToHashTarget = useCallback((hashValue: string) => {
    const targetId = decodeHashTargetId(hashValue)
    if (!targetId) return false

    const target = document.getElementById(targetId)
    if (!target) return false

    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }, [])

  useEffect(() => {
    if (!location.hash) return undefined
    if (!decodeHashTargetId(location.hash)) return undefined

    let cancelled = false
    let observer: MutationObserver | undefined
    let timeoutHandle: number | undefined

    function tryScroll() {
      if (cancelled) return true
      const found = scrollToHashTarget(location.hash)
      if (found) {
        observer?.disconnect()
        if (typeof timeoutHandle === 'number') {
          window.clearTimeout(timeoutHandle)
        }
      }
      return found
    }

    if (tryScroll()) return undefined

    observer = new MutationObserver(() => {
      void tryScroll()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    timeoutHandle = window.setTimeout(() => {
      observer?.disconnect()
    }, HASH_SCROLL_OBSERVER_TIMEOUT_MS)

    return () => {
      cancelled = true
      if (typeof timeoutHandle === 'number') {
        window.clearTimeout(timeoutHandle)
      }
      observer?.disconnect()
    }
  }, [location.hash, location.pathname, scrollToHashTarget])

  function toggleDarkMode() {
    const next = isDark() ? 'light' : 'dark'
    applyDarkMode(next)
    setDark(next === 'dark')
  }

  function dismissCommandPaletteHint() {
    setCommandHintVisible(false)
    localStorage.setItem(COMMAND_HINT_DISMISSED_KEY, '1')
  }

  function openCommandPalette() {
    setCommandPaletteOpen(true)
    if (commandHintVisible) {
      dismissCommandPaletteHint()
    }
  }

  const runCommandTarget = useCallback((path: string, hash?: string) => {
    const target = hash ? `${path}#${hash}` : path
    if (currentPath === path && hash && location.hash === `#${hash}`) {
      scrollToHashTarget(hash)
      return
    }

    navigate(target)
  }, [currentPath, location.hash, navigate, scrollToHashTarget])

  const clientPlatform = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isCommandPaletteShortcutKey(event)) return
      if (isAppleClientPlatform(clientPlatform) ? !event.metaKey : !event.ctrlKey) return
      if (isEditableEventTarget(event.target)) {
        if (!isCommandPaletteTarget(event.target)) return
        event.preventDefault()
        return
      }
      event.preventDefault()
      if (hasActiveModalDialog()) return
      openCommandPalette()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clientPlatform, commandHintVisible])

  const currentLabel = navItems.find((item) => item.path === currentPath)
  const pageTitle = currentLabel ? t(currentLabel.labelKey) : t('layout.appName')
  const currentMeta = PAGE_META[currentPath]
  const currentSection = navSections.find((section) => section.id === currentMeta?.sectionId) ?? navSections[0]
  const pageDescription = currentMeta ? t(currentMeta.descriptionKey) : t('layout.section.liveDesc')
  const commandShortcut = getCommandShortcutLabel(clientPlatform)
  const commandHostPlatform = isWindowsHostPlatform(hostPlatform) ? hostPlatform : undefined
  const commandEntries = useMemo<CommandEntry[]>(() => {
    return getCommandDescriptors(modules, { hostPlatform: commandHostPlatform }).map((command) => {
      if (command.kind === 'action') {
        return {
          id: command.id,
          kind: command.kind,
          icon: command.icon,
          title: t(dark ? 'layout.darkMode.toLight' : 'layout.darkMode.toDark'),
          description: t(command.descriptionKey),
          keywords: [
            ...command.keywords,
            t('command.action.toggleTheme'),
            t('layout.darkMode.toDark'),
            t('layout.darkMode.toLight'),
          ],
          badge: t('command.badge.action'),
          execute: toggleDarkMode,
        }
      }

      if (command.kind === 'section') {
        return {
          id: command.id,
          kind: command.kind,
          icon: command.icon,
          title: t(command.labelKey),
          description: t(command.descriptionKey),
          keywords: command.keywords,
          badge: t('command.badge.section'),
          execute: () => runCommandTarget(command.path, command.hash),
        }
      }

      return {
        id: command.id,
        kind: command.kind,
        icon: command.icon,
        title: t(command.labelKey),
        description: t(command.descriptionKey),
        keywords: command.keywords,
        badge: t('command.badge.page'),
        execute: () => runCommandTarget(command.path),
      }
    })
  }, [commandHostPlatform, dark, modules, runCommandTarget, t])

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
            <button
              type="button"
              onClick={openCommandPalette}
              className="app-command-trigger"
              title={t('command.openHint', { shortcut: commandShortcut })}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('command.open')}</span>
              <span className="app-command-trigger-shortcut">{commandShortcut}</span>
            </button>
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

        {(updateBanner.status === 'available' && !updateBannerDismissed) || commandHintVisible ? (
          <div className="px-4 pt-3 lg:px-6">
            <div className="space-y-3">
              {updateBanner.status === 'available' && !updateBannerDismissed && (
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
              )}

              {commandHintVisible && (
                <div className="app-command-hint">
                  <div className="app-command-hint-copy">
                    <div className="app-command-hint-title-row">
                      <Search className="h-4 w-4 shrink-0 text-primary" />
                      <p className="app-command-hint-title">{t('command.discovery.title', { shortcut: commandShortcut })}</p>
                    </div>
                    <p className="app-command-hint-desc">{t('command.discovery.desc', { shortcut: commandShortcut })}</p>
                  </div>
                  <button type="button" onClick={dismissCommandPaletteHint} className="button-secondary text-xs">
                    {t('command.discovery.dismiss')}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

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

      <CommandPalette
        open={commandPaletteOpen}
        commands={commandEntries}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  )
}
