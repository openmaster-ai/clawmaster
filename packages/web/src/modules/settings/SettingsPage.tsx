import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { platform } from '@/adapters'
import { platformResults } from '@/shared/adapters/platformResults'
import { isTauri } from '@/shared/adapters/platform'
import {
  getLocalDataStatsResult,
  rebuildLocalDataResult,
  resetLocalDataResult,
  type LocalDataStats,
} from '@/shared/adapters/storage'
import { changeLanguage } from '@/i18n'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { InstallTask } from '@/shared/components/InstallTask'
import { RecentLogsSheet } from '@/shared/components/RecentLogsSheet'
import { CapabilitiesSection } from './CapabilitiesSection'
import { isWindowsHostPlatform } from '@/shared/hostPlatform'
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, FileText, Copy, FolderInput, Sparkles, Laptop, MonitorCog, Radio, MessageSquare, Database, ArrowUpRight } from 'lucide-react'
import type { SystemInfo } from '@/lib/types'
import type { OpenclawNpmVersions } from '@/shared/adapters/npmOpenclaw'
import type { ClawmasterRuntimeInput, OpenclawProfileInput, OpenclawProfileSeedInput } from '@/shared/adapters/system'

type ThemeMode = 'system' | 'light' | 'dark'
type ProfileMode = OpenclawProfileInput['kind']
type ProfileSeedMode = OpenclawProfileSeedInput['mode']
type RuntimeMode = ClawmasterRuntimeInput['mode']
type DiagnosticsScope = 'all' | 'gateway' | 'channels'
type LocalDataInfo = NonNullable<SystemInfo['storage']>

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

function localDataStateLabelKey(state: LocalDataInfo['state']): string {
  if (state === 'ready') return 'settings.localDataStateReady'
  if (state === 'blocked') return 'settings.localDataStateBlocked'
  return 'settings.localDataStateDegraded'
}

function localDataEngineLabelKey(engine: LocalDataInfo['engine']): string {
  if (engine === 'seekdb-embedded') return 'settings.localDataEngineEmbedded'
  if (engine === 'fallback') return 'settings.localDataEngineFallback'
  return 'settings.localDataEngineUnavailable'
}

function localDataReasonLabelKey(reason: LocalDataInfo['reasonCode']): string | null {
  if (reason === 'node_missing') return 'settings.localDataReasonNodeMissing'
  if (reason === 'node_too_old') return 'settings.localDataReasonNodeTooOld'
  if (reason === 'embedded_platform_unsupported') return 'settings.localDataReasonUnsupportedPlatform'
  if (reason === 'wsl_distro_missing') return 'settings.localDataReasonWslDistroMissing'
  return null
}

