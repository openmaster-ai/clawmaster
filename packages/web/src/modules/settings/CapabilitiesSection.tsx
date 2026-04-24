import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Download,
  RotateCw,
  Shell,
  HardDrive,
  Radar,
  ScanSearch,
  Bot,
  type LucideIcon,
} from 'lucide-react'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { InstallTask } from '@/shared/components/InstallTask'
import type { InstallStatus } from '@/shared/hooks/useInstallTask'
import { platformResults } from '@/shared/adapters/platformResults'
import { useCapabilityManager } from '@/modules/setup/useCapabilityManager'
import {
  CAPABILITIES,
  type CapabilityId,
  type CapabilityStatus,
  type InstallProgress,
} from '@/modules/setup/types'

const CAPABILITY_ICONS: Record<CapabilityId, LucideIcon> = {
  engine: Shell,
  memory: HardDrive,
  observe: Radar,
  ocr: ScanSearch,
  agent: Bot,
}

const CAPABILITY_DESC_KEYS: Record<CapabilityId, string> = {
  engine: 'capability.engine.desc',
  memory: 'capability.memory.desc',
  observe: 'capability.observe.desc',
  ocr: 'capability.ocr.desc',
  agent: 'capability.agent.desc',
}
const DEFAULT_NPM_PROXY_REGISTRY_URL = 'https://registry.npmmirror.com'

function toInstallStatus(progress: InstallProgress | undefined): InstallStatus {
  if (!progress) return 'idle'
  if (progress.status === 'waiting' || progress.status === 'installing') return 'running'
  return progress.status
}

function CapabilityRow({
  capability,
  progress,
  anyInstalling,
  actionsDisabled,
  onInstall,
  onReinstall,
}: {
  capability: CapabilityStatus
  progress: InstallProgress | undefined
  anyInstalling: boolean
  actionsDisabled: boolean
  onInstall: (id: CapabilityId) => void
  onReinstall: (id: CapabilityId) => void
}) {
  const { t } = useTranslation()
  const Icon = CAPABILITY_ICONS[capability.id]
  const def = CAPABILITIES.find((c) => c.id === capability.id)
  const hasInstallSteps = (def?.installSteps.length ?? 0) > 0
  const rowBusy = progress?.status === 'waiting' || progress?.status === 'installing'

  const statusLabel = (() => {
    if (capability.status === 'checking') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('settings.capabilities.statusChecking')}
        </span>
      )
    }
    if (capability.status === 'installed') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {capability.version
            ? t('settings.capabilities.statusInstalledVersion', { version: capability.version })
            : t('settings.capabilities.statusInstalled')}
        </span>
      )
    }
    if (capability.status === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {capability.error ?? t('settings.capabilities.statusError')}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3.5 w-3.5" />
        {t('settings.capabilities.statusNotInstalled')}
      </span>
    )
  })()

  const action = (() => {
    if (!hasInstallSteps) {
      return (
        <span className="text-xs text-muted-foreground">
          {t('settings.capabilities.noInstallSteps')}
        </span>
      )
    }
    if (capability.status === 'checking' || rowBusy) {
      return (
        <button type="button" disabled className="button-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('settings.capabilities.working')}
        </button>
      )
    }
    if (capability.status === 'installed') {
      return (
        <button
          type="button"
          onClick={() => onReinstall(capability.id)}
          disabled={anyInstalling || actionsDisabled}
          className="button-secondary"
        >
          <RotateCw className="h-4 w-4" />
          {t('settings.capabilities.reinstall')}
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={() => onInstall(capability.id)}
        disabled={anyInstalling || actionsDisabled}
        className="button-primary"
      >
        <Download className="h-4 w-4" />
        {t('settings.capabilities.install')}
      </button>
    )
  })()

  return (
    <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{t(capability.name)}</h4>
            {statusLabel}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(CAPABILITY_DESC_KEYS[capability.id])}
          </p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>

      {progress && (
        <InstallTask
          label={t(capability.name)}
          description={def?.installSteps
            .map((step) => `${step.cmd} ${step.args.join(' ')}`)
            .join(' && ')}
          status={toInstallStatus(progress)}
          progress={progress.progress}
          log={progress.log}
          error={progress.error}
        />
      )}
    </div>
  )
}

