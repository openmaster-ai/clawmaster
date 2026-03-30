import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { getSetupAdapter } from '@/modules/setup/adapters'
import { CHANNEL_TYPES } from '@/modules/setup/types'
import type { OpenClawConfig } from '@/lib/types'

export default function Channels() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingChannel, setAddingChannel] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const cfg = await platform.getConfig()
      setConfig(cfg)
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>
  }

  const channels = config?.channels || {}

  // 已配置的通道
  const configuredChannels = Object.entries(channels)
    .filter(([, ch]: [string, any]) => ch?.accounts && Object.keys(ch.accounts).length > 0)
    .map(([type, ch]: [string, any]) => {
      const typeInfo = CHANNEL_TYPES.find(t => t.id === type)
      const accounts = Object.entries(ch.accounts || {}).map(([id, acc]: [string, any]) => ({ id, ...acc }))
      return { type, label: typeInfo?.name ?? type, accounts, enabled: ch.enabled !== false }
    })

  // 未配置的通道
  const unconfiguredTypes = CHANNEL_TYPES.filter(t => !channels[t.id]?.accounts || Object.keys(channels[t.id]?.accounts || {}).length === 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('channels.title')}</h1>

      {/* 已配置 */}
      {configuredChannels.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">{t('channels.configured')}</h3>
          {configuredChannels.map((ch) => (
            <div key={ch.type} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${ch.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="font-medium">{ch.label}</span>
                <span className="text-xs text-muted-foreground">({t('channels.accountCount', { count: ch.accounts.length })})</span>
              </div>
              <div className="space-y-1.5">
                {ch.accounts.map((acc: any) => (
                  <div key={acc.id} className="flex items-center justify-between pl-4 py-1 border-l-2 border-border">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${acc.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <span className="text-sm">{acc.name || acc.id}</span>
                      {acc.groupPolicy === 'disabled' && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{t('channels.groupDisabled')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加通道 */}
      <div className="space-y-3">
        <h3 className="font-medium">{t('channels.addChannel')}</h3>
        {unconfiguredTypes.map((type) => (
          <div key={type.id}>
            {addingChannel === type.id ? (
              <AddChannelPanel
                channelType={type}
                onClose={() => setAddingChannel(null)}
                onAdded={() => { setAddingChannel(null); loadData() }}
              />
            ) : (
              <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                <span className="font-medium">{t(type.name)}</span>
                <button
                  onClick={() => setAddingChannel(type.id)}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90"
                >
                  {t('channels.configureConnection')}
                </button>
              </div>
            )}
          </div>
        ))}
        {unconfiguredTypes.length === 0 && configuredChannels.length > 0 && (
          <p className="text-sm text-muted-foreground">{t('channels.allConfigured')}</p>
        )}
      </div>
    </div>
  )
}

// ─── 添加通道面板 ───

function AddChannelPanel({
  channelType,
  onClose,
  onAdded,
}: {
  channelType: typeof CHANNEL_TYPES[number]
  onClose: () => void
  onAdded: () => void
}) {
  const { t } = useTranslation()
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adapter = getSetupAdapter()

  const allFilled = channelType.tokenFields.every(f => tokens[f.key]?.trim())

  const handleAdd = async () => {
    if (!allFilled) return
    setBusy(true)
    setError(null)
    try {
      await adapter.onboarding.addChannel(channelType.id, tokens)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="bg-card border border-primary/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t(channelType.name)}</span>
        <div className="flex items-center gap-3">
          <a
            href={channelType.guideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {t('channels.openGuide', { label: t(channelType.guideLabel) })} &rarr;
          </a>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">{t('common.cancel')}</button>
        </div>
      </div>

      {/* 设置步骤 */}
      <ol className="text-xs space-y-1.5 bg-muted/50 rounded-lg p-3">
        {channelType.steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground shrink-0 w-4 text-right">{i + 1}.</span>
            <span className="text-muted-foreground">
              {t(step.text)}
              {step.highlight && <>{'：'}<span className="text-foreground font-medium">{t(step.highlight)}</span></>}
              {step.yieldsToken && ' \u{1F511}'}
            </span>
          </li>
        ))}
      </ol>

      {/* Token 输入 */}
      {channelType.tokenFields.map((field) => (
        <div key={field.key}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium">{field.label}</label>
            <span className="text-[10px] text-muted-foreground">{t(field.hint)}</span>
          </div>
          <input
            type="password"
            placeholder={field.placeholder}
            value={tokens[field.key] ?? ''}
            onChange={(e) => setTokens(prev => ({ ...prev, [field.key]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      ))}

      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        onClick={handleAdd}
        disabled={!allFilled || busy}
        className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {busy ? t('channels.adding') : t('channels.addBtn')}
      </button>
    </div>
  )
}
