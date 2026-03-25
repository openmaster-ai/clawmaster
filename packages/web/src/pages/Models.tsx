import { useEffect, useState } from 'react'
import { platform } from '@/adapters'
import { PasswordField } from '@/shared/components/PasswordField'
import type { OpenClawConfig, ModelInfo } from '@/lib/types'

export default function Models() {
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [cfg, modelList] = await Promise.all([
        platform.getConfig(),
        platform.getModels(),
      ])
      setConfig(cfg)
      setModels(modelList)
    } catch (err) {
      console.error('Failed to load models:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  const defaultModel = config?.agents?.defaults?.model?.primary || '-'
  const providers = config?.models?.providers || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">模型配置</h1>
        <select 
          className="px-3 py-1.5 bg-muted rounded border border-border"
          defaultValue={defaultModel}
        >
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">
        默认模型: <span className="font-medium text-foreground">{defaultModel}</span>
      </p>
      
      <h3 className="font-medium">已配置的提供商</h3>
      
      <div className="space-y-3">
        {Object.entries(providers).map(([providerId, provider]: [string, any]) => (
          <div key={providerId} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="font-medium capitalize">{providerId}</span>
                {provider.baseUrl && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({provider.baseUrl})
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1 text-sm border border-border rounded hover:bg-accent">
                  编辑
                </button>
                <button className="px-3 py-1 text-sm border border-border rounded hover:bg-accent">
                  测试
                </button>
              </div>
            </div>
            
            {(provider.apiKey || provider.api_key) && (
              <div className="flex items-center gap-2 text-sm mb-2">
                <span className="text-muted-foreground w-16">API Key:</span>
                <PasswordField value={provider.apiKey || provider.api_key} className="flex-1" />
              </div>
            )}

            {provider.models && (
              <div className="text-sm text-muted-foreground">
                <p>可用模型: {provider.models.map((m: any) => m.name || m.id).join(', ')}</p>
              </div>
            )}

            <p className="text-green-600 text-sm mt-2">✓ 已配置</p>
          </div>
        ))}

        {Object.keys(providers).length === 0 && (
          <div className="bg-card border border-border rounded-lg p-4 text-muted-foreground">
            暂无配置的提供商
          </div>
        )}
      </div>

      <button className="px-4 py-2 border border-border rounded hover:bg-accent">
        + 添加提供商
      </button>

      {/* 备选链 */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">备选链</h3>
        <p className="text-sm text-muted-foreground mb-3">
          当主模型不可用时，自动切换到备选模型
        </p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="px-3 py-1 bg-primary/10 text-primary rounded">{defaultModel}</span>
          <span className="text-muted-foreground">→</span>
          <button className="px-3 py-1 border border-border rounded hover:bg-accent">
            + 添加备选
          </button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        💡 模型配置需要编辑配置文件，请前往「配置」页面进行详细设置
      </div>
    </div>
  )
}
