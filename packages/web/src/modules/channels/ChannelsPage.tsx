import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Circle,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Pin,
  Puzzle,
  Radio,
  Send,
  Shield,
  Smartphone,
  Users,
} from 'lucide-react'
import { platformResults } from '@/adapters'
import type { OpenClawChannelEntry } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { isTauri } from '@/shared/adapters/platform'
import { LoadingState } from '@/shared/components/LoadingState'
import { buildChannelRegistry } from '@/modules/channels/channelRegistry'
import type { ChannelFieldDef } from '@/modules/channels/channelRegistry'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

type ConfiguredAccountRow = {
  id: string
  name?: string
  enabled?: boolean
  groupPolicy?: string
}

type ConfiguredChannelRow = {
  type: string
  typeName: string
  icon: LucideIcon
  accounts: ConfiguredAccountRow[]
  enabled: boolean
}

function parseAccount(id: string, raw: unknown): ConfiguredAccountRow {
  if (!isRecord(raw)) {
    return { id }
  }
  const name = typeof raw.name === 'string' ? raw.name : undefined
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : undefined
  const groupPolicy = typeof raw.groupPolicy === 'string' ? raw.groupPolicy : undefined
  return { id, name, enabled, groupPolicy }
}

const CHANNEL_TYPE_ORDER = [
  'feishu',
  'telegram',
  'discord',
  'qq',
  'dingtalk',
  'wechat',
  'matrix',
  'teams',
  'whatsapp',
  'signal',
  'slack',
] as const

const CHANNEL_ICONS: Record<(typeof CHANNEL_TYPE_ORDER)[number], LucideIcon> = {
  feishu: Pin,
  telegram: Send,
  discord: MessageSquare,
  qq: MessageCircle,
  dingtalk: Paperclip,
  wechat: Circle,
  matrix: Puzzle,
  teams: Users,
  whatsapp: Smartphone,
  signal: Shield,
  slack: Briefcase,
}

type ChannelTypeRow = {
  id: (typeof CHANNEL_TYPE_ORDER)[number]
  name: string
  icon: LucideIcon
  description: string
}

