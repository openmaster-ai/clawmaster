import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  CircleDashed,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Circle,
  Layers3,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Pin,
  Puzzle,
  Radio,
  ScrollText,
  Send,
  Shield,
  Sparkles,
  Smartphone,
  Users,
  Workflow,
} from 'lucide-react'
import { platformResults } from '@/adapters'
import type { OpenClawChannelEntry } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { execCommand, isTauri } from '@/shared/adapters/platform'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { LoadingState } from '@/shared/components/LoadingState'
import { RecentLogsSheet } from '@/shared/components/RecentLogsSheet'
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

type ChannelTypeId = (typeof CHANNEL_TYPE_ORDER)[number]

const CHANNEL_SPOTLIGHT_GROUPS: Array<{
  id: 'china' | 'workspace'
  titleKey: string
  descriptionKey: string
  channelIds: ChannelTypeId[]
}> = [
  {
    id: 'china',
    titleKey: 'channelsPage.group.chinaTitle',
    descriptionKey: 'channelsPage.group.chinaDesc',
    channelIds: ['feishu', 'wechat'],
  },
  {
    id: 'workspace',
    titleKey: 'channelsPage.group.workspaceTitle',
    descriptionKey: 'channelsPage.group.workspaceDesc',
    channelIds: ['discord', 'slack'],
  },
]

const CHANNEL_SPOTLIGHT_SET = new Set<ChannelTypeId>(['feishu', 'wechat', 'discord', 'slack'])

const CHANNEL_HINT_KEYS: Partial<Record<ChannelTypeId, string>> = {
  feishu: 'channelsPage.hint.feishu',
  wechat: 'channelsPage.hint.wechat',
  discord: 'channelsPage.hint.discord',
  slack: 'channelsPage.hint.slack',
}

type ChannelTypeRow = {
  id: (typeof CHANNEL_TYPE_ORDER)[number]
  name: string
  icon: LucideIcon
  description: string
}

type WechatSetupStage =
  | 'idle'
  | 'checking'
  | 'missing'
  | 'installing'
  | 'ready'
  | 'scanning'
  | 'connected'
  | 'error'

