import { useCallback, useEffect, useState } from 'react'
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

function toInstallStatus(progress: InstallProgress | undefined): InstallStatus {
  if (!progress) return 'idle'
  if (progress.status === 'waiting' || progress.status === 'installing') return 'running'
  return progress.status
}

function CapabilityRow({
  capability,
  progress,
  anyInstalling,
  onInstall,
  onReinstall,
}: {
  capability: CapabilityStatus
  progress: InstallProgress | undefined
  anyInstalling: boolean
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
          disabled={anyInstalling}
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
        disabled={anyInstalling}
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

  useEffect(() => {
    void detect()
  }, [detect])

  const handleInstall = useCallback(
    (id: CapabilityId) => {
      void install([id]).catch(() => {})
    },
    [install],
  )

  const handleConfirmReinstall = useCallback(() => {
    if (!confirmReinstallId) return
    const id = confirmReinstallId
    setConfirmReinstallId(null)
    void install([id]).catch(() => {})
  }, [confirmReinstallId, install])

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
        onCancel={() => setConfirmReinstallId(null)}
        onConfirm={handleConfirmReinstall}
      />
    </section>
  )
}