function localDataStateClass(state: LocalDataInfo['state']): string {
  if (state === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (state === 'blocked') return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
}

function localDataSummaryLabelKey(info: LocalDataInfo): string {
  switch (info.engine) {
    case 'seekdb-embedded':
      return info.state === 'blocked' ? 'settings.localDataBlockedSummary' : 'settings.localDataReadySummary'
    case 'fallback':
      return 'settings.localDataFallbackSummary'
    default:
      return 'settings.localDataBlockedSummary'
  }
}

function localDataEffectiveReasonLabelKey(info: LocalDataInfo): string | null {
  return localDataReasonLabelKey(info.reasonCode)
    ?? (!info.supportsEmbedded ? 'settings.localDataReasonUnsupportedPlatform' : null)
}

function formatLocalDataUpdatedAt(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme)
  const [profileMode, setProfileMode] = useState<ProfileMode>('default')
  const [profileName, setProfileName] = useState('')
  const [profileSeedMode, setProfileSeedMode] = useState<ProfileSeedMode>('empty')
  const [profileSeedPath, setProfileSeedPath] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('native')
  const [runtimeDistro, setRuntimeDistro] = useState('')
  const [runtimeSaving, setRuntimeSaving] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [localDataStats, setLocalDataStats] = useState<LocalDataStats | null>(null)
  const [localDataBusy, setLocalDataBusy] = useState(false)
  const localDataStatsRequestRef = useRef(0)
  const [logsOpen, setLogsOpen] = useState<DiagnosticsScope | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'reset' | 'uninstall' | 'local-data-reset' | null>(null)

  useEffect(() => {
    loadSystemInfo()
    applyTheme(theme)
  }, [])

  async function loadSystemInfo() {
    try {
      setLoading(true)
      const info = await platform.detectSystem()
      setSystemInfo(info)
      setProfileMode(info.openclaw.profileMode ?? 'default')
      setProfileName(info.openclaw.profileName ?? '')
      setProfileSeedMode('empty')
      setProfileSeedPath('')
      setProfileError(null)
      setRuntimeMode(info.runtime?.mode ?? 'native')
      setRuntimeDistro(info.runtime?.selectedDistro ?? '')
      setRuntimeError(null)
      setLocalDataStats(null)
      void loadLocalDataStats(info.storage)
    } catch (err) {
      console.error('Failed to load system info:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadLocalDataStats(expectedStorage?: LocalDataInfo) {
    const requestId = ++localDataStatsRequestRef.current
    const result = await getLocalDataStatsResult()
    if (requestId !== localDataStatsRequestRef.current) return
    if (result.success && result.data) {
      if (
        expectedStorage &&
        (result.data.profileKey !== expectedStorage.profileKey ||
          result.data.engineRoot !== expectedStorage.engineRoot)
      ) {
        setLocalDataStats(null)
        return
      }
      setLocalDataStats(result.data)
    } else {
      setLocalDataStats(null)
    }
  }

  async function rebuildLocalData() {
    const requestId = ++localDataStatsRequestRef.current
    setLocalDataBusy(true)
    const result = await rebuildLocalDataResult()
    setLocalDataBusy(false)
    if (requestId !== localDataStatsRequestRef.current) return
    if (result.success && result.data) {
      setLocalDataStats(result.data)
      setFeedback({ tone: 'success', message: t('settings.localDataRebuildSuccess') })
    } else {
      setFeedback({ tone: 'error', message: result.error ?? t('common.unknownError') })
    }
  }

  async function resetLocalData() {
    const requestId = ++localDataStatsRequestRef.current
    setLocalDataBusy(true)
    const result = await resetLocalDataResult()
    setLocalDataBusy(false)
    if (requestId !== localDataStatsRequestRef.current) return
    if (result.success && result.data) {
      setLocalDataStats(result.data)
      setFeedback({ tone: 'success', message: t('settings.localDataResetSuccess') })
    } else {
      setFeedback({ tone: 'error', message: result.error ?? t('common.unknownError') })
    }
  }

  async function saveProfile() {
    setProfileError(null)
    setProfileMessage(null)
    if (profileMode === 'named' && !profileName.trim()) {
      setProfileError(t('settings.profileNameRequired'))
      return
    }
    if (profileMode === 'named' && profileSeedMode === 'import-config' && !profileSeedPath.trim()) {
      setProfileError(t('settings.profileSeedPathRequired'))
      return
    }

    setProfileSaving(true)
    const result =
      profileMode === 'default'
        ? await platformResults.clearOpenclawProfile()
        : await platformResults.saveOpenclawProfile({
            kind: profileMode,
            name: profileMode === 'named' ? profileName.trim() : undefined,
          }, profileMode === 'named'
            ? {
                mode: profileSeedMode,
                sourcePath: profileSeedMode === 'import-config' ? profileSeedPath.trim() : undefined,
              }
            : undefined)
    setProfileSaving(false)

    if (!result.success) {
      setProfileError(result.error ?? t('common.unknownError'))
      return
    }

    setProfileMessage(t('settings.profileSaved'))
    await loadSystemInfo()
  }

  function resetProfileDraft() {
    setProfileMode(systemInfo?.openclaw.profileMode ?? 'default')
    setProfileName(systemInfo?.openclaw.profileName ?? '')
    setProfileSeedMode('empty')
    setProfileSeedPath('')
    setProfileError(null)
    setProfileMessage(null)
  }

  async function saveRuntime() {
    setRuntimeError(null)
    setRuntimeMessage(null)
    if (runtimeMode === 'wsl2' && !runtimeDistro.trim()) {
      setRuntimeError(t('settings.runtimeDistroRequired'))
      return
    }

    setRuntimeSaving(true)
    const result = await platformResults.saveClawmasterRuntime({
      mode: runtimeMode,
      wslDistro: runtimeMode === 'wsl2' ? runtimeDistro.trim() : undefined,
    })
    setRuntimeSaving(false)

    if (!result.success) {
      setRuntimeError(result.error ?? t('common.unknownError'))
      return
    }

    setRuntimeMessage(t('settings.runtimeSaved'))
    await loadSystemInfo()
  }

  function resetRuntimeDraft() {
    setRuntimeMode(systemInfo?.runtime?.mode ?? 'native')
    setRuntimeDistro(systemInfo?.runtime?.selectedDistro ?? '')
    setRuntimeError(null)
    setRuntimeMessage(null)
  }

  const resolvedProfileMode = systemInfo?.openclaw.profileMode ?? 'default'
  const resolvedProfileName = systemInfo?.openclaw.profileName ?? ''
  const resolvedDataDir = systemInfo?.openclaw.dataDir ?? ''
  const localData = systemInfo?.storage
  const defaultCandidates = systemInfo?.openclaw.configPathCandidates ?? []
  const existingConfigPaths = systemInfo?.openclaw.existingConfigPaths ?? []
  const resolvedRuntimeMode = systemInfo?.runtime?.mode ?? 'native'
  const resolvedRuntimeDistro = systemInfo?.runtime?.selectedDistro ?? ''
  const isWindowsHost = isWindowsHostPlatform(systemInfo?.runtime?.hostPlatform)
  const localDataActionsDisabled = localDataBusy || localData?.state === 'blocked' || isTauri()
  const diagnosticsSheetConfig = logsOpen === 'gateway'
    ? {
        title: t('logs.gatewayTitle'),
        description: t('logs.gatewayDescription'),
        lines: 240,
        scope: 'gateway' as const,
      }
    : logsOpen === 'channels'
      ? {
          title: t('logs.channelsTitle'),
          description: t('logs.channelsDescription'),
          lines: 320,
          scope: 'channels' as const,
        }
      : {
          title: t('logs.settingsTitle'),
          description: t('logs.settingsDescription'),
          lines: 200,
          scope: 'all' as const,
        }
  const runtimeDirty =
    runtimeMode !== resolvedRuntimeMode ||
    (runtimeMode === 'wsl2' && runtimeDistro.trim() !== resolvedRuntimeDistro)
  const profileDirty =
    profileMode !== resolvedProfileMode ||
    (profileMode === 'named' && profileName.trim() !== resolvedProfileName) ||
    (profileMode === 'named' && (profileSeedMode !== 'empty' || profileSeedPath.trim().length > 0))

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  return (
    <div className="page-shell page-shell-narrow">
      {feedback ? (
        <ActionBanner tone={feedback.tone} message={feedback.message} onDismiss={() => setFeedback(null)} />
      ) : null}
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.aboutDesc')}</p>
        </div>
      </div>

      <section className="surface-card">
        <div className="section-heading">
          <h3 className="section-title">{t('settings.appearance')}</h3>
        </div>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <label className="text-sm text-muted-foreground">{t('settings.mode')}</label>
            <div className="flex flex-wrap gap-3">
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
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <label className="text-sm text-muted-foreground">{t('settings.color')}</label>
            <div className="flex flex-wrap gap-3">
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
                  className="button-secondary px-3 py-1.5 text-sm"
                >
                  <span className={`w-3 h-3 rounded-full ${ct.color}`} />
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <label className="text-sm text-muted-foreground">{t('settings.language')}</label>
            <select
              value={i18n.language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="control-select"
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>
      </section>

      <CapabilitiesSection />

      {/* 系统 — desktop-only settings */}
      {isTauri() && (
        <section className="surface-card">
          <div className="section-heading">
            <h3 className="section-title">{t('settings.system')}</h3>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked disabled />
              <span className="text-sm text-muted-foreground">{t('settings.launchOnStartup')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked disabled />
              <span className="text-sm text-muted-foreground">{t('settings.showTrayIcon')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked disabled />
              <span className="text-sm text-muted-foreground">{t('settings.minimizeToTray')}</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t('common.comingSoon')}</p>
        </section>
      )}

      {isWindowsHost && (
        <section id="settings-runtime" className="surface-card">
          <div className="section-heading">
            <div>
              <h3 className="section-title">{t('settings.runtimeTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('settings.runtimeDesc')}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { id: 'native' as const, icon: Laptop, label: t('settings.runtimeNative'), desc: t('settings.runtimeNativeDesc') },
                  { id: 'wsl2' as const, icon: MonitorCog, label: t('settings.runtimeWsl2'), desc: t('settings.runtimeWsl2Desc') },
                ]).map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setRuntimeMode(option.id)
                        setRuntimeError(null)
                        setRuntimeMessage(null)
                      }}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        runtimeMode === option.id
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-background hover:bg-accent'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                      </div>
                      <p className={`mt-2 text-xs ${runtimeMode === option.id ? 'text-background/80' : 'text-muted-foreground'}`}>
                        {option.desc}
                      </p>
                    </button>
                  )
                })}
              </div>

              {runtimeMode === 'wsl2' && (
                <div className="grid gap-2">
                  <label
                    htmlFor="settings-runtime-distro"
                    className="text-sm text-muted-foreground"
                  >
                    {t('settings.runtimeDistro')}
                  </label>
                  <select
                    id="settings-runtime-distro"
                    value={runtimeDistro}
                    onChange={(e) => {
                      setRuntimeDistro(e.target.value)
                      setRuntimeError(null)
                      setRuntimeMessage(null)
                    }}
                    className="control-select"
                  >
                    <option value="">{t('settings.runtimeDistroPlaceholder')}</option>
                    {(systemInfo?.runtime?.distros ?? []).map((distro) => (
                      <option key={distro.name} value={distro.name}>
                        {distro.name}{distro.isDefault ? ` · ${t('settings.runtimeDefaultTag')}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{t('settings.runtimeDistroHint')}</p>
                </div>
              )}

              {runtimeError && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                  {runtimeError}
                </div>
              )}

              {runtimeMessage && !runtimeError && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  {runtimeMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveRuntime()}
                  disabled={runtimeSaving || !runtimeDirty}
                  className="button-primary"
                >
                  {runtimeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {runtimeSaving ? t('common.saving') : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={resetRuntimeDraft}
                  disabled={runtimeSaving || !runtimeDirty}
                  className="button-secondary"
                >
                  {t('common.refresh')}
                </button>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border/80 bg-muted/40 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t('settings.runtimeResolved')}
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t('settings.runtimeCurrent')}</span>
                  <span className="text-right font-medium">
                    {resolvedRuntimeMode === 'wsl2' ? t('settings.runtimeWsl2') : t('settings.runtimeNative')}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t('settings.runtimeWslAvailability')}</span>
                  <span className="text-right font-medium">
                    {systemInfo?.runtime?.wslAvailable ? t('common.installed') : t('common.notInstalled')}
                  </span>
                </div>
                {resolvedRuntimeMode === 'wsl2' && (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">{t('settings.runtimeDistro')}</span>
                      <span className="text-right font-medium">{resolvedRuntimeDistro || t('common.notSet')}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">{t('settings.runtimeOpenclawInDistro')}</span>
                      <span className={systemInfo?.openclaw.installed ? 'text-green-600' : 'text-red-500'}>
                        {systemInfo?.openclaw.installed
                          ? `v${systemInfo?.openclaw.version}`
                          : t('settings.runtimeOpenclawMissing')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="settings-profile" className="surface-card">
        <div className="section-heading">
          <div>
            <h3 className="section-title">{t('settings.profileTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('settings.profileDesc')}</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { id: 'default' as const, label: t('settings.profileDefault'), desc: t('settings.profileDefaultDesc') },
                { id: 'dev' as const, label: t('settings.profileDev'), desc: t('settings.profileDevDesc') },
                { id: 'named' as const, label: t('settings.profileNamed'), desc: t('settings.profileNamedDesc') },
              ]).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setProfileMode(option.id)
                    setProfileError(null)
                    setProfileMessage(null)
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    profileMode === option.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className={`mt-1 text-xs ${profileMode === option.id ? 'text-background/80' : 'text-muted-foreground'}`}>
                    {option.desc}
                  </p>
                </button>
              ))}
            </div>

            {profileMode === 'named' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">{t('settings.profileName')}</label>
                  <input
                    value={profileName}
                    onChange={(e) => {
                      setProfileName(e.target.value)
                      setProfileError(null)
                      setProfileMessage(null)
                    }}
                    placeholder={t('settings.profileNamePlaceholder')}
                    className="control-input"
                  />
                  <p className="text-xs text-muted-foreground">{t('settings.profileNameHint')}</p>
                </div>

                <div className="rounded-[1.5rem] border border-border/80 bg-muted/35 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{t('settings.profileSeedTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.profileSeedDesc')}</p>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {([
                      { id: 'empty' as const, icon: Sparkles, label: t('settings.profileSeedEmpty'), desc: t('settings.profileSeedEmptyDesc') },
                      { id: 'clone-current' as const, icon: Copy, label: t('settings.profileSeedClone'), desc: t('settings.profileSeedCloneDesc') },
                      { id: 'import-config' as const, icon: FolderInput, label: t('settings.profileSeedImport'), desc: t('settings.profileSeedImportDesc') },
                    ]).map((option) => {
                      const Icon = option.icon
                      const active = profileSeedMode === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setProfileSeedMode(option.id)
                            if (option.id !== 'import-config') {
                              setProfileSeedPath('')
                            }
                            setProfileError(null)
                            setProfileMessage(null)
                          }}
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            active
                              ? 'border-foreground bg-background shadow-sm'
                              : 'border-border bg-background/70 hover:bg-background'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="h-4 w-4" />
                            <span>{option.label}</span>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{option.desc}</p>
                        </button>
                      )
                    })}
                  </div>

                  {profileSeedMode === 'clone-current' && (
                    <div className="mt-4 rounded-2xl bg-background/80 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('settings.profileSeedCloneSource')}
                      </p>
                      <p className="mt-2 break-all font-mono text-xs text-foreground/80">
                        {systemInfo?.openclaw.configPath}
                      </p>
                    </div>
                  )}

                  {profileSeedMode === 'import-config' && (
                    <div className="mt-4 grid gap-2">
                      <label className="text-sm text-muted-foreground">{t('settings.profileSeedPath')}</label>
                      <input
                        value={profileSeedPath}
                        onChange={(e) => {
                          setProfileSeedPath(e.target.value)
                          setProfileError(null)
                          setProfileMessage(null)
                        }}
                        placeholder={t('settings.profileSeedPathPlaceholder')}
                        className="control-input"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings.profileSeedPathHint')}</p>
                    </div>
                  )}

                  <p className="mt-4 text-xs text-muted-foreground">{t('settings.profileSeedCopiesConfigOnly')}</p>
                </div>
              </div>
            )}

            {profileError && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                {profileError}
              </div>
            )}

            {profileMessage && !profileError && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {profileMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={profileSaving || !profileDirty}
                className="button-primary"
              >
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {profileSaving ? t('common.saving') : t('common.save')}
              </button>
              <button
                type="button"
                onClick={resetProfileDraft}
                disabled={profileSaving || !profileDirty}
                className="button-secondary"
              >
                {t('common.refresh')}
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/80 bg-muted/40 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {t('settings.profileResolved')}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t('settings.profileCurrent')}</span>
                <span className="text-right font-medium">
                  {resolvedProfileMode === 'named'
                    ? `${t('settings.profileNamed')} · ${resolvedProfileName}`
                    : resolvedProfileMode === 'dev'
                      ? t('settings.profileDev')
                      : t('settings.profileDefault')}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t('settings.profileDataDir')}</span>
                <span className="max-w-[18rem] break-all text-right font-mono text-xs">{resolvedDataDir || t('common.notSet')}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t('settings.configPath')}</span>
                <span className="max-w-[18rem] break-all text-right font-mono text-xs">{systemInfo?.openclaw.configPath}</span>
              </div>
            </div>

            {resolvedProfileMode === 'default' && defaultCandidates.length > 0 && (
              <div className="mt-5 rounded-2xl bg-background/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t('settings.profileAutoDetect')}
                </p>
                <div className="mt-3 space-y-2">
                  {defaultCandidates.map((candidate) => {
                    const exists = existingConfigPaths.includes(candidate)
                    return (
                      <div
                        key={candidate}
                        className={`rounded-xl border px-3 py-2 text-xs ${
                          exists
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-border bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono break-all">{candidate}</span>
                          <span className="shrink-0">{exists ? t('common.installed') : t('settings.profileCandidateIdle')}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {localData && (
        <section id="settings-local-data" className="surface-card space-y-4">
          <div className="section-heading">
            <div>
              <h3 className="section-title">{t('settings.localDataTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('settings.localDataDesc')}</p>
            </div>
          </div>

          <div className="rounded-[1.95rem] border border-border/80 bg-[linear-gradient(135deg,rgba(233,98,36,0.10),rgba(233,98,36,0)_22%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${localDataStateClass(localData.state)}`}>
                  {t(localDataStateLabelKey(localData.state))}
                </span>
                <span className="inline-flex whitespace-nowrap rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-foreground">
                  {t(localDataEngineLabelKey(localData.engine))}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void rebuildLocalData()}
                  disabled={localDataActionsDisabled}
                  className="button-secondary whitespace-nowrap"
                >
                  {localDataBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('settings.localDataRebuild')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('local-data-reset')}
                  disabled={localDataActionsDisabled}
                  className="button-danger whitespace-nowrap"
                >
                  {t('settings.localDataReset')}
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] border border-border/70 bg-background/80">
                <Database className="h-6 w-6 text-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[1.12rem] font-semibold leading-8 text-foreground">
                  {t(localDataSummaryLabelKey(localData))}
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {localDataEffectiveReasonLabelKey(localData)
                    ? t(localDataEffectiveReasonLabelKey(localData)!)
                    : t('settings.localDataNoPythonHint')}
                </p>
                {isTauri() ? (
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {t('settings.localDataDesktopPending')}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">{t('settings.localDataDocuments')}</p>
                <p className="mt-2 text-2xl font-semibold">{localDataStats?.documentCount ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">{t('settings.localDataDocsModule')}</p>
                <p className="mt-2 text-2xl font-semibold">{localDataStats?.moduleCounts.docs ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">{t('settings.localDataUpdatedAt')}</p>
                <p className="mt-2 text-base font-semibold tabular-nums">
                  {formatLocalDataUpdatedAt(localDataStats?.updatedAt, i18n.resolvedLanguage ?? i18n.language, t('common.notSet'))}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-sm text-muted-foreground">
                {t('settings.localDataRuntime')}: <span className="ml-2 font-medium text-foreground">{localData.runtimeTarget === 'wsl2' ? t('settings.runtimeWsl2') : t('settings.runtimeNative')}</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-sm text-muted-foreground">
                {t('settings.localDataProfile')}: <span className="ml-2 font-medium text-foreground">
                  {resolvedProfileMode === 'named'
                    ? `${t('settings.profileNamed')} · ${resolvedProfileName}`
                    : resolvedProfileMode === 'dev'
                      ? t('settings.profileDev')
                      : t('settings.profileDefault')}
                </span>
              </span>
              <span className="inline-flex items-center rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-sm text-muted-foreground">
                {t('settings.localDataEmbeddedSupport')}: <span className="ml-2 font-medium text-foreground">
                  {localData.supportsEmbedded ? t('settings.localDataSupported') : t('settings.localDataUnavailable')}
                </span>
              </span>
            </div>

            <details className="mt-5 rounded-[1.45rem] border border-border/70 bg-background/55 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                <span>{t('settings.localDataResolved')}</span>
                <span className="text-xs text-muted-foreground">{t(localDataEngineLabelKey(localData.engine))}</span>
              </summary>
              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                    <span className="text-sm text-muted-foreground">{t('settings.localDataEngine')}</span>
                    <span className="text-sm font-semibold text-foreground">{t(localDataEngineLabelKey(localData.engine))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                    <span className="text-sm text-muted-foreground">{t('settings.localDataTarget')}</span>
                    <span className="text-sm font-semibold text-foreground">{`${localData.targetPlatform} · ${localData.targetArch}`}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                    <span className="text-sm text-muted-foreground">{t('settings.localDataNodeRequirement')}</span>
                    <span className="text-sm font-semibold text-foreground">{localData.nodeRequirement}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('settings.localDataRoot')}
                    </p>
                    <p className="mt-3 break-all font-mono text-sm leading-7 text-foreground">
                      {localData.dataRoot ?? t('common.notSet')}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t('settings.localDataEngineRoot')}
                    </p>
                    <p className="mt-3 break-all font-mono text-sm leading-7 text-foreground">
                      {localData.engineRoot ?? t('common.notSet')}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </section>
      )}

      {/* 系统信息 */}
      <section id="settings-system-info" className="surface-card">
        <div className="section-heading">
          <h3 className="section-title">{t('settings.systemInfo')}</h3>
        </div>
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

      <section id="settings-logs" className="surface-card space-y-4">
        <div className="section-heading">
          <div>
            <h3 className="section-title">{t('logs.settingsTitle')}</h3>
            <p className="section-subtitle">{t('logs.settingsDescription')}</p>
          </div>
        </div>
        <div className="inline-note">{t('logs.hubDescription')}</div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-[1.4rem] border border-border/70 bg-muted/25 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                <MonitorCog className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">{t('logs.systemCardTitle')}</h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('logs.systemCardDescription')}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button type="button" className="button-primary w-full justify-center rounded-2xl px-4 py-3" onClick={() => setLogsOpen('all')}>
                <FileText className="h-4 w-4" />
                {t('logs.openSystemLogs')}
              </button>
              <Link
                to="/settings#settings-system-info"
                className="inline-flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-background hover:text-primary"
              >
                <span>{t('logs.gotoSystemInfo')}</span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-muted/25 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                <Radio className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">{t('logs.gatewayCardTitle')}</h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('logs.gatewayCardDescription')}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button type="button" className="button-primary w-full justify-center rounded-2xl px-4 py-3" onClick={() => setLogsOpen('gateway')}>
                <FileText className="h-4 w-4" />
                {t('logs.openGatewayLogs')}
              </button>
              <Link
                to="/gateway#gateway-runtime"
                className="inline-flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-background hover:text-primary"
              >
                <span>{t('logs.gotoGatewayPage')}</span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-muted/25 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                <MessageSquare className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-foreground">{t('logs.channelsCardTitle')}</h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('logs.channelsCardDescription')}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button type="button" className="button-primary w-full justify-center rounded-2xl px-4 py-3" onClick={() => setLogsOpen('channels')}>
                <FileText className="h-4 w-4" />
                {t('logs.openChannelLogs')}
              </button>
              <Link
                to="/channels#channels-page"
                className="inline-flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-background hover:text-primary"
              >
                <span>{t('logs.gotoChannelsPage')}</span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 更新 */}
      <UpdateSection currentVersion={systemInfo?.openclaw.version} installed={!!systemInfo?.openclaw.installed} onUpdated={loadSystemInfo} />

      {/* 危险操作 */}
      <section className="surface-card border-red-500/50">
        <div className="section-heading">
          <h3 className="section-title text-red-500">{t('settings.danger')}</h3>
        </div>
        <div className="flex gap-3">
          <button
            className="button-secondary"
            onClick={() => setConfirmAction('reset')}
          >
            {t('settings.resetConfig')}
          </button>
          <button
            className="button-danger"
            onClick={() => setConfirmAction('uninstall')}
          >
            {t('settings.uninstallOpenClaw')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t('settings.dangerWarning')}</p>
      </section>

      {/* 关于 */}
      <section className="surface-card space-y-4 pb-5">
        <div className="section-heading">
          <h3 className="section-title">{t('settings.about')}</h3>
        </div>
        <div className="space-y-2">
          <p className="text-base font-medium text-foreground">{t('settings.aboutName')}</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('settings.aboutDesc')} · {t('settings.aboutCommunity')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-border/80 bg-background/70 px-3 py-1.5 text-sm font-medium text-primary transition hover:border-primary/25 hover:bg-background"
          >
            {t('settings.aboutDocs')}
          </a>
          <a
            href="https://github.com/openclaw/openclaw"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-border/80 bg-background/70 px-3 py-1.5 text-sm font-medium text-primary transition hover:border-primary/25 hover:bg-background"
          >
            GitHub
          </a>
          <a
            href="https://clawhub.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-border/80 bg-background/70 px-3 py-1.5 text-sm font-medium text-primary transition hover:border-primary/25 hover:bg-background"
          >
            ClawHub
          </a>
        </div>

        {/* Acknowledgments */}
        <div className="section-subcard">
          <h4 className="text-sm font-medium">{t('settings.acknowledgments')}</h4>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            {[
              { name: 'OpenClaw', url: 'https://github.com/openclaw/openclaw', desc: t('settings.ack.openclaw') },
              { name: 'ClawProbe', url: 'https://github.com/openclaw/clawprobe', desc: t('settings.ack.clawprobe') },
              { name: 'ClawHub', url: 'https://clawhub.ai', desc: t('settings.ack.clawhub') },
              { name: 'Tauri', url: 'https://tauri.app', desc: t('settings.ack.tauri') },
              { name: 'Ollama', url: 'https://ollama.com', desc: t('settings.ack.ollama') },
            ].map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-transparent px-3 py-2 leading-5 transition hover:border-primary/20 hover:bg-card/70 hover:text-primary"
                title={p.desc}
              >
                <span className="font-medium text-foreground">{p.name}</span> {p.desc}
              </a>
            ))}
          </div>
        </div>
      </section>

      <RecentLogsSheet
        open={Boolean(logsOpen)}
        onClose={() => setLogsOpen(null)}
        title={diagnosticsSheetConfig.title}
        description={diagnosticsSheetConfig.description}
        lines={diagnosticsSheetConfig.lines}
        scope={diagnosticsSheetConfig.scope}
      />
      <ConfirmDialog
        open={confirmAction === 'reset'}
        title={t('settings.resetConfigConfirm')}
        tone="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null)
          void (async () => {
            const r = await platformResults.resetOpenclawConfig()
            if (r.success) {
              window.location.reload()
            } else {
              setFeedback({ tone: 'error', message: r.error ?? 'Failed to reset config' })
            }
          })()
        }}
      />
      <ConfirmDialog
        open={confirmAction === 'uninstall'}
        title={t('settings.uninstallConfirm')}
        tone="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null)
          void (async () => {
            const r = await platformResults.uninstallOpenclawCli()
            if (r.success) {
              setFeedback({ tone: 'success', message: t('settings.uninstallSuccess') })
              window.setTimeout(() => window.location.reload(), 400)
            } else {
              setFeedback({ tone: 'error', message: r.error ?? 'Failed to uninstall' })
            }
          })()
        }}
      />
      <ConfirmDialog
        open={confirmAction === 'local-data-reset'}
        title={t('settings.localDataResetConfirm')}
        tone="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null)
          void resetLocalData()
        }}
      />
    </div>
  )
}

// ─── Update Section ───

type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'
type Channel = 'stable' | 'beta' | 'dev'

interface ReleaseNote {
  version: string
  name: string
  body: string
  date: string
  url: string
}

const CHANNEL_TAG_MAP: Record<Channel, string[]> = {
  stable: ['latest'],
  beta: ['beta', 'next', 'rc'],
  dev: ['dev', 'canary', 'nightly'],
}

const GITHUB_REPO = 'openclaw/openclaw'

async function fetchReleaseNotes(limit = 10): Promise<ReleaseNote[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${limit}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.map((r: any) => ({
      version: (r.tag_name || '').replace(/^v/, ''),
      name: r.name || r.tag_name || '',
      body: r.body || '',
      date: r.published_at ? new Date(r.published_at).toLocaleDateString() : '',
      url: r.html_url || '',
    }))
  } catch {
    return []
  }
}

