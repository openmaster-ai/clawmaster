import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { platformResults } from '@/adapters'
import type { OpenClawAgentListItem, OpenClawBinding } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'

export default function Agents() {
  const { t } = useTranslation()
  const fetcher = useCallback(async () => platformResults.getConfig(), [])
  const { data: config, loading, error, refetch } = useAdapterCall(fetcher)
  const [busyChannel, setBusyChannel] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const agents = config?.agents?.list || []
  const defaults = config?.agents?.defaults || {}
  const channels = useMemo(() => Object.keys(config?.channels || {}), [config?.channels])
  const bindingsMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of config?.bindings || []) {
      if (b.match?.channel && b.agentId) map.set(b.match.channel, b.agentId)
    }
    return map
  }, [config?.bindings])

  if (loading) {
    return <LoadingState message={t('agents.loading')} />
  }

  if (error || config === null) {
    return (
      <div className="py-16 text-center text-sm text-red-500">
        {error ? `${t('agents.loadFailed')}${error}` : t('agents.noConfig')}
      </div>
    )
  }

  async function saveBinding(channel: string, agentId: string) {
    setBusyChannel(channel)
    setActionError(null)
    const trimmed = agentId.trim()
    const r = trimmed
      ? await platformResults.upsertBinding(channel, trimmed)
      : await platformResults.deleteBinding(channel)
    setBusyChannel(null)
    if (!r.success) {
      setActionError(r.error ?? t('agents.bindFailed'))
      return
    }
    await refetch()
  }

  // Icon map for known agent ids
  const agentIcons: Record<string, string> = {
    cipher: '🔐',
    vector: '🎯',
    anya: '🌸',
    hugo: '🎭',
    main: '🏠',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('agents.title')}</h1>
        <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90">
          {t('agents.create')}
        </button>
      </div>

      {/* Default settings */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('agents.defaultsTitle')}</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t('agents.defaultModel')} </span>
            <span className="font-medium">{defaults.model?.primary || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('agents.workspace')} </span>
            <span className="font-mono">{defaults.workspace || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('agents.maxConcurrent')} </span>
            <span className="font-medium">{defaults.maxConcurrent || '-'}</span>
          </div>
        </div>
      </div>

      {/* Agent list */}
      <div className="space-y-3">
        {agents.map((agent: OpenClawAgentListItem) => (
          <div
            key={agent.id}
            className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {agentIcons[agent.id] || agentIcons[agent.id.toLowerCase()] || '🤖'}
                </span>
                <span className="font-medium">{agent.name || agent.id}</span>
                <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {agent.model || defaults.model?.primary}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('agents.workspaceLabel')}{' '}
                <span className="font-mono">{agent.workspace || defaults.workspace}</span>
              </p>
              {agent.agentDir && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('agents.configDir')}{' '}
                  <span className="font-mono">{agent.agentDir}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent">
                {t('agents.edit')}
              </button>
              {agent.id !== 'main' && (
                <button className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent text-red-500">
                  {t('agents.delete')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          {t('agents.noAgents')}
        </div>
      )}

      {/* Route bindings */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">{t('agents.routeBindingsTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-3">{t('agents.routeBindingsHint')}</p>
        {actionError ? <p className="text-sm text-red-500 mb-3">{actionError}</p> : null}
        <div className="space-y-2">
          {channels.map((channel) => {
            const current = bindingsMap.get(channel) ?? ''
            const invalid = current && !agents.some((a) => a.id === current)
            return (
              <div key={channel} className="flex items-center gap-2 text-sm">
                <span className="capitalize bg-muted px-2 py-0.5 rounded min-w-[7rem]">{channel}</span>
                <span className="text-muted-foreground">→</span>
                <select
                  className="px-2 py-1 rounded border border-border bg-background"
                  defaultValue={current}
                  onChange={(e) => void saveBinding(channel, e.target.value)}
                  disabled={busyChannel === channel}
                >
                  <option value="">{t('agents.unbindOption')}</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.id} ({a.id})
                    </option>
                  ))}
                </select>
                {busyChannel === channel ? (
                  <span className="text-xs text-muted-foreground">{t('agents.savingBinding')}</span>
                ) : null}
                {invalid ? (
                  <span className="text-xs text-red-500">{t('agents.invalidBinding')}</span>
                ) : null}
              </div>
            )
          })}
        </div>
        {!channels.length && <p className="text-sm text-muted-foreground">{t('agents.noChannelsToBind')}</p>}
        {!!config?.bindings?.length && (
          <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground space-y-1">
            {(config.bindings as OpenClawBinding[]).map((binding, idx) => (
              <p key={idx}>
                {binding.match?.channel ?? '-'} → {binding.agentId}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">{t('agents.footerHint')}</div>
    </div>
  )
}
