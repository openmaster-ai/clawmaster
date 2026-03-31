import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { platformResults } from '@/adapters'
import type { OpenClawConfig, ModelInfo, OpenClawModelProvider } from '@/lib/types'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { allSuccess2 } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { fail, ok } from '@/shared/adapters/types'
import LoadingState from '@/shared/components/LoadingState'

export default function Models() {
  const [selectedDefault, setSelectedDefault] = useState('')
  const [savingDefault, setSavingDefault] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [testHintProvider, setTestHintProvider] = useState<string | null>(null)

  const fetcher = useCallback(async (): Promise<
    AdapterResult<{ config: OpenClawConfig; models: ModelInfo[] }>
  > => {
    const [cfg, modelList] = await Promise.all([
      platformResults.getConfig(),
      platformResults.getModels(),
    ])
    const combined = allSuccess2(cfg, modelList)
    if (!combined.success) {
      return fail(combined.error ?? '加载失败')
    }
    const bundle = combined.data!
    return ok({ config: bundle.a, models: bundle.b })
  }, [])

  const { data, loading, error, refetch } = useAdapterCall(fetcher)

  const { config, models } = data ?? { config: undefined as OpenClawConfig | undefined, models: [] as ModelInfo[] }

  const primaryFromConfig = config?.agents?.defaults?.model?.primary ?? ''

  useEffect(() => {
    if (data) {
      setSelectedDefault(primaryFromConfig)
    }
  }, [data, primaryFromConfig])

  const combinedOptions = useMemo(() => {
    const list = [...models]
    const idSet = new Set(list.map((m) => m.id))
    if (primaryFromConfig && !idSet.has(primaryFromConfig)) {
      list.unshift({
        id: primaryFromConfig,
        name: primaryFromConfig,
        provider: 'config',
        enabled: true,
      })
    }
    return list
  }, [models, primaryFromConfig])

  const handleDefaultModelChange = useCallback(
    async (modelId: string) => {
      if (!modelId || modelId === primaryFromConfig) {
        setSelectedDefault(modelId)
        return
      }
      setActionError(null)
      setSelectedDefault(modelId)
      setSavingDefault(true)
      const r = await platformResults.setDefaultModel(modelId)
      setSavingDefault(false)
      if (!r.success) {
        setActionError(r.error ?? '保存默认模型失败')
      }
      void refetch()
    },
    [primaryFromConfig, refetch]
  )

  if (loading) {
    return <LoadingState message="加载模型…" />
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="py-8 text-center text-sm text-red-500">加载失败：{error ?? '未知错误'}</p>
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

  const providers: Record<string, OpenClawModelProvider> = config?.models?.providers ?? {}

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <h1 className="text-2xl font-bold shrink-0">模型配置</h1>
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor="default-model" className="text-xs text-muted-foreground">
            默认模型（写入 agents.defaults.model.primary）
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="default-model"
              className="px-3 py-1.5 bg-background rounded border border-border text-sm min-w-[12rem] max-w-full"
              value={selectedDefault}
              disabled={savingDefault || combinedOptions.length === 0}
              onChange={(e) => void handleDefaultModelChange(e.target.value)}
            >
              {combinedOptions.length === 0 ? (
                <option value="">暂无可用模型</option>
              ) : (
                combinedOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))
              )}
            </select>
            {savingDefault && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                保存中…
              </span>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-500" role="alert">
          {actionError}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        当前配置中的默认模型：{' '}
        <span className="font-medium text-foreground font-mono text-xs break-all">
          {primaryFromConfig || '—'}
        </span>
      </p>

      <h2 className="text-base font-medium">已配置的提供商</h2>

      <div className="space-y-3">
        {Object.entries(providers).map(([providerId, provider]) => (
          <div key={providerId} className="bg-card border border-border rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                <span className="font-medium capitalize">{providerId}</span>
                {provider.baseUrl && (
                  <span className="text-xs text-muted-foreground font-mono truncate" title={provider.baseUrl}>
                    ({provider.baseUrl})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Link
                  to="/config"
                  className="inline-flex items-center justify-center px-3 py-1 text-sm border border-border rounded hover:bg-accent"
                >
                  编辑
                </Link>
                <button
                  type="button"
                  className="px-3 py-1 text-sm border border-border rounded hover:bg-accent"
                  onClick={() => {
                    setTestHintProvider((prev) => (prev === providerId ? null : providerId))
                  }}
                >
                  测试
                </button>
              </div>
            </div>

            {testHintProvider === providerId && (
              <p className="text-sm text-muted-foreground mb-3 rounded-md bg-muted/50 px-3 py-2 border border-border">
                本页不发起对外请求。请在终端用本机 <code className="font-mono text-xs">openclaw</code>{' '}
                或网关日志确认「{providerId}」的 API Key / 网络是否可用；详细步骤见{' '}
                <a
                  href="https://docs.openclaw.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  文档
                </a>
                。
              </p>
            )}

            {provider.models && provider.models.length > 0 && (
              <div className="text-sm text-muted-foreground">
                <p>
                  可用模型:{' '}
                  {provider.models
                    .map((m) => (typeof m === 'string' ? m : m.name || m.id || ''))
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            )}

            <p className="text-emerald-600 dark:text-emerald-500 text-sm mt-2">已写入 openclaw.json</p>
          </div>
        ))}

        {Object.keys(providers).length === 0 && (
          <div className="bg-card border border-border rounded-lg p-4 text-muted-foreground text-sm">
            暂无提供商。请点击下方按钮到「配置」页编辑{' '}
            <code className="font-mono text-xs">models.providers</code>。
          </div>
        )}
      </div>

      <Link
        to="/config"
        className="inline-flex px-4 py-2 border border-border rounded hover:bg-accent text-sm"
      >
        + 添加提供商
      </Link>

      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-medium mb-2">备选链</h2>
        <p className="text-sm text-muted-foreground mb-3">
          多模型回退由 openclaw 配置结构决定；若你的版本支持在{' '}
          <code className="font-mono text-xs">agents.defaults.model</code> 中配置多项，请在「配置」页使用 JSON
          编辑。
        </p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="px-3 py-1 bg-primary/10 text-primary rounded font-mono text-xs break-all">
            {primaryFromConfig || '—'}
          </span>
          <span className="text-muted-foreground">→</span>
          <Link to="/config" className="px-3 py-1 border border-border rounded hover:bg-accent text-sm">
            前往配置
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        可视化编辑能力有限时，请使用「配置」页的 JSON 视图修改完整结构。
      </p>
    </div>
  )
}
