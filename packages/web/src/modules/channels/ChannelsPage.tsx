import { useCallback, useMemo, useState } from 'react'
import { platformResults } from '@/adapters'
import type { OpenClawChannelEntry } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'
import { getChannelRegistryEntry } from '@/modules/channels/channelRegistry'
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
  icon: string
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

const CHANNEL_TYPES = [
  { id: 'feishu', name: '飞书', icon: '📌', description: 'Lark/Feishu 机器人' },
  { id: 'telegram', name: 'Telegram', icon: '✈️', description: 'Telegram Bot API' },
  { id: 'discord', name: 'Discord', icon: '💬', description: 'Discord Bot' },
  { id: 'qq', name: 'QQ', icon: '🐧', description: 'QQ 机器人 / OneBot 适配' },
  { id: 'dingtalk', name: '钉钉', icon: '📎', description: '钉钉企业机器人' },
  { id: 'wechat', name: '微信', icon: '🟢', description: '企业微信 / 微信桥接' },
  { id: 'matrix', name: 'Matrix', icon: '🧩', description: 'Matrix 客户端/机器人' },
  { id: 'teams', name: 'Teams', icon: '👥', description: 'Microsoft Teams Bot' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', description: 'WhatsApp Web API' },
  { id: 'signal', name: 'Signal', icon: '🔐', description: 'Signal CLI' },
  { id: 'slack', name: 'Slack', icon: '💼', description: 'Slack App' },
] as const

export default function Channels() {
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
    () => (editorTypeId ? getChannelRegistryEntry(editorTypeId) : null),
    [editorTypeId]
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
      const typeInfo = CHANNEL_TYPES.find((t) => t.id === type) || { name: type, icon: '📡' }
      const accountsMap = ch.accounts
      if (!accountsMap) continue

      const accounts: ConfiguredAccountRow[] = Object.entries(accountsMap).map(([id, acc]) =>
        parseAccount(id, acc)
      )

      result.push({
        type,
        typeName: typeInfo.name,
        icon: typeInfo.icon,
        accounts,
        enabled: ch.enabled !== false,
      })
    }

    return result
  }

  const configuredChannels = getConfiguredChannels()
  const missingTypes = CHANNEL_TYPES.filter((type) => !channels[type.id])

  function openAddModal(initialTypeId?: string) {
    const list = CHANNEL_TYPES.filter((t) => !channels[t.id])
    if (list.length === 0) {
      window.alert('所有通道类型已在配置中存在。如需调整，请使用下方「已配置」中的按钮或前往「配置」页。')
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
    const reg = getChannelRegistryEntry(typeId)
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
      setVerifyResult({ ok: false, message: r.error ?? '验证失败' })
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
        setEditorError(`请填写必填项：${f.label}`)
        return
      }
    }
    if (!editorAccountId.trim()) {
      setEditorError('账号 ID 不能为空')
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
        setEditorError(r.error ?? '保存失败')
        return
      }
      if (editorAgentId.trim()) {
        const br = await platformResults.upsertBinding(editorTypeId, editorAgentId.trim())
        if (!br.success) {
          setEditorError(br.error ?? '绑定 Agent 失败')
          return
        }
      } else {
        const dr = await platformResults.deleteBinding(editorTypeId)
        if (!dr.success) {
          setEditorError(dr.error ?? '解绑 Agent 失败')
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
    if (!window.confirm(`确定从配置中移除「${label}」通道？此操作不会删除聊天数据，仅删除 openclaw.json 中的通道条目。`)) {
      return
    }
    setBusy(true)
    try {
      const r = await platformResults.removeChannel(typeId)
      if (!r.success) {
        window.alert(r.error ?? '移除失败')
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
        window.alert(r.error ?? '切换启用状态失败')
        return
      }
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <LoadingState message="加载通道…" />
  }

  if (error || config === null) {
    return (
      <div className="py-16 text-center text-sm text-red-500">
        {error ? `加载失败：${error}` : '暂无配置数据'}
      </div>
    )
  }

  const pendingMeta = pendingTypeId ? CHANNEL_TYPES.find((t) => t.id === pendingTypeId) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">通道管理</h1>
        <button
          type="button"
          disabled={busy || missingTypes.length === 0}
          onClick={() => openAddModal()}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
        >
          + 添加通道
        </button>
      </div>

      {configuredChannels.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">已配置</h3>
          {configuredChannels.map((ch) => (
            <div key={ch.type} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ch.icon}</span>
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
                    className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent disabled:opacity-50"
                  >
                    {ch.enabled ? '禁用' : '启用'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openChannelEditor(ch.type)}
                    className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
                  >
                    设置
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeChannelType(ch.type, ch.typeName)}
                    className="px-3 py-1.5 text-sm border border-destructive/50 text-destructive rounded hover:bg-destructive/5 disabled:opacity-50"
                  >
                    删除通道
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
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">群聊已禁用</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openChannelEditor(ch.type, acc.id)}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!config) return
                          if (!window.confirm(`确定删除账号「${acc.id}」吗？`)) return
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
                              window.alert(r.error ?? '删除账号失败')
                              return
                            }
                            await refetch()
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-accent text-muted-foreground"
                      >
                        移除账号
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
        <h3 className="font-medium">添加新通道</h3>
        {missingTypes.map((type) => (
          <div
            key={type.id}
            className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">{type.icon}</span>
              <div>
                <span className="font-medium">{type.name}</span>
                <p className="text-sm text-muted-foreground">{type.description}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => openChannelEditor(type.id)}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 shrink-0 disabled:opacity-50"
            >
              设置
            </button>
          </div>
        ))}

        {missingTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">所有通道类型已配置</p>
        )}
      </div>

      <div className="text-xs text-muted-foreground leading-relaxed">
        💡 各通道字段与接入说明与 clawpanel 向导对齐；「启用/禁用」仅改 <code className="font-mono text-[11px]">enabled</code>。插件安装、扫码登录等仍需在 Gateway / CLI 侧完成。
      </div>

      {modalOpen && pendingMeta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-modal-title"
          onClick={() => !busy && setModalOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="channel-modal-title" className="text-lg font-semibold">
              添加 {pendingMeta.name} 通道
            </h2>
            <p className="text-sm text-muted-foreground">
              将打开 <code className="font-mono text-xs">channels.{pendingMeta.id}</code> 的结构化配置向导（接入步骤 + 凭证字段），保存后写入{' '}
              <code className="font-mono text-xs">openclaw.json</code>。
            </p>
            {missingTypes.length > 1 && (
              <div>
                <label className="text-sm font-medium block mb-1">通道类型</label>
                <select
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  value={pendingTypeId ?? ''}
                  onChange={(e) => setPendingTypeId(e.target.value)}
                >
                  {missingTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
                onClick={() => setModalOpen(false)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                disabled={busy}
                onClick={() => void submitAddChannel()}
              >
                {busy ? '保存中…' : '保存'}
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
            className="bg-card border border-border rounded-lg shadow-lg max-w-3xl w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="channel-editor-title" className="text-lg font-semibold">
              设置通道：{CHANNEL_TYPES.find((t) => t.id === editorTypeId)?.name || editorTypeId}
            </h2>
            {editorRegistry && editorRegistry.guideSteps.length > 0 && (
              <details className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm" open>
                <summary className="cursor-pointer font-medium text-foreground">接入步骤（点击折叠）</summary>
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
                <span className="text-muted-foreground">通道状态</span>
                <select
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  value={editorEnabled ? 'true' : 'false'}
                  onChange={(e) => setEditorEnabled(e.target.value === 'true')}
                >
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">账号 ID</span>
                <input
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  value={editorAccountId}
                  onChange={(e) => setEditorAccountId(e.target.value)}
                  placeholder="default"
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">账号名称</span>
                <input
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  value={editorAccountName}
                  onChange={(e) => setEditorAccountName(e.target.value)}
                  placeholder="可选显示名称"
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">账号状态</span>
                <select
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  value={editorAccountEnabled ? 'true' : 'false'}
                  onChange={(e) => setEditorAccountEnabled(e.target.value === 'true')}
                >
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-muted-foreground">绑定 Agent</span>
                <select
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  value={editorAgentId}
                  onChange={(e) => setEditorAgentId(e.target.value)}
                >
                  <option value="">不绑定（使用默认路由）</option>
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
                          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
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
                          className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
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
            {editorError ? <p className="text-sm text-red-500">保存失败：{editorError}</p> : null}
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
              <button
                type="button"
                className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent disabled:opacity-50"
                disabled={busy || verifyBusy}
                onClick={() => void runVerifyEditor()}
              >
                {verifyBusy ? '验证中…' : '验证连接'}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
                onClick={() => setEditorOpen(false)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                disabled={busy}
                onClick={() => void saveChannelEditor()}
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
