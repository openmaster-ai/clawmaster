import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { platformResults } from '@/adapters'
import type { OpenClawChannelEntry } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'

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
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', description: 'WhatsApp Web API' },
  { id: 'signal', name: 'Signal', icon: '🔐', description: 'Signal CLI' },
  { id: 'slack', name: 'Slack', icon: '💼', description: 'Slack App' },
] as const

export default function Channels() {
  const navigate = useNavigate()
  const fetcher = useCallback(async () => platformResults.getConfig(), [])
  const { data: config, loading, error, refetch } = useAdapterCall(fetcher)

  const [modalOpen, setModalOpen] = useState(false)
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const channels: Record<string, OpenClawChannelEntry> = config?.channels || {}

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

  async function submitAddChannel() {
    if (!pendingTypeId) return
    const meta = CHANNEL_TYPES.find((t) => t.id === pendingTypeId)
    if (!meta) return
    setBusy(true)
    try {
      const r = await platformResults.addChannel({
        type: meta.id,
        name: meta.name,
        /** Placeholder empty accounts so list logic does not skip the channel */
        config: { accounts: {} },
      })
      if (!r.success) {
        window.alert(r.error ?? '添加失败')
        return
      }
      await refetch()
      setModalOpen(false)
    } finally {
      setBusy(false)
    }
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
                  <Link
                    to="/config"
                    className="px-3 py-1.5 text-sm border border-border rounded hover:bg-accent"
                  >
                    配置
                  </Link>
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
                      <Link
                        to="/config"
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-accent"
                      >
                        编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          window.alert(
                            '删除单个账号需在「配置」页编辑 openclaw.json：在 channels.<类型>.accounts 下移除对应键。本页提供「删除通道」以移除整条通道。'
                          )
                          navigate('/config')
                        }}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-accent text-muted-foreground"
                      >
                        移除账号…
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
              onClick={() => openAddModal(type.id)}
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
        💡 点击「设置」或「添加通道」会在{' '}
        <code className="font-mono text-[11px]">openclaw.json</code> 中创建对应{' '}
        <code className="font-mono text-[11px]">channels.&lt;类型&gt;</code>{' '}
        占位（enabled）。Token、Webhook 等请前往「配置」页补全，或使用官方 CLI（如{' '}
        <code className="font-mono text-[11px]">openclaw onboard</code>）。
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
              将写入配置键 <code className="font-mono text-xs">channels.{pendingMeta.id}</code>，并启用该通道条目。
              敏感凭证与路由仍需在「配置」中编辑完整 JSON。
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
    </div>
  )
}