export default function Channels() {
  const { t, i18n } = useTranslation()
  const registry = useMemo(() => buildChannelRegistry(t), [t, i18n.language])
  const channelTypes: ChannelTypeRow[] = useMemo(
    () =>
      CHANNEL_TYPE_ORDER.map((id) => ({
        id,
        icon: CHANNEL_ICONS[id],
        name: t(`channelsPage.types.${id}.name`),
        description: t(`channelsPage.types.${id}.description`),
      })),
    [t, i18n.language]
  )

  const fetcher = useCallback(async () => platformResults.getConfig(), [])
  const { data: config, loading, error, refetch } = useAdapterCall(fetcher)

  const [modalOpen, setModalOpen] = useState(false)
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTypeId, setEditorTypeId] = useState<string | null>(null)
  const [editorAccountId, setEditorAccountId] = useState('default')
  const [editorEnabled, setEditorEnabled] = useState(true)
  const [editorAccountEnabled, setEditorAccountEnabled] = useState(true)
  const [editorAccountName, setEditorAccountName] = useState('')
  const [editorValues, setEditorValues] = useState<Record<string, string>>({})
  const [editorError, setEditorError] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null)
  const [editorAgentId, setEditorAgentId] = useState('')

  const channels: Record<string, OpenClawChannelEntry> = config?.channels || {}
  const allAgents = config?.agents?.list ?? []
  const editorRegistry = useMemo(
    () => (editorTypeId ? registry[editorTypeId] ?? null : null),
    [registry, editorTypeId]
  )
  const editorFields: ChannelFieldDef[] = editorRegistry?.fields ?? []

  function setEditorField(key: string, value: string) {
    setEditorValues((s) => {
      const next = { ...s, [key]: value }
      if (editorTypeId === 'slack' && key === 'mode') {
        if (value === 'socket') next.signingSecret = ''
        if (value === 'http') next.appToken = ''
      }
      return next
    })
  }

  function getConfiguredChannels(): ConfiguredChannelRow[] {
    const result: ConfiguredChannelRow[] = []

    for (const [type, ch] of Object.entries(channels)) {
      const known = channelTypes.find((row) => row.id === type)
      const typeName = known?.name ?? type
      const icon = known?.icon ?? Radio
      const accountsMap = ch.accounts
      if (!accountsMap) continue

      const accounts: ConfiguredAccountRow[] = Object.entries(accountsMap).map(([id, acc]) =>
        parseAccount(id, acc)
      )

      result.push({
        type,
        typeName,
        icon,
        accounts,
        enabled: ch.enabled !== false,
      })
    }

    return result
  }

  const configuredChannels = getConfiguredChannels()
  const missingTypes = channelTypes.filter((type) => !channels[type.id])

  function openAddModal(initialTypeId?: string) {
    const list = channelTypes.filter((row) => !channels[row.id])
    if (list.length === 0) {
      window.alert(t('channelsPage.allTypesPresent'))
      return
    }
    setPendingTypeId(initialTypeId ?? list[0].id)
    setModalOpen(true)
  }

  function openChannelEditor(typeId: string, accountId?: string) {
    const current = channels[typeId]
    const currentObj = current && isRecord(current) ? current : {}
    const accountsMap = isRecord(currentObj.accounts)
      ? (currentObj.accounts as Record<string, unknown>)
      : {}
    const resolvedAccountId = accountId ?? Object.keys(accountsMap)[0] ?? 'default'
    const rawAccount = isRecord(accountsMap[resolvedAccountId])
      ? (accountsMap[resolvedAccountId] as Record<string, unknown>)
      : {}
    const reg = registry[typeId]
    const initialValues: Record<string, string> = {}
    for (const f of reg?.fields ?? []) {
      const v = rawAccount[f.key]
      initialValues[f.key] = v == null ? '' : String(v)
    }
    if (typeId === 'slack' && !initialValues.mode?.trim()) {
      initialValues.mode = 'socket'
    }
    setEditorTypeId(typeId)
    setEditorAccountId(resolvedAccountId)
    setEditorEnabled(currentObj.enabled !== false)
    setEditorAccountEnabled(rawAccount.enabled !== false)
    setEditorAccountName(typeof rawAccount.name === 'string' ? rawAccount.name : '')
    setEditorValues(initialValues)
    const binding = (config?.bindings ?? []).find((b) => b?.match?.channel === typeId)
    setEditorAgentId(binding?.agentId ?? '')
    setEditorError(null)
    setVerifyResult(null)
    setEditorOpen(true)
  }

  async function runVerifyEditor() {
    if (!editorTypeId) return
    const account: Record<string, unknown> = {
      enabled: editorAccountEnabled,
    }
    if (editorAccountName.trim()) account.name = editorAccountName.trim()
    for (const f of editorFields) {
      const raw = (editorValues[f.key] ?? '').trim()
      if (!raw) continue
      account[f.key] = f.type === 'number' ? Number(raw) : raw
    }
    setVerifyBusy(true)
    setVerifyResult(null)
    const r = await platformResults.verifyChannelAccount(editorTypeId, account)
    setVerifyBusy(false)
    if (!r.success || !r.data) {
      setVerifyResult({ ok: false, message: r.error ?? t('channelsPage.verifyFailed') })
      return
    }
    setVerifyResult(r.data)
  }

  async function saveChannelEditor() {
    if (!editorTypeId || !config) return
    for (const f of editorFields) {
      const required =
        f.required ||
        (f.requiredWhen ? (editorValues[f.requiredWhen.key] ?? '') === f.requiredWhen.value : false)
      if (required && !(editorValues[f.key] ?? '').trim()) {
        setEditorError(t('channelsPage.requiredField', { label: f.label }))
        return
      }
    }
    if (!editorAccountId.trim()) {
      setEditorError(t('channelsPage.accountIdRequired'))
      return
    }

    setBusy(true)
    setEditorError(null)
    try {
      const current = channels[editorTypeId]
      const currentObj: Record<string, unknown> =
        current && isRecord(current) ? ({ ...current } as Record<string, unknown>) : {}
      const accounts: Record<string, unknown> = isRecord(currentObj.accounts)
        ? ({ ...(currentObj.accounts as Record<string, unknown>) } as Record<string, unknown>)
        : {}

      const existingAccount = isRecord(accounts[editorAccountId.trim()])
        ? ({ ...(accounts[editorAccountId.trim()] as Record<string, unknown>) } as Record<string, unknown>)
        : {}

      const nextAccount: Record<string, unknown> = {
        ...existingAccount,
        enabled: editorAccountEnabled,
      }
      if (editorAccountName.trim()) nextAccount.name = editorAccountName.trim()
      else delete nextAccount.name

      for (const f of editorFields) {
        const raw = (editorValues[f.key] ?? '').trim()
        if (!raw) {
          delete nextAccount[f.key]
          continue
        }
        if (f.type === 'number') {
          const n = Number(raw)
          if (!Number.isNaN(n)) nextAccount[f.key] = n
        } else {
          nextAccount[f.key] = raw
        }
      }
      accounts[editorAccountId.trim()] = nextAccount
      currentObj.enabled = editorEnabled
      currentObj.accounts = accounts

      const next = {
        ...config,
        channels: {
          ...(config.channels || {}),
          [editorTypeId]: currentObj as OpenClawChannelEntry,
        },
      }
      const r = await platformResults.saveFullConfig(next)
      if (!r.success) {
        setEditorError(r.error ?? t('channelsPage.saveFailed'))
        return
      }
      if (editorAgentId.trim()) {
        const br = await platformResults.upsertBinding(editorTypeId, editorAgentId.trim())
        if (!br.success) {
          setEditorError(br.error ?? t('channelsPage.bindAgentFailed'))
          return
        }
      } else {
        const dr = await platformResults.deleteBinding(editorTypeId)
        if (!dr.success) {
          setEditorError(dr.error ?? t('channelsPage.unbindFailed'))
          return
        }
      }
      setEditorOpen(false)
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  async function submitAddChannel() {
    if (!pendingTypeId) return
    setModalOpen(false)
    openChannelEditor(pendingTypeId)
  }

  async function removeChannelType(typeId: string, label: string) {
    if (!window.confirm(t('channelsPage.removeConfirm', { label }))) {
      return
    }
    setBusy(true)
    try {
      const r = await platformResults.removeChannel(typeId)
      if (!r.success) {
        window.alert(r.error ?? t('channelsPage.removeFailed'))
        return
      }
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  async function toggleChannelEnabled(typeId: string, enabled: boolean) {
    setBusy(true)
    try {
      const r = await platformResults.setConfig(`channels.${typeId}.enabled`, enabled)
      if (!r.success) {
        window.alert(r.error ?? t('channelsPage.toggleFailed'))
        return
      }
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <LoadingState message={t('channelsPage.loading')} />
  }

  if (error || config === null) {
    return (
      <div className="state-panel text-sm text-red-500">
        {error ? `${t('channelsPage.loadFailed')}${error}` : t('channelsPage.noConfig')}
      </div>
    )
  }

  const pendingMeta = pendingTypeId ? channelTypes.find((row) => row.id === pendingTypeId) : null

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('config.countUnit', { count: configuredChannels.length })} {t('channelsPage.configured')}</span>
            <span>{t('config.countUnit', { count: missingTypes.length })} {t('channelsPage.addNewSection')}</span>
          </div>
          <h1 className="page-title">{t('channelsPage.title')}</h1>
          <p className="page-subtitle">{t('channelsPage.footerNote')}</p>
        </div>
        <button
          type="button"
          disabled={busy || missingTypes.length === 0}
          onClick={() => openAddModal()}
          className="button-primary disabled:opacity-50"
        >
          {t('channelsPage.add')}
        </button>
      </div>

      {configuredChannels.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">{t('channelsPage.configured')}</h3>
          {configuredChannels.map((ch) => (
            <div key={ch.type} className="surface-card">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ch.icon className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">{ch.typeName}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${ch.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleChannelEnabled(ch.type, !ch.enabled)}
                    className="button-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {ch.enabled ? t('channelsPage.disable') : t('channelsPage.enable')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openChannelEditor(ch.type)}
                    className="button-secondary px-3 py-1.5 text-sm"
                  >
                    {t('channelsPage.settings')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeChannelType(ch.type, ch.typeName)}
                    className="button-danger px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {t('channelsPage.removeChannel')}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {ch.accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between pl-6 py-1.5 border-l-2 border-border gap-2 flex-wrap"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${acc.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <span className="text-sm font-medium">{acc.name || acc.id}</span>
                      {acc.groupPolicy === 'disabled' && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {t('channelsPage.groupChatDisabled')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openChannelEditor(ch.type, acc.id)}
                        className="button-secondary px-2 py-1 text-xs"
                      >
                        {t('channelsPage.edit')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!config) return
                          if (!window.confirm(t('channelsPage.deleteAccountConfirm', { id: acc.id }))) return
                          const current = channels[ch.type]
                          if (!current || !isRecord(current) || !isRecord(current.accounts)) return
                          const nextAccounts = { ...(current.accounts as Record<string, unknown>) }
                          delete nextAccounts[acc.id]
                          setBusy(true)
                          try {
                            const next = {
                              ...config,
                              channels: {
                                ...(config.channels || {}),
                                [ch.type]: {
                                  ...current,
                                  accounts: nextAccounts,
                                } as OpenClawChannelEntry,
                              },
                            }
                            const r = await platformResults.saveFullConfig(next)
                            if (!r.success) {
                              window.alert(r.error ?? t('channelsPage.deleteAccountFailed'))
                              return
                            }
                            await refetch()
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="button-secondary px-2 py-1 text-xs text-muted-foreground"
                      >
                        {t('channelsPage.removeAccount')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div id="add-channel-list" className="space-y-3">
        <h3 className="font-medium">{t('channelsPage.addNewSection')}</h3>
        {missingTypes.map((type) => (
          <div
            key={type.id}
            className="surface-card flex items-center justify-between gap-4 flex-wrap"
          >
            <div className="flex items-center gap-3 min-w-0">
              <type.icon className="w-6 h-6 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-medium">{type.name}</span>
                <p className="text-sm text-muted-foreground">{type.description}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => openChannelEditor(type.id)}
              className="button-primary shrink-0 disabled:opacity-50"
            >
              {t('channelsPage.settings')}
            </button>
          </div>
        ))}

        {missingTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('channelsPage.allConfigured')}</p>
        )}
      </div>

      <div className="inline-note text-xs leading-relaxed">{t('channelsPage.footerNote')}</div>

      {modalOpen && pendingMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-modal-title"
          onClick={() => !busy && setModalOpen(false)}
        >
          <div
            className="w-[min(100%,28rem)] rounded-[1.5rem] border border-border bg-card p-6 shadow-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="channel-modal-title" className="text-lg font-semibold">
              {t('channelsPage.modalAddTitle', { name: pendingMeta.name })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('channelsPage.modalAddBody', { id: pendingMeta.id })}
            </p>
            {missingTypes.length > 1 && (
              <div>
                <label className="text-sm font-medium block mb-1">{t('channelsPage.typeLabel')}</label>
                <select
                  className="control-select"
                  value={pendingTypeId ?? ''}
                  onChange={(e) => setPendingTypeId(e.target.value)}
                >
                  {missingTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="button-secondary px-3 py-1.5 text-sm"
                onClick={() => setModalOpen(false)}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="button-primary px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => void submitAddChannel()}
              >
                {busy ? t('channelsPage.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && editorTypeId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-editor-title"
          onClick={() => !busy && setEditorOpen(false)}
        >
          <div
            className="w-[min(100%,48rem)] rounded-[1.5rem] border border-border bg-card p-6 shadow-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="channel-editor-title" className="text-lg font-semibold">
              {t('channelsPage.editorTitle', {
                name: channelTypes.find((row) => row.id === editorTypeId)?.name ?? editorTypeId,
              })}
            </h2>
            {editorRegistry && editorRegistry.guideSteps.length > 0 && (
              <details className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm" open>
                <summary className="cursor-pointer font-medium text-foreground">
                  {t('channelsPage.guideSummary')}
                </summary>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground leading-relaxed">
                  {editorRegistry.guideSteps.map((step, i) => (
                    <li key={i}>
                      {step.text}
                      {step.link ? (
                        <>
                          {' '}
                          <a
                            href={step.link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            {step.link.label}
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {editorRegistry.guideFooter ? (
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{editorRegistry.guideFooter}</p>
                ) : null}
                {editorRegistry.pairingNote ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200 leading-relaxed border border-amber-500/25 rounded-md px-2 py-1.5 bg-amber-500/5">
                    {editorRegistry.pairingNote}
                  </p>
                ) : null}
              </details>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">{t('channelsPage.channelState')}</span>
                <select
                  className="control-select"
                  value={editorEnabled ? 'true' : 'false'}
                  onChange={(e) => setEditorEnabled(e.target.value === 'true')}
                >
                  <option value="true">{t('channelsPage.enable')}</option>
                  <option value="false">{t('channelsPage.disable')}</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">{t('channelsPage.accountId')}</span>
                <input
                  className="control-input"
                  value={editorAccountId}
                  onChange={(e) => setEditorAccountId(e.target.value)}
                  placeholder="default"
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">{t('channelsPage.accountName')}</span>
                <input
                  className="control-input"
                  value={editorAccountName}
                  onChange={(e) => setEditorAccountName(e.target.value)}
                  placeholder={t('channelsPage.accountNamePlaceholder')}
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">{t('channelsPage.accountState')}</span>
                <select
                  className="control-select"
                  value={editorAccountEnabled ? 'true' : 'false'}
                  onChange={(e) => setEditorAccountEnabled(e.target.value === 'true')}
                >
                  <option value="true">{t('channelsPage.enable')}</option>
                  <option value="false">{t('channelsPage.disable')}</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">{t('channelsPage.bindAgent')}</span>
                <select
                  className="control-select"
                  value={editorAgentId}
                  onChange={(e) => setEditorAgentId(e.target.value)}
                >
                  <option value="">{t('channelsPage.bindAgentNone')}</option>
                  {allAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name || agent.id} ({agent.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {editorFields.map((f) => {
                const value = editorValues[f.key] ?? ''
                const required =
                  f.required ||
                  (f.requiredWhen ? (editorValues[f.requiredWhen.key] ?? '') === f.requiredWhen.value : false)
                if (f.requiredWhen && !required && !value) return null
                return (
                  <div key={f.key} className="text-sm space-y-1">
                    <label className="block space-y-1">
                      <span className="text-muted-foreground">
                        {f.label}
                        {required ? ' *' : ''}
                      </span>
                      {f.type === 'select' && f.options ? (
                        <select
                          className="control-select"
                          value={value}
                          onChange={(e) => setEditorField(f.key, e.target.value)}
                        >
                          {f.options.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                          className="control-input"
                          value={value}
                          onChange={(e) => setEditorField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                        />
                      )}
                    </label>
                    {f.hint ? <p className="text-xs text-muted-foreground leading-snug">{f.hint}</p> : null}
                  </div>
                )
              })}
            </div>
            {editorError ? (
              <p className="text-sm text-red-500">
                {t('channelsPage.saveErrorPrefix')}
                {editorError}
              </p>
            ) : null}
            {verifyResult ? (
              <div
                className={`text-sm rounded border px-3 py-2 ${
                  verifyResult.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                }`}
              >
                <div>{verifyResult.message}</div>
                {verifyResult.detail ? (
                  <div className="mt-1 text-xs opacity-90 whitespace-pre-wrap break-all">{verifyResult.detail}</div>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              {!isTauri() && (
                <button
                  type="button"
                  className="button-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  disabled={busy || verifyBusy}
                  onClick={() => void runVerifyEditor()}
                >
                  {verifyBusy ? t('channelsPage.verifying') : t('channelsPage.verifyConnection')}
                </button>
              )}
              <button
                type="button"
                className="button-secondary px-3 py-1.5 text-sm"
                onClick={() => setEditorOpen(false)}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="button-primary px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => void saveChannelEditor()}
              >
                {busy ? t('channelsPage.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
