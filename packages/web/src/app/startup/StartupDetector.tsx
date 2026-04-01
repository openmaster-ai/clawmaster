import { useCallback, useEffect, useState } from 'react'
import type { SystemInfo } from '@/lib/types'
import { getIsTauri } from '@/shared/adapters/platform'
import type { UninstallOpenclawCliOutput } from '@/shared/adapters/dangerSettings'
import {
  installOpenclawFromLocalFileResult,
  installOpenclawGlobalResult,
  listOpenclawNpmVersionsResult,
  reinstallBackupStepResult,
  reinstallUninstallStepResult,
  type OpenclawNpmVersions,
  type ReinstallOpenclawOutput,
  type ReinstallStep,
} from '@/shared/adapters/npmOpenclaw'
import {
  bootstrapAfterInstallResult,
  formatBootstrapSummary,
} from '@/shared/adapters/openclawBootstrap'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

interface StartupDetectorProps {
  onDetected: (info: SystemInfo) => void
  onNewInstall: () => void
  onError: (error: string) => void
}

// Detect Tauri via invoke
async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (getIsTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke(cmd, args)
  }
  throw new Error('Not in Tauri environment')
}

// Tauri backend: detect_system
async function detectTauri(): Promise<SystemInfo> {
  return invokeTauri<SystemInfo>('detect_system')
}

// Web API fallback
async function detectWeb(): Promise<SystemInfo> {
  const res = await fetch('/api/system/detect')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Animated `.` → `..` → `...` for in-progress UI */
function AnimatedEllipsis() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 420)
    return () => window.clearInterval(id)
  }, [])
  const dots = '.'.repeat((tick % 3) + 1)
  return (
    <span className="inline-block min-w-[2.25ch] text-left tabular-nums" aria-hidden>
      {dots}
    </span>
  )
}

