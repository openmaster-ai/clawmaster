import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { platformResults } from '@/shared/adapters/platformResults'
import type { OpenClawConfig } from '@/lib/types'

export default function Agents() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const cfg = await platform.getConfig()
      setConfig(cfg)
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAgent() {
    const id = window.prompt(t('agents.enterAgentId'))
    if (!id?.trim()) return
    const name = window.prompt(t('agents.enterAgentName'), id) ?? id
    const model = config?.agents?.defaults?.model?.primary ?? ''
    const r = await platformResults.createAgent({ id: id.trim(), name, model })
    if (r.success) {
      await loadData()
    } else {
      alert(r.error ?? 'Failed to create agent')
    }
  }

  async function handleDeleteAgent(agentId: string) {
    if (!window.confirm(t('agents.deleteConfirm', { id: agentId }))) return
    const r = await platformResults.deleteAgent(agentId)
    if (r.success) {
      await loadData()
    } else {
      alert(r.error ?? 'Failed to delete agent')
    }
  }

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  const agents = config?.agents?.list || []
  const defaults = config?.agents?.defaults || {}

  return (
    <div className="page-shell page-shell-medium">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('dashboard.agentsConfigured', { count: agents.length })}</span>
          </div>
          <h1 className="page-title">{t('agents.title')}</h1>
        </div>
        <button className="button-primary" onClick={handleCreateAgent}>
          {t('agents.createAgent')}
        </button>
      </div>

      <div className="surface-card">
        <div className="section-heading">
          <h3 className="section-title">{t('agents.defaults')}</h3>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-muted-foreground">{t('agents.defaultModel')}</p>
            <p className="font-medium">{defaults.model?.primary || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('agents.workspace')}</p>
            <p className="font-mono text-xs">{defaults.workspace || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('agents.maxConcurrent')}</p>
            <p className="font-medium">{defaults.maxConcurrent || '-'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {agents.map((agent: any) => (
          <div key={agent.id} className="list-card flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {(agent.name || agent.id)[0]?.toUpperCase() || 'A'}
                </span>
                <span className="font-medium">{agent.name || agent.id}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {agent.model || defaults.model?.primary}
                </span>
              </div>
              {agent.workspace && (
                <p className="text-xs text-muted-foreground mt-1 pl-10">
                  {t('agents.workspace')}: <span className="font-mono">{agent.workspace}</span>
                </p>
              )}
              {agent.agentDir && (
                <p className="text-xs text-muted-foreground mt-0.5 pl-10">
                  {t('agents.config')}: <span className="font-mono">{agent.agentDir}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {agent.id !== 'main' && (
                <button
                  className="button-danger px-3 py-1.5"
                  onClick={() => handleDeleteAgent(agent.id)}
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="state-panel text-muted-foreground">
          {t('agents.noAgents')}
        </div>
      )}

      <div className="surface-card">
        <div className="section-heading">
          <h3 className="section-title">{t('agents.routeBinding')}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{t('agents.routeBindingDesc')}</p>
        {config?.bindings?.map((binding: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-sm py-1">
            <span className="capitalize bg-muted px-2 py-0.5 rounded">{binding.match?.channel}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="font-medium">{binding.agentId}</span>
          </div>
        ))}
        {!config?.bindings?.length && (
          <p className="text-sm text-muted-foreground">{t('agents.noRouteBinding')}</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t('agents.editConfigHint')}</p>
    </div>
  )
}