function UpdateSection({
  currentVersion,
  installed,
  onUpdated,
}: {
  currentVersion?: string
  installed: boolean
  onUpdated: () => void
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const [state, setState] = useState<UpdateState>('idle')
  const [versions, setVersions] = useState<OpenclawNpmVersions | null>(null)
  const [channel, setChannel] = useState<Channel>('stable')
  const [selectedVersion, setSelectedVersion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [releases, setReleases] = useState<ReleaseNote[]>([])
  const [changelogOpen, setChangelogOpen] = useState(false)
  const autoCheckTriggeredRef = useRef(false)
  const updateTask = useInstallTask()

  const channelVersion = versions
    ? CHANNEL_TAG_MAP[channel].map((tag) => versions.distTags[tag]).find(Boolean) ?? versions.versions[0]
    : null

  const isUpToDate = currentVersion && channelVersion && currentVersion.includes(channelVersion)

  const handleCheck = useCallback(async () => {
    setState('checking')
    setError(null)
    const [result, notes] = await Promise.all([
      platformResults.listOpenclawNpmVersions(),
      fetchReleaseNotes(),
    ])
    if (result.success && result.data) {
      setVersions(result.data)
      setReleases(notes)
      const latest = result.data.distTags.latest ?? result.data.versions[0]
      setSelectedVersion(latest)
      const upToDate = currentVersion && currentVersion.includes(latest)
      setState(upToDate ? 'up-to-date' : 'available')
    } else {
      setError(result.error ?? t('common.unknownError'))
      setState('error')
    }
  }, [currentVersion, t])

  const handleUpdate = useCallback(async () => {
    if (!selectedVersion) return
    await updateTask.run(async () => {
      if (installed) {
        const result = await platformResults.reinstallOpenclawGlobal(selectedVersion)
        if (!result.success) throw new Error(result.error)
        if (result.data && !result.data.ok) {
          const failedStep = result.data.steps.find((s) => !s.ok)
          throw new Error(failedStep?.message ?? t('settings.updateFailed'))
        }
      } else {
        const result = await platformResults.installOpenclawGlobal(selectedVersion)
        if (!result.success) throw new Error(result.error)
      }
      // Bootstrap after install
      await platformResults.bootstrapAfterInstall()
      onUpdated()
    })
  }, [selectedVersion, installed, updateTask, onUpdated, t])

  // Recent versions for dropdown (max 20)
  const recentVersions = versions?.versions.slice(0, 20) ?? []

  useEffect(() => {
    const shouldAutoCheck = location.hash === '#settings-update'
    if (!shouldAutoCheck) {
      autoCheckTriggeredRef.current = false
      return
    }
    if (autoCheckTriggeredRef.current || state !== 'idle' || updateTask.status !== 'idle') return
    autoCheckTriggeredRef.current = true
    void handleCheck()
  }, [handleCheck, location.hash, state, updateTask.status])

  return (
    <section id="settings-update" className="surface-card">
      <div className="section-heading">
        <h3 className="section-title">{t('settings.update')}</h3>
      </div>
      <div className="space-y-3 text-sm">
        {/* Current version */}
        <div className="flex items-center justify-between">
          <span>OpenClaw CLI</span>
          <span className="text-muted-foreground font-mono">
            {installed ? `v${currentVersion}` : t('common.notInstalled')}
          </span>
        </div>

        {/* Check button (idle/error state) */}
        {(state === 'idle' || state === 'error') && updateTask.status === 'idle' && (
          <button
            onClick={handleCheck}
            className="button-secondary"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('settings.checkUpdate')}
          </button>
        )}

        {/* Checking spinner */}
        {state === 'checking' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('settings.checking')}
          </div>
        )}

        {/* Error */}
        {state === 'error' && error && (
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Up to date */}
        {state === 'up-to-date' && updateTask.status === 'idle' && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            {t('settings.upToDate')}
          </div>
        )}

        {/* Update available */}
        {(state === 'available' || state === 'up-to-date') && versions && updateTask.status === 'idle' && (
          <div className="inline-note space-y-3">
            {/* Channel selector */}
            <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <label className="text-muted-foreground">{t('settings.updateChannel')}</label>
              <select
                value={channel}
                onChange={(e) => {
                  const ch = e.target.value as Channel
                  setChannel(ch)
                  const ver = CHANNEL_TAG_MAP[ch].map((tag) => versions.distTags[tag]).find(Boolean) ?? versions.versions[0]
                  setSelectedVersion(ver)
                  const upToDate = currentVersion && currentVersion.includes(ver)
                  setState(upToDate ? 'up-to-date' : 'available')
                }}
                className="control-select"
              >
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
                <option value="dev">Dev</option>
              </select>
            </div>

            {/* Version selector */}
            <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <label className="text-muted-foreground">{t('settings.targetVersion')}</label>
              <select
                value={selectedVersion}
                onChange={(e) => {
                  setSelectedVersion(e.target.value)
                  const upToDate = currentVersion && currentVersion.includes(e.target.value)
                  setState(upToDate ? 'up-to-date' : 'available')
                }}
                className="control-select w-full font-mono"
              >
                {recentVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}{v === versions.distTags.latest ? ' (latest)' : ''}{v === versions.distTags.beta ? ' (beta)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Update/downgrade button */}
            {!isUpToDate && selectedVersion && (
              <button
                onClick={handleUpdate}
                className="button-primary text-sm"
              >
                {currentVersion && selectedVersion < currentVersion
                  ? t('settings.downgrade', { version: selectedVersion })
                  : t('settings.updateTo', { version: selectedVersion })}
              </button>
            )}

            {/* Dist tags info */}
            <div className="text-xs text-muted-foreground">
              {Object.entries(versions.distTags).map(([tag, ver]) => (
                <span key={tag} className="mr-3">
                  <span className="font-medium">{tag}</span>: <span className="font-mono">{ver}</span>
                </span>
              ))}
            </div>

            {/* Changelog */}
            {releases.length > 0 && (
              <div>
                <button
                  onClick={() => setChangelogOpen(!changelogOpen)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <FileText className="w-3 h-3" />
                  {t('settings.changelog')}
                  {changelogOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {changelogOpen && (
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-3 border border-border rounded-lg p-3 bg-background">
                    {releases.map((r) => (
                      <div key={r.version} className={`text-xs ${
                        currentVersion && r.version === currentVersion ? 'opacity-50' : ''
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium font-mono">{r.version}</span>
                          <span className="text-muted-foreground">{r.date}</span>
                          {currentVersion && r.version === currentVersion && (
                            <span className="text-xs text-green-600 dark:text-green-400">{t('settings.currentLabel')}</span>
                          )}
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-auto">
                              GitHub
                            </a>
                          )}
                        </div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                          {r.body.length > 500 ? r.body.slice(0, 500) + '...' : r.body}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Install progress */}
        {updateTask.status !== 'idle' && (
          <InstallTask
            label="OpenClaw CLI"
            description={selectedVersion}
            status={updateTask.status}
            error={updateTask.error}
            onRetry={updateTask.reset}
          />
        )}
      </div>
    </section>
  )
}
