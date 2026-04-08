import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { platformResults } from '@/shared/adapters/platformResults'
import type { OpenClawConfig } from '@/lib/types'

export default function Config() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      setLoading(true)
      const cfg = await platform.getConfig()
      setConfig(cfg)
      setJsonText(JSON.stringify(cfg, null, 2))
      setJsonError(null)
    } catch (err: any) {
      console.error('Failed to load config:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleJsonChange(text: string) {
    setJsonText(text)
    try {
      JSON.parse(text)
      setJsonError(null)
    } catch (e: any) {
      setJsonError(e.message)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    setSaveError(false)
    try {
      const parsed = JSON.parse(jsonText)
      // Atomic full-config save
      const r = await platformResults.saveFullConfig(parsed)
      if (!r.success) throw new Error(r.error ?? 'Save failed')
      setConfig(parsed)
      setSaveMsg(t('config.saveSuccess'))
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (err: any) {
      setSaveError(true)
      setSaveMsg(t('config.saveFailed', { message: err.message }))
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const text = jsonText || JSON.stringify(config, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'openclaw-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  if (!config) {
    return <div className="state-panel text-red-500">{t('config.loadFailed')}</div>
  }

  // 配置概览摘要
  const gateway = config.gateway || {}
  const providerCount = Object.keys(config.models?.providers || {}).length
  const channelCount = Object.keys(config.channels || {}).length
  const defaultModel = config.agents?.defaults?.model?.primary || t('common.notSet')

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('config.countUnit', { count: providerCount })} {t('config.providers')}</span>
            <span>{t('config.countUnit', { count: channelCount })} {t('config.channels')}</span>
          </div>
          <h1 className="page-title">{t('config.title')}</h1>
          <p className="page-subtitle">{t('config.advancedHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={loadConfig} className="button-secondary">
            {t('common.refresh')}
          </button>
          <button onClick={handleExport} className="button-secondary">
            {t('common.export')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!jsonError}
            className="button-primary"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <SummaryCard label={t('config.gatewayPort')} value={String(gateway.port || 18789)} page={t('layout.nav.gateway')} />
        <SummaryCard label={t('config.defaultModel')} value={defaultModel} page={t('layout.nav.models')} />
        <SummaryCard label={t('config.providers')} value={t('config.countUnit', { count: providerCount })} page={t('layout.nav.models')} />
        <SummaryCard label={t('config.channels')} value={t('config.countUnit', { count: channelCount })} page={t('layout.nav.channels')} />
      </div>

      <div id="config-editor" className="surface-card">
        <div className="section-heading mb-4">
          <span className="text-sm font-medium">openclaw.json</span>
          <span className="text-xs text-muted-foreground font-mono">
            {config ? t('config.charCount', { count: jsonText.length.toLocaleString() }) : ''}
          </span>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          spellCheck={false}
          className="control-textarea h-[55vh] resize-none font-mono"
        />
        {jsonError && (
          <p className="mt-2 text-xs text-red-500">{t('config.jsonError', { error: jsonError })}</p>
        )}
        {saveMsg && (
          <span className={`mt-3 inline-flex text-sm ${saveError ? 'text-red-500' : 'text-green-600'}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, page }: { label: string; value: string; page?: string }) {
  const { t } = useTranslation()
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value truncate font-mono text-[1.65rem]">{value}</p>
      {page && (
        <p className="metric-meta">{t('config.managedIn', { page })}</p>
      )}
    </div>
  )
}