const WECHAT_PLUGIN_PACKAGE = '@tencent-weixin/openclaw-weixin'

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
  const [wechatSetupOpen, setWechatSetupOpen] = useState(false)
  const [wechatSetupStage, setWechatSetupStage] = useState<WechatSetupStage>('idle')
  const [wechatSetupError, setWechatSetupError] = useState<string | null>(null)
  const [wechatPluginInstalled, setWechatPluginInstalled] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{ typeId: string; label: string } | null>(null)
  const [pendingAccountRemoval, setPendingAccountRemoval] = useState<{ typeId: string; accountId: string } | null>(null)

  const channels: Record<string, OpenClawChannelEntry> = config?.channels || {}
  const allAgents = config?.agents?.list ?? []
  const editorRegistry = useMemo(
    () => (editorTypeId ? registry[editorTypeId] ?? null : null),
    [registry, editorTypeId]
  )
  const editorFields: ChannelFieldDef[] = editorRegistry?.fields ?? []
  const channelTypesById = useMemo(
    () => new Map(channelTypes.map((type) => [type.id, type])),
    [channelTypes],
  )

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

      const accounts: ConfiguredAccountRow[] = accountsMap
        ? Object.entries(accountsMap).map(([id, acc]) => parseAccount(id, acc))
        : []

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

  async function detectWechatPluginInstalled() {
    try {
      await execCommand('npm', ['list', '-g', WECHAT_PLUGIN_PACKAGE, '--depth=0'])
      return true
    } catch {
      return false
    }
  }

  async function openWechatSetup() {
    setWechatSetupOpen(true)
    setWechatSetupError(null)
    setWechatSetupStage('checking')
    const installed = await detectWechatPluginInstalled()
    setWechatPluginInstalled(installed)
    setWechatSetupStage(installed ? 'ready' : 'missing')
  }

  function openChannelSetup(typeId: string, accountId?: string) {
    if (typeId === 'wechat') {
      void openWechatSetup()
      return
    }
    openChannelEditor(typeId, accountId)
  }

  async function installWechatPlugin() {
    setWechatSetupError(null)
    setWechatSetupStage('installing')
    try {
      await execCommand('npm', ['install', '-g', WECHAT_PLUGIN_PACKAGE])
      setWechatPluginInstalled(true)
      setWechatSetupStage('ready')
    } catch (err) {
      setWechatSetupError(err instanceof Error ? err.message : String(err))
      setWechatSetupStage('error')
    }
  }

  async function startWechatQrLogin() {
    setWechatSetupError(null)
    setWechatSetupStage('scanning')
    execCommand('openclaw', ['channels', 'login', '--channel', 'wechat']).catch(() => {})
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      try {
        const out = await execCommand('openclaw', ['channels', 'status', '--channel', 'wechat'])
        if (out.includes('connected') || out.includes('ready') || out.includes('online')) {
          setWechatSetupStage('connected')
          await refetch()
          return
        }
      } catch {
        // Keep polling while the login session is initializing.
      }
    }
    setWechatSetupError(t('channel.qr.timeout'))
    setWechatSetupStage('error')
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

  async function removeChannelType(typeId: string) {
    setBusy(true)
    try {
      const r = await platformResults.removeChannel(typeId)
      if (!r.success) {
        setFeedback({ tone: 'error', message: r.error ?? t('channelsPage.removeFailed') })
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
        setFeedback({ tone: 'error', message: r.error ?? t('channelsPage.toggleFailed') })
        return
      }
      await refetch()
    } finally {
      setBusy(false)
    }
  }

  async function removeChannelAccount(typeId: string, accountId: string) {
    if (!config) return
    const current = channels[typeId]
    if (!current || !isRecord(current) || !isRecord(current.accounts)) return

    const nextAccounts = { ...(current.accounts as Record<string, unknown>) }
    delete nextAccounts[accountId]

    setBusy(true)
    try {
      const next = {
        ...config,
        channels: {
          ...(config.channels || {}),
          [typeId]: {
            ...current,
            accounts: nextAccounts,
          } as OpenClawChannelEntry,
        },
      }
      const r = await platformResults.saveFullConfig(next)
      if (!r.success) {
        setFeedback({ tone: 'error', message: r.error ?? t('channelsPage.deleteAccountFailed') })
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
      <>
        <div className="state-panel space-y-3 text-sm text-red-500">
          <div>{error ? `${t('channelsPage.loadFailed')}${error}` : t('channelsPage.noConfig')}</div>
          <button type="button" onClick={() => setLogsOpen(true)} className="button-secondary">
            <ScrollText className="h-4 w-4" />
            {t('logs.openRecent')}
          </button>
        </div>
        <RecentLogsSheet
          open={logsOpen}
          onClose={() => setLogsOpen(false)}
          title={t('logs.channelsTitle')}
          description={t('logs.channelsDescription')}
          lines={320}
          scope="channels"
        />
      </>
    )
  }

  const configuredByType = new Map(configuredChannels.map((row) => [row.type, row]))
  const enabledChannelsCount = configuredChannels.filter((row) => row.enabled).length
  const spotlightGroups = CHANNEL_SPOTLIGHT_GROUPS.map((group) => ({
    ...group,
    items: group.channelIds
      .map((id) => {
        const meta = channelTypesById.get(id)
        if (!meta) return null
        const configured = configuredByType.get(id)
        const steps = registry[id]?.guideSteps.length ?? 0
        const fields = registry[id]?.fields.length ?? 0
        return {
          ...meta,
          configured,
          steps,
          fields,
          hint: CHANNEL_HINT_KEYS[id] ? t(CHANNEL_HINT_KEYS[id]!) : meta.description,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  }))
  const remainingTypes = missingTypes.filter((type) => !CHANNEL_SPOTLIGHT_SET.has(type.id))

  function focusCatalog() {
    document.getElementById('channel-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page-shell page-shell-wide">
      {feedback ? (
        <ActionBanner tone={feedback.tone} message={feedback.message} onDismiss={() => setFeedback(null)} />
      ) : null}
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('config.countUnit', { count: configuredChannels.length })} {t('channelsPage.configured')}</span>
            <span>{t('config.countUnit', { count: enabledChannelsCount })} {t('channelsPage.enable')}</span>
            <span>{t('config.countUnit', { count: missingTypes.length })} {t('channelsPage.availableNow')}</span>
          </div>
          <h1 className="page-title">{t('channelsPage.title')}</h1>
          <p className="page-subtitle">{t('channelsPage.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setLogsOpen(true)} className="button-secondary">
            <ScrollText className="h-4 w-4" />
            {t('logs.openRecent')}
          </button>
          <button type="button" onClick={focusCatalog} className="button-secondary">
            <Layers3 className="h-4 w-4" />
            {t('channelsPage.jumpToCatalog')}
          </button>
          <button
            type="button"
            disabled={busy || missingTypes.length === 0}
            onClick={() => {
              if (missingTypes.length === 0) {
                setFeedback({ tone: 'info', message: t('channelsPage.allTypesPresent') })
                return
              }
              openChannelSetup(missingTypes[0].id)
            }}
            className="button-primary disabled:opacity-50"
          >
            {t('channelsPage.add')}
          </button>
        </div>
      </div>

      <section id="channel-focus" className="surface-card">
        <div className="channel-page-hero">
          <div className="min-w-0 space-y-3">
            <p className="dashboard-section-meta">{t('channelsPage.recommendedTitle')}</p>
            <h2 className="section-title">{t('channelsPage.recommendedHeadline')}</h2>
            <p className="section-subtitle max-w-3xl">{t('channelsPage.recommendedDesc')}</p>
          </div>
          <div className="channel-page-step-grid">
            <div className="channel-page-step-card">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">{t('channelsPage.quickStepChoose')}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('channelsPage.quickStepChooseDesc')}</p>
              </div>
            </div>
            <div className="channel-page-step-card">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">{t('channelsPage.quickStepVerify')}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('channelsPage.quickStepVerifyDesc')}</p>
              </div>
            </div>
            <div className="channel-page-step-card">
              <Workflow className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">{t('channelsPage.quickStepBind')}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('channelsPage.quickStepBindDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <h3 className="section-title">{t('channelsPage.focusTitle')}</h3>
            <p className="section-subtitle">{t('channelsPage.focusDesc')}</p>
          </div>
        </div>

        <div className="channel-page-focus-grid">
          {spotlightGroups.map((group) => (
            <div key={group.id} className="channel-page-focus-panel">
              <div className="mb-4">
                <p className="dashboard-section-meta">{t('channelsPage.cardRecommended')}</p>
                <h4 className="section-title text-[1.35rem]">{t(group.titleKey)}</h4>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(group.descriptionKey)}</p>
              </div>

              <div className="grid gap-3">
                {group.items.map((item) => {
                  const configured = item.configured
                  const statusLabel = configured
                    ? configured.enabled
                      ? t('channelsPage.cardReady')
                      : t('channelsPage.cardDisabled')
                    : t('channelsPage.cardMissing')

                  return (
                    <div key={item.id} className="channel-page-focus-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                            <item.icon className="h-5 w-5 text-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="text-base font-semibold">{item.name}</h5>
                              <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                {statusLabel}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.hint}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openChannelSetup(item.id)}
                          className="button-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          {configured ? t('channelsPage.continueSetup') : t('channelsPage.startSetup')}
                        </button>
                      </div>

                      <div className="channel-page-card-meta mt-4">
                        <span>{t('channelsPage.cardSteps', { count: item.steps })}</span>
                        <span>{t('channelsPage.cardFields', { count: item.fields })}</span>
                        <span>
                          {t('channelsPage.cardAccounts', {
                            count: configured?.accounts.length ?? 0,
                          })}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {configuredChannels.length > 0 && (
        <section id="channel-configured" className="surface-card">
          <div className="section-heading">
            <div>
              <h3 className="section-title">{t('channelsPage.configured')}</h3>
              <p className="section-subtitle">{t('channelsPage.configuredSectionDesc')}</p>
            </div>
          </div>

          <div className="channel-page-config-grid">
            {configuredChannels.map((ch) => (
              <div key={ch.type} className="list-card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                      <ch.icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold">{ch.typeName}</h4>
                        <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {ch.enabled ? t('channelsPage.cardReady') : t('channelsPage.cardDisabled')}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('channelsPage.accountCountLabel', { count: ch.accounts.length })}
                      </p>
                    </div>
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
                      onClick={() => openChannelSetup(ch.type)}
                      className="button-primary px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {t('channelsPage.manageChannel')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingRemoval({ typeId: ch.type, label: ch.typeName })}
                      className="button-danger px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {t('channelsPage.removeChannel')}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  {ch.accounts.length > 0 ? (
                    ch.accounts.map((acc) => (
                      <div key={acc.id} className="channel-page-account-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${acc.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                              <span className="text-sm font-medium">{acc.name || acc.id}</span>
                              {acc.groupPolicy === 'disabled' && (
                                <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                  {t('channelsPage.groupChatDisabled')}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{acc.id}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openChannelSetup(ch.type, acc.id)}
                              className="button-secondary px-2.5 py-1.5 text-xs"
                            >
                              {t('channelsPage.edit')}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setPendingAccountRemoval({ typeId: ch.type, accountId: acc.id })}
                              className="button-secondary px-2.5 py-1.5 text-xs text-muted-foreground"
                            >
                              {t('channelsPage.removeAccount')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="inline-note text-sm">{t('channelsPage.noAccounts')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="channel-catalog" className="surface-card">
        <div className="section-heading">
          <div>
            <h3 className="section-title">{t('channelsPage.secondaryTitle')}</h3>
            <p className="section-subtitle">{t('channelsPage.secondaryDesc')}</p>
          </div>
        </div>

        {remainingTypes.length > 0 ? (
          <div className="channel-page-catalog-grid">
            {remainingTypes.map((type) => (
              <div key={type.id} className="list-card flex flex-col gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
                    <type.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-base font-semibold">{type.name}</h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{type.description}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('channelsPage.cardMissing')}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openChannelSetup(type.id)}
                    className="button-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {t('channelsPage.startSetup')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-note text-sm">{t('channelsPage.allConfigured')}</div>
        )}
      </section>

      {wechatSetupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wechat-setup-title"
          onClick={() => wechatSetupStage !== 'installing' && wechatSetupStage !== 'scanning' && setWechatSetupOpen(false)}
        >
          <div
            className="w-[min(100%,36rem)] rounded-[1.5rem] border border-border bg-card p-6 shadow-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <h2 id="wechat-setup-title" className="text-lg font-semibold">
                {t('channel.wechat.name')}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">{t('channel.qr.desc')}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <ol className="space-y-3 text-sm">
                {[1, 2, 3].map((step) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-xs font-semibold">
                      {step}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{t(`channel.wechat.step${step}`)}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t(`channel.wechat.step${step}.highlight`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="channel-page-wechat-state">
              {wechatSetupStage === 'checking' ? (
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleDashed className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : null}

              {wechatSetupStage === 'missing' ? (
                <div className="space-y-3">
                  <div className="inline-note text-sm">{t('channel.wechat.step1.highlight')}</div>
                  <div className="mono-note">{WECHAT_PLUGIN_PACKAGE}</div>
                </div>
              ) : null}

              {wechatSetupStage === 'installing' ? (
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleDashed className="h-4 w-4 animate-spin" />
                  {t('channel.qr.installing', { name: t('channel.wechat.name') })}
                </div>
              ) : null}

              {wechatSetupStage === 'ready' ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('common.installed')}
                  </div>
                  <div className="inline-note text-sm">{t('channel.qr.scanHint')}</div>
                </div>
              ) : null}

              {wechatSetupStage === 'scanning' ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleDashed className="h-4 w-4 animate-spin" />
                    {t('channel.qr.waiting')}
                  </div>
                  <div className="inline-note text-sm">{t('channel.qr.scanHint')}</div>
                </div>
              ) : null}

              {wechatSetupStage === 'connected' ? (
                <div className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('channel.qr.connected')}
                </div>
              ) : null}

              {wechatSetupError ? (
                <p className="text-sm text-red-500">{wechatSetupError}</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="button-secondary px-3 py-1.5 text-sm"
                onClick={() => setWechatSetupOpen(false)}
                disabled={wechatSetupStage === 'installing' || wechatSetupStage === 'scanning'}
              >
                {t('common.cancel')}
              </button>
              {(wechatSetupStage === 'missing' || (wechatSetupStage === 'error' && !wechatPluginInstalled)) && (
                <button
                  type="button"
                  className="button-primary px-3 py-1.5 text-sm"
                  onClick={() => void installWechatPlugin()}
                  disabled={false}
                >
                  {t('channel.wechat.step1')}
                </button>
              )}
              {wechatSetupStage === 'ready' && (
                <button
                  type="button"
                  className="button-primary px-3 py-1.5 text-sm"
                  onClick={() => void startWechatQrLogin()}
                >
                  {t('channel.qr.start')}
                </button>
              )}
              {wechatSetupStage === 'error' && wechatPluginInstalled && (
                <button
                  type="button"
                  className="button-primary px-3 py-1.5 text-sm"
                  onClick={() => void startWechatQrLogin()}
                >
                  {t('common.retry')}
                </button>
              )}
              {wechatSetupStage === 'connected' && (
                <button
                  type="button"
                  className="button-primary px-3 py-1.5 text-sm"
                  onClick={() => setWechatSetupOpen(false)}
                >
                  {t('common.close')}
                </button>
              )}
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
                {!verifyResult.ok ? (
                  <button
                    type="button"
                    className="button-secondary mt-3 px-3 py-1.5 text-xs"
                    onClick={() => setLogsOpen(true)}
                  >
                    <ScrollText className="h-3.5 w-3.5" />
                    {t('logs.openRecent')}
                  </button>
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

      <RecentLogsSheet
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={t('logs.channelsTitle')}
        description={t('logs.channelsDescription')}
        lines={320}
        scope="channels"
      />
      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title={pendingRemoval ? t('channelsPage.removeConfirm', { label: pendingRemoval.label }) : ''}
        tone="danger"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (!pendingRemoval) return
          const current = pendingRemoval
          setPendingRemoval(null)
          void removeChannelType(current.typeId)
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingAccountRemoval)}
        title={pendingAccountRemoval ? t('channelsPage.deleteAccountConfirm', { id: pendingAccountRemoval.accountId }) : ''}
        tone="danger"
        onCancel={() => setPendingAccountRemoval(null)}
        onConfirm={() => {
          if (!pendingAccountRemoval) return
          const current = pendingAccountRemoval
          setPendingAccountRemoval(null)
          void removeChannelAccount(current.typeId, current.accountId)
        }}
      />
    </div>
  )
}
