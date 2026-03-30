import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, RefreshCw, Check, X, MessageSquare } from 'lucide-react'
import { platform } from '@/adapters'
import { getSetupAdapter } from '@/modules/setup/adapters'
import type { SetupAdapter } from '@/modules/setup/adapters'
import { getChannelStatus, probeChannels, type ChannelHealth } from '@/shared/adapters/channel-status'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { CHANNEL_TYPES } from '@/modules/setup/types'
import type { OpenClawConfig } from '@/lib/types'

export default function Channels() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const health = useAdapterCall<ChannelHealth>(() => getChannelStatus(), { pollInterval: 30000 })
  const [probing, setProbing] = useState(false)

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

  async function handleProbe() {
    setProbing(true)
    await probeChannels()
    await health.refetch()
    setProbing(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t('common.loading')}</div>
  }

  const channels = config?.channels || {}
  const selected = CHANNEL_TYPES.find(c => c.id === selectedChannel)

  function isConfigured(id: string): boolean {
    const ch = channels[id] as any
    return ch?.accounts && Object.keys(ch.accounts).length > 0
  }

  function getHealthStatus(id: string): string | null {
    return health.data?.channels[id]?.status ?? null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('channels.title')}</h1>
        <button
          onClick={handleProbe}
          disabled={probing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
          {t('channels.probe')}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Channel Grid */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
          {CHANNEL_TYPES.map((ch) => {
            const configured = isConfigured(ch.id)
            const healthStatus = getHealthStatus(ch.id)
            const isActive = selectedChannel === ch.id
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(isActive ? null : ch.id)}
                className={`bg-card border rounded-lg p-4 text-left transition hover:border-primary/50 ${
                  isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{t(ch.name)}</span>
                  {configured ? (
                    <span className="flex items-center gap-1">
                      {healthStatus === 'connected' || healthStatus === 'ready' ? (
                        <Wifi className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      )}
                    </span>
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {configured ? t('channels.configured') : ch.qrLogin ? t('channel.qr.desc') : t('channels.addChannel')}
                </p>
              </button>
            )
          })}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-96 shrink-0">
            <SetupPanel
              channelType={selected}
              onClose={() => setSelectedChannel(null)}
              onAdded={() => { setSelectedChannel(null); loadData() }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Setup Panel ───

function SetupPanel({
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
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-medium">{t(channelType.name)}</span>
        <div className="flex items-center gap-2">
          <a
            href={channelType.guideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            {t(channelType.guideLabel)} &rarr;
          </a>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Steps */}
        <ol className="text-xs space-y-1.5">
          {channelType.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-4 text-right">{i + 1}.</span>
              <span className="text-muted-foreground">
                {t(step.text)}
                {step.highlight && <>{'：'}<span className="text-foreground font-medium">{t(step.highlight)}</span></>}
                {step.yieldsToken && <span className="text-primary ml-1">*</span>}
              </span>
            </li>
          ))}
        </ol>

        {/* Permissions template */}
        {channelType.permissionsTemplate && (
          <div className="bg-muted/50 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium">{t('channel.feishu.permissionsTitle')}</p>
              <button
                onClick={() => navigator.clipboard.writeText(channelType.permissionsTemplate!)}
                className="text-xs text-primary hover:underline"
              >
                {t('common.copyToClipboard')}
              </button>
            </div>
            <pre className="text-[10px] text-muted-foreground max-h-20 overflow-auto font-mono">{channelType.permissionsTemplate}</pre>
          </div>
        )}

        {/* QR Login */}
        {channelType.qrLogin ? (
          <QrLoginPanel channel={channelType} onConnected={onAdded} adapter={adapter} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

// ─── QR Login Panel ───

function QrLoginPanel({
  channel,
  onConnected,
  adapter,
}: {
  channel: typeof CHANNEL_TYPES[number]
  onConnected: () => void
  adapter: SetupAdapter
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'installing' | 'scanning' | 'connected' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function startLogin() {
    setError(null)
    if (channel.installPlugin) {
      setStatus('installing')
      try {
        await adapter.onboarding.installPlugin(channel.installPlugin)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
        return
      }
    }
    setStatus('scanning')
    try {
      const result = await adapter.onboarding.loginChannel(channel.id)
      if (result === 'connected') {
        setStatus('connected')
        setTimeout(onConnected, 1000)
      } else {
        setError(t('channel.qr.timeout'))
        setStatus('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <div className="text-center py-4">
      {status === 'idle' && (
        <>
          <p className="text-xs text-muted-foreground mb-3">{t('channel.qr.desc')}</p>
          <button onClick={startLogin} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm">
            {t('channel.qr.start')}
          </button>
        </>
      )}
      {status === 'installing' && (
        <p className="text-muted-foreground animate-pulse text-sm">{t('channel.qr.installing', { name: t(channel.name) })}</p>
      )}
      {status === 'scanning' && (
        <>
          <div className="w-40 h-40 mx-auto mb-3 border-2 border-dashed border-border rounded-lg flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-xs text-muted-foreground">{t('channel.qr.scanHint')}</p>
        </>
      )}
      {status === 'connected' && (
        <>
          <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-green-600 font-medium text-sm">{t('channel.qr.connected')}</p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="text-red-500 text-xs mb-3">{error}</p>
          <button onClick={startLogin} className="px-4 py-1.5 text-sm border border-border rounded-lg hover:bg-accent">
            {t('common.retry')}
          </button>
        </>
      )}
    </div>
  )
}
