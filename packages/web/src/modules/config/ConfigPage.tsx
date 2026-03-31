import { useCallback, useEffect, useState } from 'react'
import { platformResults } from '@/adapters'
import type { OpenClawConfig } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'
import { unwrapDoubleNestedModelsInRoot } from '@/shared/unwrapDoubleNestedModels'

function cloneConfig(c: OpenClawConfig): OpenClawConfig {
  return JSON.parse(JSON.stringify(c)) as OpenClawConfig
}

/** Align with OpenClaw data dir: prefill workspace when unset so new users save a valid path. */
const DEFAULT_AGENT_WORKSPACE = '~/.openclaw/workspace'

function withDefaultWorkspaceIfUnset(d: OpenClawConfig): OpenClawConfig {
  const defs = d.agents?.defaults
  if (defs && Object.prototype.hasOwnProperty.call(defs, 'workspace')) {
    return d
  }
  const next = cloneConfig(d)
  next.agents = next.agents || {}
  next.agents.defaults = {
    ...next.agents.defaults,
    workspace: DEFAULT_AGENT_WORKSPACE,
  }
  return next
}

export default function Config() {
  const [viewMode, setViewMode] = useState<'visual' | 'json'>('visual')
  const [draft, setDraft] = useState<OpenClawConfig | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const fetcher = useCallback(async () => platformResults.getConfig(), [])
  const { data: config, loading, error, refetch } = useAdapterCall(fetcher)

  useEffect(() => {
    if (config) {
      const d = withDefaultWorkspaceIfUnset(
        unwrapDoubleNestedModelsInRoot(cloneConfig(config) as Record<string, unknown>) as OpenClawConfig
      )
      setDraft(d)
      setJsonText(JSON.stringify(d, null, 2))
      setModelsText(JSON.stringify(d.models ?? {}, null, 2))
      setModelsError(null)
      setJsonError(null)
      setSaveOk(false)
    }
  }, [config])

  const switchViewMode = useCallback(
    (mode: 'visual' | 'json') => {
      if (mode === 'visual' && viewMode === 'json') {
        try {
          const parsed = JSON.parse(jsonText) as unknown
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            setJsonError('JSON 顶层必须是对象')
            return
          }
          setDraft(withDefaultWorkspaceIfUnset(parsed as OpenClawConfig))
          setModelsText(JSON.stringify((parsed as OpenClawConfig).models ?? {}, null, 2))
          setJsonError(null)
        } catch {
          setJsonError('JSON 格式错误，无法切回可视化')
          return
        }
      }
      if (mode === 'json' && draft) {
        setJsonText(JSON.stringify(draft, null, 2))
        setJsonError(null)
      }
      setViewMode(mode)
    },
    [viewMode, jsonText, draft]
  )

  const applyModelsFromText = useCallback(() => {
    try {
      const parsed = JSON.parse(modelsText || '{}') as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setModelsError('models 须为 JSON 对象')
        return
      }
      const models = unwrapDoubleNestedModelsInRoot({
        models: parsed as Record<string, unknown>,
      } as Record<string, unknown>).models as OpenClawConfig['models']
      setDraft((d) => (d ? { ...d, models } : d))
      setModelsError(null)
    } catch {
      setModelsError('models JSON 无法解析')
    }
  }, [modelsText])

  const handleSave = useCallback(async () => {
    setSaveError(null)
    setSaveOk(false)
    let toSave: OpenClawConfig | null = null
    if (viewMode === 'json') {
      try {
        const parsed = JSON.parse(jsonText) as unknown
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setSaveError('JSON 顶层必须是对象')
          return
        }
        toSave = unwrapDoubleNestedModelsInRoot(parsed as Record<string, unknown>) as OpenClawConfig
      } catch {
        setSaveError('JSON 语法错误')
        return
      }
    } else {
      if (!draft) {
        setSaveError('无配置数据')
        return
      }
      try {
        const parsed = JSON.parse(modelsText || '{}') as unknown
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setSaveError('「模型」JSON 须为对象')
          return
        }
        const models = unwrapDoubleNestedModelsInRoot({
          models: parsed as Record<string, unknown>,
        } as Record<string, unknown>).models as OpenClawConfig['models']
        toSave = { ...draft, models }
      } catch {
        setSaveError('「模型」JSON 无法解析')
        return
      }
    }

    setSaving(true)
    const r = await platformResults.saveFullConfig(toSave)
    setSaving(false)
    if (!r.success) {
      setSaveError(r.error ?? '保存失败')
      return
    }
    setSaveOk(true)
    void refetch()
  }, [viewMode, jsonText, draft, modelsText, refetch])

  const handleExport = useCallback(() => {
    const obj = viewMode === 'json' ? (() => {
      try {
        return JSON.parse(jsonText)
      } catch {
        return draft ?? config
      }
    })() : draft ?? config
    if (obj === undefined) return
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'openclaw.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [viewMode, jsonText, draft, config])

  if (loading || !config) {
    return <LoadingState message="加载配置…" />
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl">
        <p className="py-8 text-center text-sm text-red-500">无法加载配置：{error}</p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void refetch()}
            className="px-3 py-1.5 border border-border rounded text-sm"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!draft) {
    return <LoadingState message="同步配置…" />
  }

  const gateway = draft.gateway || {}
  const agents = draft.agents || {}
  const defaults = agents.defaults || {}

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">配置</h1>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchViewMode('visual')}
          className={`px-4 py-2 rounded text-sm ${viewMode === 'visual' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
        >
          可视化编辑
        </button>
        <button
          type="button"
          onClick={() => switchViewMode('json')}
          className={`px-4 py-2 rounded text-sm ${viewMode === 'json' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}
        >
          JSON 编辑器
        </button>
      </div>

      {jsonError && viewMode === 'visual' && (
        <p className="text-sm text-amber-600 dark:text-amber-500" role="status">
          {jsonError}
        </p>
      )}

      {viewMode === 'visual' ? (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <details open>
            <summary className="font-medium cursor-pointer">▼ 网关 (Gateway)</summary>
            <div className="mt-3 space-y-3 pl-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground">端口</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={gateway.port ?? 18789}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setDraft({
                      ...draft,
                      gateway: { ...gateway, port: Number.isFinite(n) ? n : undefined },
                    })
                  }}
                  className="px-3 py-1.5 bg-background rounded border border-border w-32"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground">模式</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gw-mode"
                      checked={gateway.mode === 'local' || gateway.mode === undefined}
                      onChange={() =>
                        setDraft({ ...draft, gateway: { ...gateway, mode: 'local' } })
                      }
                    />
                    <span className="text-sm">本地</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gw-mode"
                      checked={gateway.mode === 'remote'}
                      onChange={() =>
                        setDraft({ ...draft, gateway: { ...gateway, mode: 'remote' } })
                      }
                    />
                    <span className="text-sm">远程</span>
                  </label>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground">绑定</label>
                <select
                  value={(gateway.bind as string) || 'loopback'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      gateway: { ...gateway, bind: e.target.value },
                    })
                  }
                  className="px-3 py-1.5 bg-background rounded border border-border max-w-xs"
                >
                  <option value="loopback">Loopback</option>
                  <option value="lan">LAN</option>
                  <option value="tailnet">Tailscale</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground">认证模式</label>
                <select
                  value={gateway.auth?.mode || 'token'}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      gateway: {
                        ...gateway,
                        auth: { ...gateway.auth, mode: e.target.value },
                      },
                    })
                  }
                  className="px-3 py-1.5 bg-background rounded border border-border max-w-xs"
                >
                  <option value="token">Token</option>
                  <option value="password">Password</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </details>

          <details open>
            <summary className="font-medium cursor-pointer">▼ 代理默认设置 (Agents Defaults)</summary>
            <div className="mt-3 space-y-3 pl-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground pt-2">默认模型</label>
                <input
                  type="text"
                  value={defaults.model?.primary || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      agents: {
                        ...agents,
                        defaults: {
                          ...defaults,
                          model: { ...defaults.model, primary: e.target.value },
                        },
                      },
                    })
                  }
                  placeholder="例如 provider/model 或主模型 ID"
                  className="flex-1 min-w-0 px-3 py-1.5 bg-background rounded border border-border font-mono text-sm"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground">最大并发</label>
                <input
                  type="number"
                  min={1}
                  value={defaults.maxConcurrent ?? 4}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10)
                    setDraft({
                      ...draft,
                      agents: {
                        ...agents,
                        defaults: {
                          ...defaults,
                          maxConcurrent: Number.isFinite(n) ? n : undefined,
                        },
                      },
                    })
                  }}
                  className="px-3 py-1.5 bg-background rounded border border-border w-32"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                <label className="w-28 shrink-0 text-sm text-muted-foreground pt-2">工作区</label>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={defaults.workspace ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        agents: {
                          ...agents,
                          defaults: { ...defaults, workspace: e.target.value },
                        },
                      })
                    }
                    placeholder={DEFAULT_AGENT_WORKSPACE}
                    className="w-full px-3 py-1.5 bg-background rounded border border-border font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    未在配置里写 workspace 时，加载本页会预填{' '}
                    <code className="font-mono">{DEFAULT_AGENT_WORKSPACE}</code>（相对主目录，与{' '}
                    <code className="font-mono">~/.openclaw</code> 数据目录一致）。
                  </p>
                </div>
              </div>
            </div>
          </details>

          <details open>
            <summary className="font-medium cursor-pointer">▼ 通道 (Channels)</summary>
            <div className="mt-3 pl-4 space-y-2">
              {draft.channels && Object.keys(draft.channels).length > 0 ? (
                Object.entries(draft.channels).map(([id, ch]) => (
                  <label
                    key={id}
                    className="flex items-center gap-3 cursor-pointer py-1 border-b border-border/60 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={ch.enabled !== false}
                      onChange={(e) => {
                        const base = draft.channels || {}
                        const next = {
                          ...base,
                          [id]: { ...ch, enabled: e.target.checked },
                        }
                        setDraft({ ...draft, channels: next })
                      }}
                    />
                    <span className="font-mono text-sm">{id}</span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无通道条目（可在 JSON 中添加）</p>
              )}
            </div>
          </details>

          <details open>
            <summary className="font-medium cursor-pointer">▼ 模型 (Models)</summary>
            <div className="mt-3 pl-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                此处只填 <code className="font-mono">models</code> 的<strong>内部</strong>对象（含{' '}
                <code className="font-mono">mode</code>、<code className="font-mono">providers</code>
                ），不要在外面再包一层 <code className="font-mono">{'"models"'}</code>，否则会变成{' '}
                <code className="font-mono">models.models</code> 导致 OpenClaw 报错。若仍有校验问题可执行{' '}
                <code className="font-mono">openclaw doctor --fix</code>。
              </p>
              <textarea
                value={modelsText}
                onChange={(e) => setModelsText(e.target.value)}
                onBlur={() => applyModelsFromText()}
                spellCheck={false}
                className="w-full min-h-[160px] p-3 rounded border border-border bg-muted/30 font-mono text-xs leading-relaxed"
              />
              {modelsError && <p className="text-sm text-red-500">{modelsError}</p>}
              <button
                type="button"
                onClick={() => applyModelsFromText()}
                className="text-sm px-2 py-1 border border-border rounded hover:bg-accent"
              >
                应用 models 到当前草稿
              </button>
            </div>
          </details>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              setJsonError(null)
            }}
            spellCheck={false}
            className="w-full min-h-[min(70vh,720px)] p-4 rounded border border-border bg-muted/30 font-mono text-sm leading-relaxed"
          />
          {jsonError && <p className="text-sm text-red-500">{jsonError}</p>}
        </div>
      )}

      {saveError && (
        <p className="text-sm text-red-500" role="alert">
          {saveError}
        </p>
      )}
      {saveOk && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          已保存到本机 openclaw.json。若网关已运行，部分项需重启网关后生效。
        </p>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="px-4 py-2 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存更改'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void refetch()}
          className="px-4 py-2 border border-border rounded hover:bg-accent disabled:opacity-50"
        >
          刷新
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="px-4 py-2 border border-border rounded hover:bg-accent"
        >
          导出
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        修改会写入 OpenClaw 主配置文件。建议在重要变更前先使用「导出」备份。
      </p>
    </div>
  )
}
