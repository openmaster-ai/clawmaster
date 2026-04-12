import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { platform } from '@/adapters'
import { platformResults } from '@/shared/adapters/platformResults'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { OpenClawConfig } from '@/lib/types'

export default function Agents() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [newAgentId, setNewAgentId] = useState('')
  const [newAgentName, setNewAgentName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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
    const id = newAgentId.trim()
    if (!id) return
    const name = newAgentName.trim() || id
    const model = config?.agents?.defaults?.model?.primary ?? ''
    setCreateBusy(true)
    const r = await platformResults.createAgent({ id: id.trim(), name, model })
    if (r.success) {
      setCreateOpen(false)
      setNewAgentId('')
      setNewAgentName('')
      await loadData()
    } else {
      setFeedback(r.error ?? 'Failed to create agent')
    }
    setCreateBusy(false)
  }

  async function handleDeleteAgent(agentId: string) {
    const r = await platformResults.deleteAgent(agentId)
    if (r.success) {
      await loadData()
    } else {
      setFeedback(r.error ?? 'Failed to delete agent')
    }
  }

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  const agents = config?.agents?.list || []
  const defaults = config?.agents?.defaults || {}

  return (
    <div className="page-shell page-shell-medium">
      {feedback ? <ActionBanner tone="error" message={feedback} onDismiss={() => setFeedback(null)} /> : null}
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('dashboard.agentsConfigured', { count: agents.length })}</span>
          </div>
          <h1 className="page-title">{t('agents.title')}</h1>
        </div>
        <button
          className="button-primary"
          onClick={() => {
            setCreateOpen(true)
            setNewAgentId('')
            setNewAgentName('')
          }}
        >
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
                  onClick={() => setPendingDeleteId(agent.id)}
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
      <ConfirmDialog
        open={createOpen}
        title={t('agents.createAgent')}
        confirmLabel={t('common.save')}
        busy={createBusy}
        onCancel={() => {
          if (createBusy) return
          setCreateOpen(false)
        }}
        onConfirm={() => {
          if (!newAgentId.trim()) return
          void handleCreateAgent()
        }}
      >
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="control-label">{t('agents.enterAgentId')}</span>
            <input
              value={newAgentId}
              onChange={(event) => {
                setNewAgentId(event.target.value)
                if (!newAgentName.trim()) setNewAgentName(event.target.value)
              }}
              className="control-input"
            />
          </label>
          <label className="grid gap-2">
            <span className="control-label">{t('agents.enterAgentName')}</span>
            <input
              value={newAgentName}
              onChange={(event) => setNewAgentName(event.target.value)}
              className="control-input"
            />
          </label>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title={pendingDeleteId ? t('agents.deleteConfirm', { id: pendingDeleteId }) : ''}
        tone="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (!pendingDeleteId) return
          const agentId = pendingDeleteId
          setPendingDeleteId(null)
          void handleDeleteAgent(agentId)
        }}
      />
    </div>
  )
}
