import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { LoadingState } from '@/shared/components/LoadingState'
import { InstallTask } from '@/shared/components/InstallTask'
import {
  getMcpServers,
  addMcpServer,
  removeMcpServer,
  toggleMcpServer,
} from '@/shared/adapters/mcp'
import {
  MCP_CATALOG,
  CATEGORY_ORDER,
  CATEGORY_COLORS,
  buildMcpServerConfig,
  type CatalogMcpServer,
  type McpCategory,
} from './catalog'
import {
  Plug,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

export default function McpPage() {
  return (
    <ErrorBoundary>
      <McpContent />
    </ErrorBoundary>
  )
}

function McpContent() {
  const { t } = useTranslation()
  const { data: servers, loading, refetch } = useAdapterCall(getMcpServers)
  const [selectedCategory, setSelectedCategory] = useState<McpCategory | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [operating, setOperating] = useState<string | null>(null)

  const filteredCatalog = useMemo(
    () => selectedCategory === 'all' ? MCP_CATALOG : MCP_CATALOG.filter((s) => s.category === selectedCategory),
    [selectedCategory],
  )

  const installedMap = servers ?? {}

  if (loading && !servers) {
    return <LoadingState message={t('mcp.title')} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('mcp.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t('mcp.subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 border border-border rounded hover:bg-accent"
          title={t('common.refresh') ?? 'Refresh'}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        <CategoryPill
          active={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          label={t('mcp.allCategories')}
        />
        {CATEGORY_ORDER.map((cat) => (
          <CategoryPill
            key={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            label={t(`mcp.category.${cat}`)}
          />
        ))}
      </div>

      {/* Catalog grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCatalog.map((catalog) => (
          <McpCard
            key={catalog.id}
            catalog={catalog}
            installed={installedMap[catalog.id]}
            expanded={expandedId === catalog.id}
            operating={operating === catalog.id}
            onToggleExpand={() => setExpandedId(expandedId === catalog.id ? null : catalog.id)}
            onInstall={async (env, extraArgs) => {
              setOperating(catalog.id)
              const config = buildMcpServerConfig(catalog, env, extraArgs)
              const result = await addMcpServer(catalog.id, config, catalog.package)
              if (!result.success) {
                alert(t('mcp.installFailed', { message: result.error }))
              }
              await refetch()
              setOperating(null)
            }}
            onRemove={async () => {
              if (!confirm(t('mcp.confirmRemove', { name: catalog.name }))) return
              setOperating(catalog.id)
              await removeMcpServer(catalog.id, catalog.package)
              await refetch()
              setOperating(null)
            }}
            onToggle={async (enabled) => {
              setOperating(catalog.id)
              await toggleMcpServer(catalog.id, enabled)
              await refetch()
              setOperating(null)
            }}
          />
        ))}
      </div>

      {/* Custom server */}
      <CustomServerForm
        onAdd={async (id, pkg, env) => {
          setOperating(id)
          const config = { command: 'npx', args: ['-y', pkg], env, enabled: true }
          const result = await addMcpServer(id, config, pkg)
          if (!result.success) {
            alert(t('mcp.installFailed', { message: result.error }))
          }
          await refetch()
          setOperating(null)
        }}
        operating={!!operating}
      />
    </div>
  )
}

// ─── Sub-components ───

function CategoryPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-card shadow-sm' : 'hover:bg-card/50'
      }`}
    >
      {label}
    </button>
  )
}

function McpCard({
  catalog,
  installed,
  expanded,
  operating,
  onToggleExpand,
  onInstall,
  onRemove,
  onToggle,
}: {
  catalog: CatalogMcpServer
  installed?: { command: string; args: string[]; env: Record<string, string>; enabled: boolean }
  expanded: boolean
  operating: boolean
  onToggleExpand: () => void
  onInstall: (env: Record<string, string>, extraArgs?: string[]) => void
  onRemove: () => void
  onToggle: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const installTask = useInstallTask()
  const [envInputs, setEnvInputs] = useState<Record<string, string>>(() => installed?.env ?? {})
  const [fsPath, setFsPath] = useState(
    () => installed?.args?.slice(2).join(', ') ?? catalog.defaultArgs?.join(', ') ?? '',
  )

  const isInstalled = !!installed

  return (
    <div className={`bg-card border rounded-lg transition-colors ${
      expanded ? 'border-primary/40' : 'border-border hover:border-primary/30'
    }`}>
      {/* Card header */}
      <div className="p-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium">{catalog.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isInstalled && (
              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                installed.enabled
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                <CheckCircle2 className="w-3 h-3" />
                {installed.enabled ? t('mcp.enabled') : t('mcp.disabled')}
              </span>
            )}
            <span className={`px-2 py-0.5 text-xs rounded-full ${CATEGORY_COLORS[catalog.category]}`}>
              {t(`mcp.category.${catalog.category}`)}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t(catalog.descriptionKey)}</p>
        <p className="text-xs text-muted-foreground font-mono mt-1">{catalog.package}</p>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          {/* Env vars */}
          {catalog.envVars.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t('mcp.envVars')}</p>
              {catalog.envVars.map((ev) => (
                <EnvVarInput
                  key={ev.key}
                  label={t(ev.labelKey)}
                  value={envInputs[ev.key] ?? ''}
                  sensitive={ev.sensitive}
                  onChange={(v) => setEnvInputs((prev) => ({ ...prev, [ev.key]: v }))}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('mcp.noEnvRequired')}</p>
          )}

          {/* Filesystem path args */}
          {catalog.id === 'filesystem' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('mcp.fsPathLabel')}</label>
              <input
                type="text"
                value={fsPath}
                onChange={(e) => setFsPath(e.target.value)}
                placeholder={t('mcp.fsPathPlaceholder')}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm font-mono"
              />
            </div>
          )}

          {/* Docs link */}
          {catalog.docsUrl && (
            <a
              href={catalog.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {catalog.docsUrl}
            </a>
          )}

          {/* Install progress */}
          {installTask.status !== 'idle' && (
            <InstallTask
              label={catalog.name}
              description={catalog.package}
              status={installTask.status}
              error={installTask.error}
              onRetry={installTask.reset}
            />
          )}

          {/* Actions */}
          {installTask.status === 'idle' && (
            <div className="flex items-center gap-2 pt-1">
              {isInstalled ? (
                <>
                  <button
                    onClick={() => onToggle(!installed.enabled)}
                    disabled={operating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent disabled:opacity-50"
                  >
                    {installed.enabled
                      ? <><ToggleRight className="w-4 h-4 text-green-500" />{t('mcp.disable')}</>
                      : <><ToggleLeft className="w-4 h-4 text-muted-foreground" />{t('mcp.enable')}</>
                    }
                  </button>
                  <button
                    onClick={onRemove}
                    disabled={operating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {operating ? t('mcp.removing') : t('mcp.remove')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    const extraArgs = catalog.id === 'filesystem' && fsPath.trim()
                      ? fsPath.split(',').map((p) => p.trim()).filter(Boolean)
                      : undefined
                    installTask.run(async () => {
                      onInstall(envInputs, extraArgs)
                    })
                  }}
                  disabled={operating || catalog.envVars.some((ev) => ev.required && !envInputs[ev.key]?.trim())}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('mcp.install')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EnvVarInput({
  label,
  value,
  sensitive,
  onChange,
}: {
  label: string
  value: string
  sensitive: boolean
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1 mt-0.5">
        <input
          type={sensitive && !visible ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-background border border-border rounded text-sm font-mono"
        />
        {sensitive && (
          <button
            onClick={() => setVisible(!visible)}
            className="p-1.5 border border-border rounded hover:bg-accent"
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

function CustomServerForm({
  onAdd,
  operating,
}: {
  onAdd: (id: string, pkg: string, env: Record<string, string>) => void
  operating: boolean
}) {
  const { t } = useTranslation()
  const [id, setId] = useState('')
  const [pkg, setPkg] = useState('')

  const handleAdd = useCallback(() => {
    if (!id.trim() || !pkg.trim()) return
    onAdd(id.trim(), pkg.trim(), {})
    setId('')
    setPkg('')
  }, [id, pkg, onAdd])

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Plus className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{t('mcp.customServer')}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{t('mcp.customServerDesc')}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder={t('mcp.customIdPlaceholder')}
          className="w-40 px-3 py-2 bg-background border border-border rounded text-sm"
        />
        <input
          type="text"
          value={pkg}
          onChange={(e) => setPkg(e.target.value)}
          placeholder={t('mcp.customPackagePlaceholder')}
          className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm font-mono"
        />
        <button
          onClick={handleAdd}
          disabled={!id.trim() || !pkg.trim() || operating}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
        >
          {t('mcp.addCustom')}
        </button>
      </div>
    </div>
  )
}
