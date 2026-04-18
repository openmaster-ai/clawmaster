import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { useCapabilityManager } from '@/modules/setup/useCapabilityManager'
import { CAPABILITIES } from '@/modules/setup/types'

export function CapabilitiesBanner() {
  const { t } = useTranslation()
  const { capabilities, detecting, error, detect } = useCapabilityManager()

  useEffect(() => {
    void detect().catch(() => {})
  }, [detect])

  const installableMissing = useMemo(() => {
    const idsWithInstallSteps = new Set(
      CAPABILITIES.filter((c) => c.installSteps.length > 0).map((c) => c.id),
    )
    return capabilities.filter(
      (c) => c.status === 'not_installed' && idsWithInstallSteps.has(c.id),
    )
  }, [capabilities])

  if (detecting && capabilities.length === 0) return null

  if (error && capabilities.length === 0) {
    return (
      <div className="surface-card border-red-500/30 bg-red-500/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t('dashboard.capabilitiesBanner.errorText')}
              </p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
          <Link to="/settings#settings-capabilities" className="button-secondary">
            {t('dashboard.capabilitiesBanner.action')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    )
  }

  if (installableMissing.length === 0) return null

  return (
    <div className="surface-card border-amber-500/30 bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t('dashboard.capabilitiesBanner.text', { count: installableMissing.length })}
            </p>
            <p className="text-xs text-muted-foreground">
              {installableMissing.map((c) => t(c.name)).join(' · ')}
            </p>
          </div>
        </div>
        <Link to="/settings#settings-capabilities" className="button-primary">
          {t('dashboard.capabilitiesBanner.action')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