export default function StartupDetector({
  onDetected,
  onNewInstall,
  onError,
}: StartupDetectorProps) {
  const [status, setStatus] = useState<'checking' | 'detected' | 'not-installed' | 'error'>(
    'checking'
  )
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [npmMeta, setNpmMeta] = useState<OpenclawNpmVersions | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [selectedSpec, setSelectedSpec] = useState('latest')
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState<UninstallOpenclawCliOutput | null>(null)
  const [reinstallOutcome, setReinstallOutcome] = useState<ReinstallOpenclawOutput | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [versionsRetryToken, setVersionsRetryToken] = useState(0)
  /** When set, final step uses `npm install -g <local.tgz>` without hitting the registry */
  const [localPkgPath, setLocalPkgPath] = useState('')
  const [installPhase, setInstallPhase] = useState<'idle' | 'backup' | 'uninstall' | 'install'>('idle')
  const [installProgress, setInstallProgress] = useState(0)
  /** Summary after successful install/reinstall: doctor --fix + gateway start */
  const [bootstrapInfo, setBootstrapInfo] = useState<string | null>(null)
  const [message, setMessage] = useState(() => i18n.t('startup.checkingEnv'))
  const [isTauriDetected] = useState<boolean | null>(() =>
    typeof window !== 'undefined' ? getIsTauri() : null
  )
  const { t } = useTranslation()

  const detect = useCallback(async () => {
    try {
      setMessage(t('startup.detectingSystem'))
      setStatus('checking')

      if (getIsTauri()) {
        console.log('[StartupDetector] Using Tauri adapter')
        setMessage(t('startup.detectingTauri'))
        const info = await detectTauri()
        setSystemInfo(info)

        if (info.openclaw.installed) {
          setStatus('detected')
          setMessage(t('startup.openclawInstalled'))
        } else {
          setStatus('not-installed')
          setMessage(t('startup.openclawMissing'))
        }
        return
      }

      console.log('[StartupDetector] Using Web API adapter')
      setMessage(t('startup.detectingWeb'))
      const info = await detectWeb()
      setSystemInfo(info)

      if (info.openclaw.installed) {
        setStatus('detected')
        setMessage(t('startup.openclawInstalled'))
      } else {
        setStatus('not-installed')
        setMessage(t('startup.openclawMissing'))
      }
    } catch (err: unknown) {
      console.error('[StartupDetector] Detection error:', err)
      setStatus('error')
      const errorMsg = err instanceof Error ? err.message : t('startup.detectFailed')
      setMessage(errorMsg)
      onError(errorMsg)
    }
  }, [onError, t])

  useEffect(() => {
    console.log('[StartupDetector] Tauri environment detected:', getIsTauri())
    void detect()
  }, [detect])

  useEffect(() => {
    if (showInstallGuide) {
      setInstallResult(null)
      setReinstallOutcome(null)
      setBootstrapInfo(null)
      setInstallProgress(0)
      setInstallPhase('idle')
      setLocalPkgPath('')
    }
  }, [showInstallGuide])

  useEffect(() => {
    if (!showInstallGuide || !systemInfo?.npm.installed) {
      setNpmMeta(null)
      setVersionsError(null)
      setVersionsLoading(false)
      return
    }
    let cancelled = false
    setVersionsLoading(true)
    setVersionsError(null)
    void listOpenclawNpmVersionsResult().then((r) => {
      if (cancelled) return
      setVersionsLoading(false)
      if (!r.success || r.data === undefined) {
        setVersionsError(r.error ?? t('startup.fetchVersionsFailed'))
        setNpmMeta(null)
        setSelectedSpec('latest')
        return
      }
      setNpmMeta(r.data)
      setSelectedSpec('latest')
    })
    return () => {
      cancelled = true
    }
  }, [showInstallGuide, systemInfo?.npm.installed, versionsRetryToken, t])

  const runInstall = useCallback(async () => {
    setInstalling(true)
    setInstallResult(null)
    setReinstallOutcome(null)
    setBootstrapInfo(null)
    setInstallProgress(0)

    if (systemInfo?.openclaw.installed) {
      setInstallPhase('backup')
      setInstallProgress(8)
      const b = await reinstallBackupStepResult()
      if (!b.success || b.data === undefined) {
        setInstallResult({
          ok: false,
          code: -1,
          stdout: '',
          stderr: b.error ?? t('startup.backupFailed'),
        })
        setInstalling(false)
        setInstallPhase('idle')
        setInstallProgress(0)
        return
      }

      setInstallProgress(33)
      setInstallPhase('uninstall')
      const u = await reinstallUninstallStepResult()
      if (!u.success || u.data === undefined) {
        setInstallResult({
          ok: false,
          code: -1,
          stdout: '',
          stderr: u.error ?? t('startup.uninstallStepFailed'),
        })
        setInstalling(false)
        setInstallPhase('idle')
        setInstallProgress(0)
        return
      }

      setInstallProgress(66)
      setInstallPhase('install')
      const i = localPkgPath.trim()
        ? await installOpenclawFromLocalFileResult(localPkgPath.trim())
        : await installOpenclawGlobalResult(selectedSpec)
      setInstallProgress(100)

      const steps: ReinstallStep[] = [
        {
          id: 'backup',
          ok: true,
          message: b.data.message,
          stdout: b.data.path ?? '',
          stderr: '',
          backupPath: b.data.path,
        },
        {
          id: 'uninstall',
          ok: u.data.ok,
          message: u.data.ok ? t('startup.uninstallOkMsg') : t('startup.uninstallWarnMsg'),
          stdout: u.data.stdout,
          stderr: u.data.stderr,
        },
        {
          id: 'install',
          ok: Boolean(i.success && i.data?.ok),
          message:
            i.success && i.data
              ? i.data.ok
                ? localPkgPath.trim()
                  ? t('startup.installDoneLocal')
                  : t('startup.installDone')
                : t('startup.installFailed')
              : t('startup.installCliFailed'),
          stdout: i.success && i.data ? i.data.stdout : '',
          stderr:
            i.success && i.data ? i.data.stderr : i.success === false ? (i.error ?? '') : '',
        },
      ]

      const ok = Boolean(i.success && i.data?.ok)
      setReinstallOutcome({ ok, steps })
      if (ok) {
        setBootstrapInfo(formatBootstrapSummary(await bootstrapAfterInstallResult()))
      }
      setInstalling(false)
      setInstallPhase('idle')
      return
    }

    setInstallPhase('install')
    setInstallProgress(20)
    const r = localPkgPath.trim()
      ? await installOpenclawFromLocalFileResult(localPkgPath.trim())
      : await installOpenclawGlobalResult(selectedSpec)
    setInstallProgress(100)
    if (!r.success || r.data === undefined) {
      setInstalling(false)
      setInstallPhase('idle')
      setInstallResult({
        ok: false,
        code: -1,
        stdout: '',
        stderr: r.error ?? t('startup.installRequestFailed'),
      })
      setBootstrapInfo(null)
      return
    }
    setInstallResult(r.data)
    if (r.data.ok) {
      setBootstrapInfo(formatBootstrapSummary(await bootstrapAfterInstallResult()))
    } else {
      setBootstrapInfo(null)
    }
    setInstalling(false)
    setInstallPhase('idle')
  }, [selectedSpec, systemInfo?.openclaw.installed, localPkgPath, t])

  if (showInstallGuide && systemInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white text-3xl mb-4">
          🦞
        </div>
        <h1 className="text-xl font-bold mb-2">{t('startup.installTitle')}</h1>
        <p className="text-muted-foreground text-center max-w-md mb-4">
          {systemInfo.openclaw.installed ? t('startup.reinstallBlurb') : t('startup.installBlurb')}
        </p>
        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-lg mb-4 space-y-4 text-sm">
          {systemInfo.npm.installed ? (
            <>
              <div>
                <p className="font-medium mb-2">{t('startup.chooseVersion')}</p>
                <p className="text-xs text-muted-foreground mb-2">{t('startup.versionListHint')}</p>
                {versionsLoading && (
                  <p className="text-muted-foreground text-sm">{t('startup.fetchingVersions')}</p>
                )}
                {versionsError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-destructive text-sm mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span>{versionsError}</span>
                    <button
                      type="button"
                      className="text-primary underline text-xs shrink-0"
                      onClick={() => setVersionsRetryToken((n) => n + 1)}
                    >
                      {t('startup.retryFetch')}
                    </button>
                  </div>
                )}
                {!versionsLoading && (
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    value={selectedSpec}
                    onChange={(e) => setSelectedSpec(e.target.value)}
                  >
                    <optgroup label={t('startup.optgroupTags')}>
                      <option value="latest">
                        latest
                        {npmMeta?.distTags.latest
                          ? t('startup.pointsTo', { ver: npmMeta.distTags.latest })
                          : ''}
                      </option>
                      {npmMeta &&
                        Object.entries(npmMeta.distTags)
                          .filter(([k]) => k !== 'latest')
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([tag, ver]) => (
                            <option key={tag} value={tag}>
                              @{tag} → {ver}
                            </option>
                          ))}
                    </optgroup>
                    {npmMeta && npmMeta.versions.length > 0 && (
                      <optgroup label={t('startup.optgroupVersions')}>
                        {npmMeta.versions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 space-y-2">
                <p className="font-medium text-sm">{t('startup.offlineTgzTitle')}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{t('startup.offlineTgzBody')}</p>
                <input
                  type="text"
                  value={localPkgPath}
                  onChange={(e) => setLocalPkgPath(e.target.value)}
                  placeholder={t('startup.localTgzPlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                  spellCheck={false}
                  autoComplete="off"
                />
                {localPkgPath.trim() ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-500">
                    {t('startup.localTgzActive')}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void runInstall()}
                disabled={installing || (versionsLoading && !localPkgPath.trim())}
                className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {installing
                  ? systemInfo.openclaw.installed
                    ? (
                        <>
                          {t('startup.busyReinstall')}
                          <AnimatedEllipsis />
                        </>
                      )
                    : (
                        <>
                          {t('startup.busyInstall')}
                          <AnimatedEllipsis />
                        </>
                      )
                  : systemInfo.openclaw.installed
                    ? t('startup.btnReinstall')
                    : t('startup.btnInstall')}
              </button>
              {installing && (
                <div className="space-y-3 pt-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-lg shadow-md ring-2 ring-primary/30 animate-lobster-wiggle select-none"
                      aria-hidden
                    >
                      🦞
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {systemInfo.openclaw.installed ? (
                          <>
                            {installPhase === 'backup' && (
                              <>
                                {t('startup.phaseBackup')}
                                <AnimatedEllipsis />
                              </>
                            )}
                            {installPhase === 'uninstall' && (
                              <>
                                {t('startup.phaseUninstall')}
                                <AnimatedEllipsis />
                              </>
                            )}
                            {installPhase === 'install' && (
                              <>
                                {localPkgPath.trim()
                                  ? t('startup.phaseInstallLocal')
                                  : t('startup.phaseInstallNpm')}
                                <AnimatedEllipsis />
                              </>
                            )}
                            {installPhase === 'idle' && (
                              <>
                                {t('startup.phaseIdle')}
                                <AnimatedEllipsis />
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {localPkgPath.trim()
                              ? t('startup.phaseInstallFresh')
                              : t('startup.phaseInstallFreshNpm')}
                            <AnimatedEllipsis />
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {t('startup.npmWaitHint')}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {systemInfo.openclaw.installed ? (
                        <>
                          {installPhase === 'backup' && t('startup.step1')}
                          {installPhase === 'uninstall' && t('startup.step2')}
                          {installPhase === 'install' && t('startup.step3')}
                          {installPhase === 'idle' && t('startup.stepDash')}
                        </>
                      ) : (
                        t('startup.globalInstall')
                      )}
                    </span>
                    {systemInfo.openclaw.installed ? (
                      <span className="tabular-nums shrink-0">{installProgress}%</span>
                    ) : null}
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    {systemInfo.openclaw.installed ? (
                      <div
                        className="relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-300 ease-out"
                        style={{ width: `${installProgress}%` }}
                      >
                        {installPhase === 'install' && (
                          <div
                            className="pointer-events-none absolute inset-y-0 left-0 w-[45%] rounded-full bg-gradient-to-r from-transparent via-white/45 to-transparent animate-install-bar-sheen"
                            aria-hidden
                          />
                        )}
                      </div>
                    ) : (
                      <div className="relative h-full w-[58%] overflow-hidden rounded-full bg-primary">
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 w-[42%] rounded-full bg-gradient-to-r from-transparent via-white/45 to-transparent animate-install-bar-sheen"
                          aria-hidden
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {reinstallOutcome && (
                <div className="rounded-md border border-border p-3 space-y-3 text-xs">
                  <p
                    className={
                      reinstallOutcome.ok
                        ? 'font-medium text-green-800 dark:text-green-200'
                        : 'font-medium text-destructive'
                    }
                  >
                    {reinstallOutcome.ok ? t('startup.reinstallDone') : t('startup.reinstallPartial')}
                  </p>
                  <ul className="space-y-2">
                    {reinstallOutcome.steps.map((s) => (
                      <li
                        key={s.id}
                        className={`rounded border p-2 ${
                          s.ok ? 'border-green-600/30 bg-green-600/5' : 'border-destructive/30 bg-destructive/5'
                        }`}
                      >
                        <div className="font-medium flex justify-between gap-2">
                          <span>
                            {s.id === 'backup' && t('startup.stepBackup')}
                            {s.id === 'uninstall' && t('startup.stepUninstall')}
                            {s.id === 'install' && t('startup.stepInstall')}
                          </span>
                          <span>{s.ok ? '✓' : '✗'}</span>
                        </div>
                        <p className="text-muted-foreground mt-1">{s.message}</p>
                        {(s.stdout || s.stderr) && (
                          <pre className="mt-2 font-mono whitespace-pre-wrap break-all text-[11px] opacity-90 max-h-40 overflow-y-auto">
                            {s.stdout ? `${s.stdout}\n` : ''}
                            {s.stderr || ''}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {installResult && !reinstallOutcome && (
                <div
                  className={`rounded-md border p-3 text-xs font-mono whitespace-pre-wrap break-all ${
                    installResult.ok
                      ? 'border-green-600/40 bg-green-600/5 text-green-800 dark:text-green-200'
                      : 'border-destructive/40 bg-destructive/5 text-destructive'
                  }`}
                >
                  {installResult.ok ? t('startup.installOkLine') : t('startup.installFailLine')}
                  {installResult.stdout ? `${installResult.stdout}\n` : ''}
                  {installResult.stderr ? installResult.stderr : ''}
                </div>
              )}
              {bootstrapInfo && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-2">
                  <p className="font-medium">{t('startup.postInstallTitle')}</p>
                  <pre className="font-mono whitespace-pre-wrap break-all text-[11px]">{bootstrapInfo}</pre>
                  <p className="text-muted-foreground">{t('startup.postInstallOnboard')}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-destructive text-sm">{t('startup.noNpm')}</p>
          )}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="font-medium">{t('startup.manualTitle')}</p>
            <pre className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
              npm install -g openclaw
            </pre>
            <pre className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
              npm install -g clawhub
            </pre>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('startup.suggestNode')}{' '}
            <a
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('startup.nodeLtsLink')}
            </a>
            {t('startup.suggestNodeDocs')}{' '}
            <a
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              docs.openclaw.ai
            </a>
            。
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => setShowInstallGuide(false)}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            {t('startup.btnBack')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInstallGuide(false)
              void detect()
            }}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            {t('startup.btnDetectAgain')}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInstallGuide(false)
              onNewInstall()
            }}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t('startup.btnEnterApp')}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white text-3xl mb-4 animate-pulse">
          🦞
        </div>
        <h1 className="text-xl font-bold mb-2">{t('startup.appName')}</h1>
        <p className="text-muted-foreground">{message}</p>
        {isTauriDetected !== null && (
          <p className="text-xs text-muted-foreground mt-2">
            {t('startup.modeLabel')}{' '}
            {isTauriDetected ? t('startup.modeDesktop') : t('startup.modeWeb')}
          </p>
        )}
      </div>
    )
  }

  if (status === 'detected' && systemInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white text-3xl mb-4">
          🦞
        </div>
        <h1 className="text-xl font-bold mb-2">{t('startup.detectedTitle')}</h1>
        <p className="text-muted-foreground mb-6">{t('startup.detectedSubtitle')}</p>

        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-md mb-6">
          <h3 className="font-medium mb-3">{t('startup.systemInfo')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startup.labelOcVersion')}</span>
              <span className="font-medium">{systemInfo.openclaw.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startup.labelConfigPath')}</span>
              <span className="font-mono text-xs">{systemInfo.openclaw.configPath}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startup.labelNode')}</span>
              <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.nodejs.installed ? systemInfo.nodejs.version : t('common.notInstalled')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startup.labelNpm')}</span>
              <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.npm.installed ? systemInfo.npm.version : t('common.notInstalled')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onDetected(systemInfo)}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t('startup.btnTakeOver')}
          </button>
          <button
            type="button"
            onClick={() => setShowInstallGuide(true)}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            {t('startup.btnFreshInstall')}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'not-installed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center text-3xl mb-4">
          🦞
        </div>
        <h1 className="text-xl font-bold mb-2">{t('startup.notInstalledTitle')}</h1>
        <p className="text-muted-foreground mb-6">{t('startup.notInstalledSubtitle')}</p>

        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-md mb-6">
          <h3 className="font-medium mb-3">{t('startup.requirements')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {systemInfo?.nodejs.installed ? '✅' : '❌'}
              <span>{t('startup.reqNode')}</span>
              {systemInfo?.nodejs.installed && (
                <span className="text-muted-foreground ml-auto">{systemInfo.nodejs.version}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {systemInfo?.npm.installed ? '✅' : '❌'}
              <span>{t('startup.reqNpm')}</span>
              {systemInfo?.npm.installed && (
                <span className="text-muted-foreground ml-auto">{systemInfo.npm.version}</span>
              )}
            </div>
          </div>
        </div>

        {systemInfo?.nodejs.installed && systemInfo?.npm.installed ? (
          <button
            type="button"
            onClick={() => setShowInstallGuide(true)}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t('startup.btnStartInstall')}
          </button>
        ) : (
          <div className="text-center">
            <p className="text-red-500 mb-3">{t('startup.installNodeFirst')}</p>
            <a
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('startup.downloadNode')}
            </a>
          </div>
        )}
      </div>
    )
  }

  // Error state
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="w-16 h-16 bg-red-500 rounded-lg flex items-center justify-center text-white text-3xl mb-4">
        ❌
      </div>
      <h1 className="text-xl font-bold mb-2">{t('startup.errorTitle')}</h1>
      <p className="text-red-500 mb-4 text-center max-w-md">{message}</p>

      {isTauriDetected === false && (
        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-md mb-6">
          <h3 className="font-medium mb-2">{t('startup.tauriMissingTitle')}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t('startup.tauriMissingBody')}</p>
        </div>
      )}

      <button
        onClick={detect}
        className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
      >
        {t('common.retry')}
      </button>
    </div>
  )
}
