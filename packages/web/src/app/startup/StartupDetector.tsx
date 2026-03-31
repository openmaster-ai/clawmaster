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
  const [message, setMessage] = useState('正在检测环境...')
  const [isTauriDetected] = useState<boolean | null>(() =>
    typeof window !== 'undefined' ? getIsTauri() : null
  )

  const detect = useCallback(async () => {
    try {
      setMessage('正在检测系统环境...')
      setStatus('checking')

      if (getIsTauri()) {
        console.log('[StartupDetector] Using Tauri adapter')
        setMessage('正在通过 Tauri 检测系统...')
        const info = await detectTauri()
        setSystemInfo(info)

        if (info.openclaw.installed) {
          setStatus('detected')
          setMessage('检测到 OpenClaw 已安装')
        } else {
          setStatus('not-installed')
          setMessage('未检测到 OpenClaw')
        }
        return
      }

      console.log('[StartupDetector] Using Web API adapter')
      setMessage('正在通过 Web API 检测系统...')
      const info = await detectWeb()
      setSystemInfo(info)

      if (info.openclaw.installed) {
        setStatus('detected')
        setMessage('检测到 OpenClaw 已安装')
      } else {
        setStatus('not-installed')
        setMessage('未检测到 OpenClaw')
      }
    } catch (err: unknown) {
      console.error('[StartupDetector] Detection error:', err)
      setStatus('error')
      const errorMsg = err instanceof Error ? err.message : '检测失败'
      setMessage(errorMsg)
      onError(errorMsg)
    }
  }, [onError])

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
        setVersionsError(r.error ?? '获取版本列表失败')
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
  }, [showInstallGuide, systemInfo?.npm.installed, versionsRetryToken])

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
          stderr: b.error ?? '备份失败',
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
          stderr: u.error ?? '卸载步骤失败',
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
          message: u.data.ok
            ? '已卸载全局 openclaw（含 npm rename 失败时的 --force / 目录清理回退）'
            : '卸载 openclaw 仍失败，将继续尝试安装',
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
                  ? '已从本地 .tgz 安装完成'
                  : '安装完成'
                : '安装失败'
              : '安装请求失败',
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
        stderr: r.error ?? '安装请求失败',
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
  }, [selectedSpec, systemInfo?.openclaw.installed, localPkgPath])

  if (showInstallGuide && systemInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white text-3xl mb-4">
          🦞
        </div>
        <h1 className="text-xl font-bold mb-2">安装 OpenClaw</h1>
        <p className="text-muted-foreground text-center max-w-md mb-4">
          {systemInfo.openclaw.installed ? (
            <>
              检测到已安装 OpenClaw：点击「一键重装」将按顺序执行——① 将{' '}
              <code className="font-mono text-xs">~/.openclaw</code> 打成快照备份到{' '}
              <code className="font-mono text-xs">~/.openclaw_snapshots</code>（若无数据目录则跳过）；②{' '}
              <code className="font-mono text-xs">npm uninstall -g openclaw</code>（不卸载 clawhub）；③ 安装你选的版本。
            </>
          ) : (
            <>
              选择 npm 标签或版本后点击「一键安装」，执行全局安装（与终端{' '}
              <code className="font-mono text-xs">npm install -g</code> 等价）。完成后请点「重新检测」。
            </>
          )}
        </p>
        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-lg mb-4 space-y-4 text-sm">
          {systemInfo.npm.installed ? (
            <>
              <div>
                <p className="font-medium mb-2">选择版本</p>
                <p className="text-xs text-muted-foreground mb-2">
                  列表来自 npm registry：发布标签 + 至多 120 个历史版本（按主版本号从新到旧排序）。
                </p>
                {versionsLoading && (
                  <p className="text-muted-foreground text-sm">正在拉取版本列表…</p>
                )}
                {versionsError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-destructive text-sm mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span>{versionsError}</span>
                    <button
                      type="button"
                      className="text-primary underline text-xs shrink-0"
                      onClick={() => setVersionsRetryToken((n) => n + 1)}
                    >
                      重试拉取
                    </button>
                  </div>
                )}
                {!versionsLoading && (
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    value={selectedSpec}
                    onChange={(e) => setSelectedSpec(e.target.value)}
                  >
                    <optgroup label="发布标签">
                      <option value="latest">
                        latest
                        {npmMeta?.distTags.latest
                          ? `（当前指向 ${npmMeta.distTags.latest}）`
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
                      <optgroup label="版本号">
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
                <p className="font-medium text-sm">离线 / 无网：本地 .tgz 安装</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  在能联网的机器上执行{' '}
                  <code className="rounded bg-muted px-1 font-mono text-[11px]">npm pack openclaw</code> 得到{' '}
                  <code className="font-mono text-[11px]">.tgz</code>，或用发行页下载同名包，拷贝到本机后填写路径。
                  填写后，「一键安装 / 重装」的<strong>最后一步</strong>会执行{' '}
                  <code className="font-mono text-[11px]">npm install -g &lt;路径&gt;</code>，不访问 npm 仓库。
                  若包内依赖仍需拉取，请事先在有网环境装好依赖、或使用 npm 离线镜像 / 缓存。
                </p>
                <input
                  type="text"
                  value={localPkgPath}
                  onChange={(e) => setLocalPkgPath(e.target.value)}
                  placeholder="例如 ~/Downloads/openclaw-2026.3.28.tgz"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                  spellCheck={false}
                  autoComplete="off"
                />
                {localPkgPath.trim() ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-500">
                    已启用本地包：将忽略上方版本选择，仅用于最后一步安装。
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
                          正在执行重装步骤
                          <AnimatedEllipsis />
                        </>
                      )
                    : (
                        <>
                          正在安装
                          <AnimatedEllipsis />
                        </>
                      )
                  : systemInfo.openclaw.installed
                    ? '一键重装（备份 → 卸载 → 安装）'
                    : '一键安装到本机'}
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
                                正在备份数据
                                <AnimatedEllipsis />
                              </>
                            )}
                            {installPhase === 'uninstall' && (
                              <>
                                正在卸载旧版 CLI
                                <AnimatedEllipsis />
                              </>
                            )}
                            {installPhase === 'install' && (
                              <>
                                {localPkgPath.trim()
                                  ? '正在从本地 .tgz 安装'
                                  : '正在安装（npm 可能较慢，请稍候）'}
                                <AnimatedEllipsis />
                              </>
                            )}
                            {installPhase === 'idle' && (
                              <>
                                准备中
                                <AnimatedEllipsis />
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {localPkgPath.trim()
                              ? '正在从本地 .tgz 安装 OpenClaw'
                              : '正在安装 OpenClaw（npm 下载中，请稍候）'}
                            <AnimatedEllipsis />
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        npm 下载与安装可能持续数分钟；进度停在某一步时，可看龙虾动画与条上光带表示仍在进行。
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {systemInfo.openclaw.installed ? (
                        <>
                          {installPhase === 'backup' && '步骤 1/3'}
                          {installPhase === 'uninstall' && '步骤 2/3'}
                          {installPhase === 'install' && '步骤 3/3'}
                          {installPhase === 'idle' && '—'}
                        </>
                      ) : (
                        '全局安装'
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
                    {reinstallOutcome.ok ? '重装流程已完成' : '重装未完全成功，请查看各步骤'}
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
                            {s.id === 'backup' && '1. 备份'}
                            {s.id === 'uninstall' && '2. 卸载 openclaw'}
                            {s.id === 'install' && '3. 安装'}
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
                  {installResult.ok ? '安装完成。\n' : '安装未成功。\n'}
                  {installResult.stdout ? `${installResult.stdout}\n` : ''}
                  {installResult.stderr ? installResult.stderr : ''}
                </div>
              )}
              {bootstrapInfo && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-2">
                  <p className="font-medium">安装后初始化</p>
                  <pre className="font-mono whitespace-pre-wrap break-all text-[11px]">{bootstrapInfo}</pre>
                  <p className="text-muted-foreground">
                    若通道或模型仍为空，请在终端运行{' '}
                    <code className="font-mono text-[11px]">openclaw onboard</code> 完成向导。
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-destructive text-sm">当前未检测到 npm，无法使用一键安装。请先安装 Node.js。</p>
          )}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="font-medium">手动安装（可选）</p>
            <pre className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
              npm install -g openclaw
            </pre>
            <pre className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
              npm install -g clawhub
            </pre>
          </div>
          <p className="text-muted-foreground text-xs">
            建议使用{' '}
            <a
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              当前 LTS 版 Node.js
            </a>
            。文档：{' '}
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
            返回
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInstallGuide(false)
              void detect()
            }}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            重新检测
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInstallGuide(false)
              onNewInstall()
            }}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            进入管理界面
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
        <h1 className="text-xl font-bold mb-2">龙虾管家</h1>
        <p className="text-muted-foreground">{message}</p>
        {isTauriDetected !== null && (
          <p className="text-xs text-muted-foreground mt-2">
            模式: {isTauriDetected ? '桌面版' : 'Web版'}
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
        <h1 className="text-xl font-bold mb-2">检测到 OpenClaw</h1>
        <p className="text-muted-foreground mb-6">可以接管管理现有的 OpenClaw 安装</p>

        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-md mb-6">
          <h3 className="font-medium mb-3">系统信息</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">OpenClaw 版本</span>
              <span className="font-medium">{systemInfo.openclaw.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">配置文件</span>
              <span className="font-mono text-xs">{systemInfo.openclaw.configPath}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Node.js</span>
              <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.nodejs.installed ? systemInfo.nodejs.version : '未安装'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">npm</span>
              <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
                {systemInfo.npm.installed ? systemInfo.npm.version : '未安装'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onDetected(systemInfo)}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            接管现有安装
          </button>
          <button
            type="button"
            onClick={() => setShowInstallGuide(true)}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            全新安装
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
        <h1 className="text-xl font-bold mb-2">未检测到 OpenClaw</h1>
        <p className="text-muted-foreground mb-6">龙虾管家可以帮你安装 OpenClaw</p>

        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-md mb-6">
          <h3 className="font-medium mb-3">安装要求</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {systemInfo?.nodejs.installed ? '✅' : '❌'}
              <span>Node.js 18+</span>
              {systemInfo?.nodejs.installed && (
                <span className="text-muted-foreground ml-auto">{systemInfo.nodejs.version}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {systemInfo?.npm.installed ? '✅' : '❌'}
              <span>npm</span>
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
            开始安装 OpenClaw
          </button>
        ) : (
          <div className="text-center">
            <p className="text-red-500 mb-3">请先安装 Node.js 和 npm</p>
            <a
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              下载 Node.js →
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
      <h1 className="text-xl font-bold mb-2">检测失败</h1>
      <p className="text-red-500 mb-4 text-center max-w-md">{message}</p>

      {isTauriDetected === false && (
        <div className="bg-card border border-border rounded-lg p-4 w-full max-w-md mb-6">
          <h3 className="font-medium mb-2">⚠️ Tauri 环境未检测到</h3>
          <p className="text-sm text-muted-foreground mb-3">
            应用未能检测到 Tauri 桌面环境。这可能是安装问题。
          </p>
          <p className="text-sm text-muted-foreground">
            请确保从正确的安装包安装，并重新启动应用。
          </p>
        </div>
      )}

      <button
        onClick={detect}
        className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
      >
        重试
      </button>
    </div>
  )
}