export function CapabilitiesSection() {
  const { t } = useTranslation()
  const { capabilities, installProgress, detecting, installing, error, detect, install } =
    useCapabilityManager()

  const [confirmReinstallId, setConfirmReinstallId] = useState<CapabilityId | null>(null)
  const [npmProxyEnabled, setNpmProxyEnabled] = useState(false)
  const [npmProxyRegistryUrl, setNpmProxyRegistryUrl] = useState<string | null>(null)
  const [npmProxyLoading, setNpmProxyLoading] = useState(true)
  const [npmProxySaving, setNpmProxySaving] = useState(false)
  const [npmProxyError, setNpmProxyError] = useState<string | null>(null)
  const [queuedInstallIds, setQueuedInstallIds] = useState<CapabilityId[]>([])
  const npmProxySavePromiseRef = useRef<Promise<void> | null>(null)
  const npmProxyLoadPromiseRef = useRef<Promise<void> | null>(null)
  const npmProxyPersistedEnabledRef = useRef(false)
  const npmProxyPersistedRegistryUrlRef = useRef<string | null>(null)
  const npmProxyRequestedEnabledRef = useRef(false)
  const queuedInstallIdsRef = useRef<Set<CapabilityId>>(new Set())

  useEffect(() => {
    void detect()
  }, [detect])

  useEffect(() => {
    let cancelled = false

    const loadPromise = (async function loadNpmProxy() {
      setNpmProxyLoading(true)
      setNpmProxyError(null)
      const result = await platformResults.getClawmasterNpmProxy()
      if (cancelled) return
      if (!result.success || !result.data) {
        setNpmProxyLoading(false)
        setNpmProxyError(result.error ?? t('common.unknownError'))
        return
      }
      npmProxyPersistedEnabledRef.current = result.data.enabled
      npmProxyPersistedRegistryUrlRef.current = result.data.registryUrl
      npmProxyRequestedEnabledRef.current = result.data.enabled
      setNpmProxyEnabled(result.data.enabled)
      setNpmProxyRegistryUrl(result.data.registryUrl)
      setNpmProxyLoading(false)
    })().finally(() => {
      if (npmProxyLoadPromiseRef.current === loadPromise) {
        npmProxyLoadPromiseRef.current = null
      }
    })

    npmProxyLoadPromiseRef.current = loadPromise

    return () => {
      cancelled = true
    }
  }, [t])

  const effectiveNpmProxyRegistryUrl = npmProxyEnabled
    ? (npmProxyRegistryUrl ?? DEFAULT_NPM_PROXY_REGISTRY_URL)
    : null

  const setCapabilityQueued = useCallback((id: CapabilityId, queued: boolean) => {
    if (queued) {
      queuedInstallIdsRef.current.add(id)
    } else {
      queuedInstallIdsRef.current.delete(id)
    }
    setQueuedInstallIds([...queuedInstallIdsRef.current])
  }, [])

  const handleInstall = useCallback(
    (id: CapabilityId) => {
      if (queuedInstallIdsRef.current.has(id)) {
        return
      }
      setCapabilityQueued(id, true)
      void (async () => {
        try {
          await npmProxyLoadPromiseRef.current
          await npmProxySavePromiseRef.current
          const installOptions = npmProxyRequestedEnabledRef.current
            ? { registryUrl: npmProxyPersistedRegistryUrlRef.current ?? DEFAULT_NPM_PROXY_REGISTRY_URL }
            : undefined
          await install([id], installOptions).catch(() => {})
        } catch {
          return
        } finally {
          setCapabilityQueued(id, false)
        }
      })()
    },
    [install, setCapabilityQueued],
  )

  const handleConfirmReinstall = useCallback(() => {
    if (!confirmReinstallId) return
    const id = confirmReinstallId
    if (queuedInstallIdsRef.current.has(id)) {
      setConfirmReinstallId(null)
      return
    }
    setConfirmReinstallId(null)
    setCapabilityQueued(id, true)
    void (async () => {
      try {
        await npmProxyLoadPromiseRef.current
        await npmProxySavePromiseRef.current
        const installOptions = npmProxyRequestedEnabledRef.current
          ? { registryUrl: npmProxyPersistedRegistryUrlRef.current ?? DEFAULT_NPM_PROXY_REGISTRY_URL }
          : undefined
        await install([id], installOptions).catch(() => {})
      } catch {
        return
      } finally {
        setCapabilityQueued(id, false)
      }
    })()
  }, [confirmReinstallId, install, setCapabilityQueued])

  const handleNpmProxyChange = useCallback(async (enabled: boolean) => {
    npmProxyRequestedEnabledRef.current = enabled
    setNpmProxyEnabled(enabled)
    setNpmProxySaving(true)
    setNpmProxyError(null)

    if (npmProxySavePromiseRef.current) {
      return
    }

    const savePromise = (async () => {
      while (npmProxyPersistedEnabledRef.current !== npmProxyRequestedEnabledRef.current) {
        const requestedEnabled = npmProxyRequestedEnabledRef.current
        const result = await platformResults.saveClawmasterNpmProxy({ enabled: requestedEnabled })

        if (!result.success || !result.data) {
          if (npmProxyRequestedEnabledRef.current !== requestedEnabled) {
            continue
          }

          npmProxyRequestedEnabledRef.current = npmProxyPersistedEnabledRef.current
          setNpmProxyEnabled(npmProxyPersistedEnabledRef.current)
          setNpmProxyRegistryUrl(npmProxyPersistedRegistryUrlRef.current)
          setNpmProxyError(result.error ?? t('common.unknownError'))
          throw new Error(result.error ?? t('common.unknownError'))
        }

        npmProxyPersistedEnabledRef.current = result.data.enabled
        npmProxyPersistedRegistryUrlRef.current = result.data.registryUrl
        if (npmProxyRequestedEnabledRef.current === requestedEnabled) {
          npmProxyRequestedEnabledRef.current = result.data.enabled
          setNpmProxyEnabled(result.data.enabled)
          setNpmProxyRegistryUrl(result.data.registryUrl)
        }
      }
    })()

    const trackedSavePromise = savePromise.finally(() => {
      if (npmProxySavePromiseRef.current === trackedSavePromise) {
        npmProxySavePromiseRef.current = null
        setNpmProxySaving(false)
      }
    })
    npmProxySavePromiseRef.current = trackedSavePromise
    void npmProxySavePromiseRef.current.catch(() => {})
  }, [t])

  const confirmCapability = confirmReinstallId
    ? capabilities.find((c) => c.id === confirmReinstallId)
    : null

  return (
    <section id="settings-capabilities" className="surface-card">
      <div className="section-heading">
        <div>
          <h3 className="section-title">{t('settings.capabilities.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('settings.capabilities.desc')}</p>
        </div>
        <button
          type="button"
          onClick={() => void detect().catch(() => {})}
          disabled={detecting || installing}
          className="button-secondary"
        >
          <RefreshCw className={`h-4 w-4 ${detecting ? 'animate-spin' : ''}`} />
          {t('settings.capabilities.refresh')}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">{t('settings.capabilities.npmProxyTitle')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('settings.capabilities.npmProxyDesc', {
                registry: effectiveNpmProxyRegistryUrl ?? DEFAULT_NPM_PROXY_REGISTRY_URL,
              })}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={npmProxyEnabled}
              disabled={npmProxyLoading || npmProxySaving}
              onChange={(event) => {
                void handleNpmProxyChange(event.currentTarget.checked)
              }}
            />
            <span>{t('settings.capabilities.npmProxyToggle')}</span>
          </label>
        </div>
        {npmProxyError ? (
          <p role="alert" className="text-xs text-red-600 dark:text-red-300">
            {npmProxyError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3">
        {capabilities.length === 0 && detecting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('settings.capabilities.statusChecking')}
          </div>
        ) : (
          capabilities.map((capability) => (
            <CapabilityRow
              key={capability.id}
              capability={capability}
              progress={installProgress[capability.id]}
              anyInstalling={installing}
              actionsDisabled={queuedInstallIds.includes(capability.id)}
              onInstall={handleInstall}
              onReinstall={(id) => setConfirmReinstallId(id)}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmReinstallId !== null}
        title={t('settings.capabilities.reinstallConfirmTitle')}
        description={
          confirmCapability
            ? t('settings.capabilities.reinstallConfirmBody', {
                name: t(confirmCapability.name),
              })
            : undefined
        }
        confirmLabel={t('settings.capabilities.reinstall')}
        busy={installing || (confirmReinstallId !== null && queuedInstallIds.includes(confirmReinstallId))}
        onCancel={() => setConfirmReinstallId(null)}
        onConfirm={handleConfirmReinstall}
      />
    </section>
  )
}
