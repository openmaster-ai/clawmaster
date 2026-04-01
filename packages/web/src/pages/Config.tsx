import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
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
      await platform.saveFullConfig(parsed)
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
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>
  }

  if (!config) {
    return <div className="text-red-500">{t('config.loadFailed')}</div>
  }

  // 配置概览摘要
  const gateway = config.gateway || {}
  const providerCount = Object.keys(config.models?.providers || {}).length
  const channelCount = Object.keys(config.channels || {}).length
  const defaultModel = config.agents?.defaults?.model?.primary || t('common.notSet')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('config.title')}</h1>

      {/* 配置概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label={t('config.gatewayPort')} value={String(gateway.port || 18789)} page={t('layout.nav.gateway')} />
        <SummaryCard label={t('config.defaultModel')} value={defaultModel} page={t('layout.nav.models')} />
        <SummaryCard label={t('config.providers')} value={t('config.countUnit', { count: providerCount })} page={t('layout.nav.models')} />
        <SummaryCard label={t('config.channels')} value={t('config.countUnit', { count: channelCount })} page={t('layout.nav.channels')} />
      </div>

      <p className="text-xs text-muted-foreground">
        {t('config.advancedHint')}
      </p>

      {/* JSON 编辑器 */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">openclaw.json</span>
          <span className="text-xs text-muted-foreground font-mono">
            {config ? t('config.charCount', { count: jsonText.length.toLocaleString() }) : ''}
          </span>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          spellCheck={false}
          className="w-full h-[55vh] text-sm font-mono bg-background p-4 rounded border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {jsonError && (
          <p className="mt-2 text-xs text-red-500">{t('config.jsonError', { error: jsonError })}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !!jsonError}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button
          onClick={loadConfig}
          className="px-4 py-2 border border-border rounded hover:bg-accent"
        >
          {t('common.refresh')}
        </button>
        <button
          onClick={handleExport}
          className="px-4 py-2 border border-border rounded hover:bg-accent"
        >
          {t('common.export')}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveError ? 'text-red-500' : 'text-green-600'}`}>
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
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 font-mono truncate">{value}</p>
      {page && (
        <p className="text-[10px] text-muted-foreground mt-1">{t('config.managedIn', { page })}</p>
      )}
    </div>
  )
}
