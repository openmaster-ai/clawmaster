import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { SystemInfo } from '@/lib/types'
import { webFetch } from '@/shared/adapters/webHttp'

interface StartupDetectorProps {
  onDetected: (info: SystemInfo) => void
  onNewInstall: () => void
  onError: (error: string) => void
}

async function invokeTauri<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke(cmd, args)
  }
  throw new Error('Not in Tauri environment')
}

async function detectTauri(): Promise<SystemInfo> {
  return invokeTauri<SystemInfo>('detect_system')
}

async function detectWeb(): Promise<SystemInfo> {
  const res = await webFetch('/api/system/detect')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function StartupDetector({ onDetected, onNewInstall, onError }: StartupDetectorProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'checking' | 'detected' | 'not-installed' | 'error'>('checking')
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [message, setMessage] = useState('')
  const [isTauriDetected, setIsTauriDetected] = useState<boolean | null>(null)

  useEffect(() => {
    const inTauri = typeof window !== 'undefined' && '__TAURI__' in window
    setIsTauriDetected(inTauri)
    detect()
  }, [])

  async function detect() {
    try {
      setMessage(t('startup.detecting'))
      setStatus('checking')

      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        setMessage(t('startup.detectingTauri'))
        const info = await detectTauri()
        setSystemInfo(info)
        setStatus(info.openclaw.installed ? 'detected' : 'not-installed')
        setMessage(info.openclaw.installed ? t('startup.detected') : t('startup.notInstalled'))
        return
      }

      setMessage(t('startup.detectingWeb'))
      const info = await detectWeb()
      setSystemInfo(info)
      setStatus(info.openclaw.installed ? 'detected' : 'not-installed')
      setMessage(info.openclaw.installed ? t('startup.detected') : t('startup.notInstalled'))
    } catch (err: any) {
      setStatus('error')
      const errorMsg = err.message || t('startup.detectFailed')
      setMessage(errorMsg)
      onError(errorMsg)
    }
  }

  if (status === 'checking') {
    return (
      <div className="fullscreen-shell">
        <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white text-3xl mb-4 animate-pulse">
          <img src="/logo.svg" alt="" className="w-8 h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <h1 className="text-xl font-bold mb-2">ClawMaster</h1>
        <p className="text-muted-foreground">{message}</p>
        {isTauriDetected !== null && (
          <p className="text-xs text-muted-foreground mt-2">
            {t('startup.mode')}: {isTauriDetected ? t('startup.modeDesktop') : t('startup.modeWeb')}
          </p>
        )}
      </div>
    )
  }

  if (status === 'detected' && systemInfo) {
    return (
      <div className="fullscreen-shell">
        <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white text-3xl mb-4">
          <img src="/logo.svg" alt="" className="w-8 h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <h1 className="text-xl font-bold mb-2">{t('startup.detected')}</h1>
        <p className="text-muted-foreground mb-6">{t('startup.canTakeover')}</p>

        <div className="fullscreen-panel">
          <h3 className="font-medium mb-3">{t('startup.systemInfo')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startup.openclawVersion')}</span>
              <span className="font-medium">{systemInfo.openclaw.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('startup.configFile')}</span>
              <span className="font-mono text-xs">{systemInfo.openclaw.configPath}</span>
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
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onDetected(systemInfo)}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t('startup.takeover')}
          </button>
          <button
            onClick={onNewInstall}
            className="px-6 py-2 border border-border rounded-lg hover:bg-accent"
          >
            {t('startup.freshInstall')}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'not-installed') {
    return (
      <div className="fullscreen-shell">
        <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center text-3xl mb-4">
          <img src="/logo.svg" alt="" className="w-8 h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <h1 className="text-xl font-bold mb-2">{t('startup.notInstalled')}</h1>
        <p className="text-muted-foreground mb-6">{t('startup.canHelp')}</p>

        <div className="fullscreen-panel">
          <h3 className="font-medium mb-3">{t('startup.requirements')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {systemInfo?.nodejs.installed ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span>Node.js 18+</span>
              {systemInfo?.nodejs.installed && (
                <span className="text-muted-foreground ml-auto">{systemInfo.nodejs.version}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {systemInfo?.npm.installed ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span>npm</span>
              {systemInfo?.npm.installed && (
                <span className="text-muted-foreground ml-auto">{systemInfo.npm.version}</span>
              )}
            </div>
          </div>
        </div>

        {systemInfo?.nodejs.installed && systemInfo?.npm.installed ? (
          <button
            onClick={onNewInstall}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            {t('startup.startInstall')}
          </button>
        ) : (
          <div className="text-center">
            <p className="text-red-500 mb-3">{t('startup.needNodejs')}</p>
            <a
              href="https://nodejs.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('startup.downloadNodejs')}
            </a>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fullscreen-shell">
      <div className="w-16 h-16 bg-red-500 rounded-lg flex items-center justify-center text-white mb-4">
        <XCircle className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-bold mb-2">{t('startup.detectFailed')}</h1>
      <p className="mb-4 w-full max-w-md text-center text-red-500">{message}</p>

      {isTauriDetected === false && (
        <div className="fullscreen-panel">
          <h3 className="font-medium mb-2">{t('startup.tauriNotDetected')}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t('startup.tauriNotDetectedDesc')}</p>
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
