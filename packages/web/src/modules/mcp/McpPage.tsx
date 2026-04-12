import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight,
  CheckCircle2,
  CopyPlus,
  Download,
  Globe,
  LibraryBig,
  Network,
  Package,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react'
import { ErrorBoundary } from '@/shared/components/ErrorBoundary'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { InstallTask } from '@/shared/components/InstallTask'
import { LoadingState } from '@/shared/components/LoadingState'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { useInstallTask } from '@/shared/hooks/useInstallTask'
import {
  addMcpServer,
  getMcpServers,
  importMcpServers,
  listMcpImportCandidates,
  removeMcpServer,
  toggleMcpServer,
  type McpRemoteServerConfig,
  type McpServerConfig,
  type McpTransport,
} from '@/shared/adapters/mcp'
import {
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  FEATURED_MCP_SERVERS,
  MCP_CATALOG,
  buildMcpServerConfig,
  type CatalogMcpServer,
  type McpCategory,
} from './catalog'

type ManualTransport = McpTransport

type ImportResultState = {
  path: string
  importedIds: string[]
} | null

type ManualFormState = {
  id: string
  transport: ManualTransport
  packageName: string
  command: string
  args: string
  url: string
  env: string
  headers: string
}

const DEFAULT_MANUAL_FORM: ManualFormState = {
  id: '',
  transport: 'stdio',
  packageName: '',
  command: 'npx',
  args: '',
  url: '',
  env: '',
  headers: '',
}

export default function McpPage() {
  return (
    <ErrorBoundary>
      <McpContent />
    </ErrorBoundary>
  )
}

function McpContent() {
  const { t } = useTranslation()
  const fetchServers = useCallback(async () => getMcpServers(), [])
  const fetchCandidates = useCallback(async () => listMcpImportCandidates(), [])
  const {
    data: servers,
    loading: serversLoading,
    error: serversError,
    refetch: refetchServers,
  } = useAdapterCall(fetchServers)
  const {
    data: importCandidates,
    loading: candidatesLoading,
    error: candidatesError,
    refetch: refetchCandidates,
  } = useAdapterCall(fetchCandidates)

  const [selectedCategory, setSelectedCategory] = useState<McpCategory | 'all'>('all')
  const [selectedServerId, setSelectedServerId] = useState<string>(FEATURED_MCP_SERVERS[0]?.id ?? MCP_CATALOG[0]?.id ?? '')
  const [catalogInputs, setCatalogInputs] = useState<Record<string, Record<string, string>>>({})
  const [catalogExtraArgs, setCatalogExtraArgs] = useState<Record<string, string>>({})
  const [busyServerId, setBusyServerId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; config: McpServerConfig; name: string } | null>(null)
  const [importPath, setImportPath] = useState('')
  const [importResult, setImportResult] = useState<ImportResultState>(null)
  const [manualForm, setManualForm] = useState<ManualFormState>(DEFAULT_MANUAL_FORM)

  const setupTask = useInstallTask()
  const importTask = useInstallTask()
  const manualTask = useInstallTask()

  const installedMap = servers ?? {}
  const installedEntries = useMemo(
    () => Object.entries(installedMap).sort(([left], [right]) => left.localeCompare(right)),
    [installedMap],
  )
  const catalogById = useMemo(
    () => new Map(MCP_CATALOG.map((server) => [server.id, server])),
    [],
  )
  const selectedCatalog = catalogById.get(selectedServerId) ?? FEATURED_MCP_SERVERS[0] ?? null
  const nonFeaturedCatalog = useMemo(
    () => MCP_CATALOG.filter((server) => !server.featured),
    [],
  )
  const visibleCatalog = useMemo(
    () =>
      selectedCategory === 'all'
        ? nonFeaturedCatalog
        : nonFeaturedCatalog.filter((server) => server.category === selectedCategory),
    [nonFeaturedCatalog, selectedCategory],
  )

  const installedCount = installedEntries.length
  const enabledCount = installedEntries.filter(([, config]) => config.enabled).length
  const remoteCount = installedEntries.filter(([, config]) => isRemoteServer(config)).length
  const detectedImportCount = (importCandidates ?? []).filter((candidate) => candidate.exists).length

  const selectedInputs = selectedCatalog ? catalogInputs[selectedCatalog.id] ?? {} : {}
  const selectedInstalled = selectedCatalog ? installedMap[selectedCatalog.id] : undefined

  async function refreshAll() {
    await Promise.all([refetchServers(), refetchCandidates()])
  }

  async function withBusyServer<T>(serverId: string, task: () => Promise<T>) {
    setActionError(null)
    setBusyServerId(serverId)
    try {
      return await task()
    } finally {
      setBusyServerId(null)
    }
  }

  async function handleCatalogInstall(server: CatalogMcpServer) {
    const extraArgs = parseLines(catalogExtraArgs[server.id] ?? '')
    await withBusyServer(server.id, async () => {
      await setupTask.run(async () => {
        const config = buildMcpServerConfig(server, catalogInputs[server.id] ?? {}, extraArgs.length > 0 ? extraArgs : undefined)
        const result = await addMcpServer(server.id, config, server.package)
        if (!result.success) {
          throw new Error(result.error ?? t('mcp.installFailed', { message: t('common.unknownError') }))
        }
        await refetchServers()
      })
    })
  }

  async function handleToggle(id: string, enabled: boolean) {
    await withBusyServer(id, async () => {
      const result = await toggleMcpServer(id, enabled)
      if (!result.success) {
        setActionError(result.error ?? t('common.requestFailed'))
        return
      }
      await refetchServers()
    })
  }

  async function handleRemove(id: string, config: McpServerConfig) {
    await withBusyServer(id, async () => {
      const pkg = config.meta?.managedPackage ?? catalogById.get(id)?.package
      const result = await removeMcpServer(id, pkg)
      if (!result.success) {
        setActionError(result.error ?? t('common.requestFailed'))
        return
      }
      await refetchServers()
    })
  }

  async function runImport(pathInput: string) {
    const trimmed = pathInput.trim()
    if (!trimmed) {
      setActionError(t('mcp.import.pathRequired'))
      return
    }

    setActionError(null)
    setImportResult(null)
    await importTask.run(async () => {
      const result = await importMcpServers(trimmed)
      if (!result.success || !result.data) {
        throw new Error(result.error ?? t('common.requestFailed'))
      }
      setImportResult(result.data)
      await refreshAll()
    })
  }

  async function handleManualAdd() {
    const serverId = manualForm.id.trim()
    if (!serverId) {
      setActionError(t('mcp.manual.idRequired'))
      return
    }

    const env = parseKeyValueLines(manualForm.env)
    const headers = parseKeyValueLines(manualForm.headers)
    const packageName = manualForm.packageName.trim()

    let config: McpServerConfig

    if (manualForm.transport === 'stdio') {
      const command = manualForm.command.trim() || (packageName ? 'npx' : '')
      const args = parseShellArgs(manualForm.args)
      const finalArgs = args.length > 0 ? args : packageName ? ['-y', packageName] : []
      if (!command) {
        setActionError(t('mcp.manual.commandRequired'))
        return
      }

      config = {
        transport: 'stdio',
        command,
        args: finalArgs,
        env,
        enabled: true,
        meta: {
          source: 'manual',
          managedPackage: packageName || undefined,
        },
      }
    } else {
      const url = manualForm.url.trim()
      if (!url) {
        setActionError(t('mcp.manual.urlRequired'))
        return
      }

      config = {
        transport: manualForm.transport,
        url,
        headers,
        env,
        enabled: true,
        meta: {
          source: 'manual',
        },
      }
    }

    setActionError(null)
    await manualTask.run(async () => {
      const result = await addMcpServer(serverId, config, packageName || undefined)
      if (!result.success) {
        throw new Error(result.error ?? t('common.requestFailed'))
      }
      setManualForm(DEFAULT_MANUAL_FORM)
      await refetchServers()
    })
  }

  return (
    <div className="page-shell page-shell-bleed">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('mcp.header.kicker')}</span>
            <span>{t('mcp.header.supportedTransports')}</span>
            <span>{t('mcp.header.importSources')}</span>
          </div>
          <h1 className="page-title">{t('mcp.title')}</h1>
          <p className="page-subtitle">{t('mcp.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="button-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {(serversError || candidatesError || actionError) && (
        <div role="alert" className="surface-card border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300">
          {serversError ?? candidatesError ?? actionError}
        </div>
      )}

      <div className="metric-grid">
        <MetricCard
          icon={PlugZap}
          label={t('mcp.metrics.connected')}
          value={String(installedCount)}
          meta={t('mcp.metrics.connectedMeta')}
        />
        <MetricCard
          icon={ShieldCheck}
          label={t('mcp.metrics.enabled')}
          value={String(enabledCount)}
          meta={t('mcp.metrics.enabledMeta')}
        />
        <MetricCard
          icon={Globe}
          label={t('mcp.metrics.remote')}
          value={String(remoteCount)}
          meta={t('mcp.metrics.remoteMeta')}
        />
        <MetricCard
          icon={LibraryBig}
          label={t('mcp.metrics.imports')}
          value={String(detectedImportCount)}
          meta={t('mcp.metrics.importsMeta')}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(21rem,0.95fr)]">
        <div className="space-y-5">
          <section id="mcp-installed" className="surface-card">
            <div className="section-heading">
              <div>
                <p className="section-subtitle">{t('mcp.installedLead')}</p>
                <h2 className="section-title">{t('mcp.installedTitle')}</h2>
              </div>
            </div>
            {serversLoading ? (
              <LoadingState message={t('mcp.loadingInstalled')} fullPage={false} />
            ) : installedEntries.length === 0 ? (
              <div className="inline-note">{t('mcp.noInstalled')}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {installedEntries.map(([id, config]) => {
                  const catalog = catalogById.get(id)
                  const name = catalog?.name ?? id
                  const busy = busyServerId === id
                  return (
                    <article key={id} className="section-subcard space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold">{name}</span>
                            <StatusBadge enabled={config.enabled} />
                            <TransportBadge transport={getTransport(config)} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                          {catalog ? t(catalog.descriptionKey) : t('mcp.manual.sourceLabel')}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${CATEGORY_COLORS[catalog?.category ?? 'utilities']}`}>
                          {catalog ? t(`mcp.category.${catalog.category}`) : t(`mcp.source.${config.meta?.source ?? 'manual'}`)}
                        </span>
                      </div>
                      <div className="inline-note space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          {isRemoteServer(config) ? <Globe className="h-4 w-4" /> : <TerminalSquare className="h-4 w-4" />}
                          <span className="break-all font-mono text-xs">
                            {isRemoteServer(config) ? config.url : [config.command, ...config.args].join(' ')}
                          </span>
                        </div>
                          {config.meta?.importPath && (
                          <div className="text-xs text-muted-foreground">
                            {t('mcp.import.importedFrom')}: {config.meta.importPath}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {catalog && (
                          <button
                            type="button"
                            onClick={() => setSelectedServerId(catalog.id)}
                            className="button-secondary px-3 py-1.5 text-sm"
                          >
                            {t('mcp.openSetup')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleToggle(id, !config.enabled)}
                          disabled={busy}
                          className="button-secondary px-3 py-1.5 text-sm"
                        >
                          {config.enabled ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          {config.enabled ? t('mcp.disable') : t('mcp.enable')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRemoval({ id, config, name })}
                          disabled={busy}
                          className="button-danger px-3 py-1.5 text-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t('mcp.remove')}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section id="mcp-featured" className="surface-card">
            <div className="section-heading">
              <div>
                <p className="section-subtitle">{t('mcp.featuredLead')}</p>
                <h2 className="section-title">{t('mcp.featuredTitle')}</h2>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {FEATURED_MCP_SERVERS.map((server) => {
                const active = selectedServerId === server.id
                const installed = Boolean(installedMap[server.id])
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => setSelectedServerId(server.id)}
                    className={`section-subcard text-left transition ${
                      active ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{server.name}</span>
                          {installed && <StatusBadge enabled={installedMap[server.id]?.enabled ?? false} />}
                        </div>
                        <p className="text-sm text-muted-foreground">{t(server.descriptionKey)}</p>
                      </div>
                      <TransportBadge transport={server.transport} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${CATEGORY_COLORS[server.category]}`}>
                        {t(`mcp.category.${server.category}`)}
                      </span>
                      {server.package ? (
                        <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          npx
                        </span>
                      ) : (
                        <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          {t('mcp.remoteReady')}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <p className="section-subtitle">{t('mcp.catalogLead')}</p>
                <h2 className="section-title">{t('mcp.catalogTitle')}</h2>
              </div>
              <div className="pill-group">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`pill-button ${selectedCategory === 'all' ? 'pill-button-active' : 'pill-button-inactive'}`}
                >
                  {t('mcp.allCategories')}
                </button>
                {CATEGORY_ORDER.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`pill-button ${selectedCategory === category ? 'pill-button-active' : 'pill-button-inactive'}`}
                  >
                    {t(`mcp.category.${category}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visibleCatalog.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => setSelectedServerId(server.id)}
                  className={`section-subcard text-left transition ${
                    selectedServerId === server.id ? 'border-primary/50 bg-primary/5' : 'hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{server.name}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{t(server.descriptionKey)}</p>
                    </div>
                    <TransportBadge transport={server.transport} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${CATEGORY_COLORS[server.category]}`}>
                      {t(`mcp.category.${server.category}`)}
                    </span>
                    {installedMap[server.id] && <StatusBadge enabled={installedMap[server.id].enabled} />}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          {selectedCatalog && (
            <section className="surface-card">
              <div className="section-heading">
                <div>
                  <p className="section-subtitle">{t('mcp.setupLead')}</p>
                  <h2 className="section-title">{selectedCatalog.name}</h2>
                </div>
                <TransportBadge transport={selectedCatalog.transport} />
              </div>
              <div className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">{t(selectedCatalog.descriptionKey)}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="section-subcard">
                    <p className="control-label">{t('mcp.transport')}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                      {selectedCatalog.transport === 'stdio' ? <TerminalSquare className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                      {t(`mcp.transport.${selectedCatalog.transport}`)}
                    </p>
                  </div>
                  <div className="section-subcard">
                    <p className="control-label">{t('mcp.packageOrEndpoint')}</p>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {selectedCatalog.package ?? selectedCatalog.url}
                    </p>
                  </div>
                </div>

                {selectedCatalog.fields.length > 0 ? (
                  <div className="grid gap-3">
                    {selectedCatalog.fields.map((field) => (
                      <label key={field.key} className="grid gap-2">
                        <span className="control-label">{t(field.labelKey)}</span>
                        <input
                          type={field.sensitive ? 'password' : 'text'}
                          value={readCatalogInputValue(selectedInputs, field.key, getExistingFieldValue(selectedInstalled, field))}
                          onChange={(event) => {
                            const value = event.target.value
                            setCatalogInputs((current) => ({
                              ...current,
                              [selectedCatalog.id]: {
                                ...(current[selectedCatalog.id] ?? {}),
                                [field.key]: value,
                              },
                            }))
                          }}
                          className="control-input"
                          placeholder={field.key}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="inline-note">{t('mcp.noEnvRequired')}</div>
                )}

                {selectedCatalog.transport === 'stdio' && (
                  <label className="grid gap-2">
                    <span className="control-label">{t('mcp.extraArgs')}</span>
                    <textarea
                      rows={selectedCatalog.id === 'filesystem' ? 4 : 3}
                      value={readCatalogInputValue(catalogExtraArgs, selectedCatalog.id, defaultExtraArgsValue(selectedCatalog, selectedInstalled))}
                      onChange={(event) => {
                        const value = event.target.value
                        setCatalogExtraArgs((current) => ({ ...current, [selectedCatalog.id]: value }))
                      }}
                      className="control-textarea"
                      placeholder={selectedCatalog.id === 'filesystem' ? t('mcp.fsPathPlaceholder') : t('mcp.extraArgsPlaceholder')}
                    />
                  </label>
                )}

                {selectedCatalog.docsUrl && (
                  <a
                    href={selectedCatalog.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="button-secondary w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4" />
                      {t('mcp.openDocs')}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{selectedCatalog.docsUrl}</span>
                  </a>
                )}

                <InstallTask
                  label={selectedCatalog.name}
                  description={selectedCatalog.package ?? selectedCatalog.url}
                  status={setupTask.status}
                  progress={setupTask.progress}
                  log={setupTask.log}
                  error={setupTask.error}
                  onRetry={setupTask.reset}
                />

                {selectedInstalled ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void handleToggle(selectedCatalog.id, !selectedInstalled.enabled)}
                      disabled={busyServerId === selectedCatalog.id}
                      className="button-secondary"
                    >
                      {selectedInstalled.enabled ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                      {selectedInstalled.enabled ? t('mcp.disable') : t('mcp.enable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoval({ id: selectedCatalog.id, config: selectedInstalled, name: selectedCatalog.name })}
                      disabled={busyServerId === selectedCatalog.id}
                      className="button-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('mcp.remove')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCatalogInstall(selectedCatalog)}
                    disabled={busyServerId === selectedCatalog.id || hasMissingRequiredFields(selectedCatalog, selectedInputs)}
                    className="button-primary w-full"
                  >
                    {selectedCatalog.transport === 'stdio' ? <Package className="h-4 w-4" /> : <Network className="h-4 w-4" />}
                    {t(selectedCatalog.transport === 'stdio' ? 'mcp.setupInstallAction' : 'mcp.setupConnectAction')}
                  </button>
                )}
              </div>
            </section>
          )}

          <section id="mcp-import" className="surface-card">
            <div className="section-heading">
              <div>
                <p className="section-subtitle">{t('mcp.importLead')}</p>
                <h2 className="section-title">{t('mcp.importTitle')}</h2>
              </div>
            </div>
            <div className="space-y-4">
              {candidatesLoading ? (
                <LoadingState message={t('mcp.loadingImports')} fullPage={false} />
              ) : (
                <div className="grid gap-2">
                  {(importCandidates ?? []).map((candidate) => (
                    <div key={candidate.id} className="section-subcard flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{t(`mcp.import.source.${candidate.id}`)}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{candidate.path}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void runImport(candidate.path)}
                        disabled={!candidate.exists || importTask.status === 'running'}
                        className="button-secondary px-3 py-1.5 text-sm"
                      >
                        <Download className="h-4 w-4" />
                        {candidate.exists ? t('mcp.importAction') : t('mcp.importMissing')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="grid gap-2">
                <span className="control-label">{t('mcp.import.pathLabel')}</span>
                <input
                  type="text"
                  value={importPath}
                  onChange={(event) => setImportPath(event.target.value)}
                  className="control-input"
                  placeholder={t('mcp.import.pathPlaceholder')}
                />
              </label>
              <button
                type="button"
                onClick={() => void runImport(importPath)}
                disabled={importTask.status === 'running'}
                className="button-primary w-full"
              >
                <Download className="h-4 w-4" />
                {t('mcp.importAction')}
              </button>

              <InstallTask
                label={t('mcp.importTitle')}
                description={importPath || importResult?.path}
                status={importTask.status}
                progress={importTask.progress}
                log={importTask.log}
                error={importTask.error}
                onRetry={importTask.reset}
              />

              {importResult && (
                <div className="inline-note space-y-2">
                  <p className="font-medium">{t('mcp.import.resultTitle')}</p>
                  <p className="text-xs text-muted-foreground">{importResult.path}</p>
                  <div className="flex flex-wrap gap-2">
                    {importResult.importedIds.length > 0 ? (
                      importResult.importedIds.map((id) => (
                        <span key={id} className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs">
                          {id}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{t('mcp.import.emptyResult')}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section id="mcp-manual" className="surface-card">
            <div className="section-heading">
              <div>
                <p className="section-subtitle">{t('mcp.manualLead')}</p>
                <h2 className="section-title">{t('mcp.manualTitle')}</h2>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="control-label">{t('mcp.manual.idLabel')}</span>
                  <input
                    type="text"
                    value={manualForm.id}
                    onChange={(event) => setManualForm((current) => ({ ...current, id: event.target.value }))}
                    className="control-input"
                    placeholder={t('mcp.customIdPlaceholder')}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="control-label">{t('mcp.transport')}</span>
                  <select
                    value={manualForm.transport}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        transport: event.target.value as ManualTransport,
                      }))
                    }
                    className="control-select"
                  >
                    <option value="stdio">{t('mcp.transport.stdio')}</option>
                    <option value="http">{t('mcp.transport.http')}</option>
                    <option value="sse">{t('mcp.transport.sse')}</option>
                  </select>
                </label>
              </div>

              {manualForm.transport === 'stdio' ? (
                <div className="grid gap-3">
                  <label className="grid gap-2">
                    <span className="control-label">{t('mcp.manual.packageLabel')}</span>
                    <input
                      type="text"
                      value={manualForm.packageName}
                      onChange={(event) => setManualForm((current) => ({ ...current, packageName: event.target.value }))}
                      className="control-input"
                      placeholder={t('mcp.customPackagePlaceholder')}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="control-label">{t('mcp.manual.commandLabel')}</span>
                      <input
                        type="text"
                        value={manualForm.command}
                        onChange={(event) => setManualForm((current) => ({ ...current, command: event.target.value }))}
                        className="control-input"
                        placeholder="npx"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="control-label">{t('mcp.manual.argsLabel')}</span>
                      <input
                        type="text"
                        value={manualForm.args}
                        onChange={(event) => setManualForm((current) => ({ ...current, args: event.target.value }))}
                        className="control-input"
                        placeholder="-y @scope/mcp-server"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="grid gap-2">
                  <span className="control-label">{t('mcp.manual.urlLabel')}</span>
                  <input
                    type="url"
                    value={manualForm.url}
                    onChange={(event) => setManualForm((current) => ({ ...current, url: event.target.value }))}
                    className="control-input"
                    placeholder="https://example.com/mcp"
                  />
                </label>
              )}

              <label className="grid gap-2">
                <span className="control-label">{t('mcp.manual.envLabel')}</span>
                <textarea
                  rows={4}
                  value={manualForm.env}
                  onChange={(event) => setManualForm((current) => ({ ...current, env: event.target.value }))}
                  className="control-textarea"
                  placeholder={t('mcp.manual.keyValuePlaceholder')}
                />
              </label>

              {manualForm.transport !== 'stdio' && (
                <label className="grid gap-2">
                  <span className="control-label">{t('mcp.manual.headersLabel')}</span>
                  <textarea
                    rows={4}
                    value={manualForm.headers}
                    onChange={(event) => setManualForm((current) => ({ ...current, headers: event.target.value }))}
                    className="control-textarea"
                    placeholder={t('mcp.manual.keyValuePlaceholder')}
                  />
                </label>
              )}

              <InstallTask
                label={t('mcp.manualTitle')}
                description={manualForm.id || undefined}
                status={manualTask.status}
                progress={manualTask.progress}
                log={manualTask.log}
                error={manualTask.error}
                onRetry={manualTask.reset}
              />

              <button
                type="button"
                onClick={() => void handleManualAdd()}
                disabled={manualTask.status === 'running'}
                className="button-primary w-full"
              >
                <CopyPlus className="h-4 w-4" />
                {t('mcp.manual.addAction')}
              </button>
            </div>
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title={pendingRemoval ? t('mcp.confirmRemove', { name: pendingRemoval.name }) : ''}
        tone="danger"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (!pendingRemoval) return
          const current = pendingRemoval
          setPendingRemoval(null)
          void handleRemove(current.id, current.config)
        }}
      />
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  meta,
}: {
  icon: typeof PlugZap
  label: string
  value: string
  meta: string
}) {
  return (
    <div className="metric-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="metric-label">{label}</p>
      </div>
      <p className="metric-value">{value}</p>
      <p className="metric-meta">{meta}</p>
    </div>
  )
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      enabled
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
        : 'bg-muted text-muted-foreground'
    }`}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {enabled ? t('mcp.enabled') : t('mcp.disabled')}
    </span>
  )
}

function TransportBadge({ transport }: { transport: McpTransport }) {
  const icon = transport === 'stdio' ? <TerminalSquare className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {icon}
      {transport}
    </span>
  )
}

function getTransport(config: McpServerConfig): McpTransport {
  return isRemoteServer(config) ? config.transport : 'stdio'
}

function isRemoteServer(config: McpServerConfig): config is McpRemoteServerConfig {
  return config.transport === 'http' || config.transport === 'sse'
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseKeyValueLines(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of parseLines(value)) {
    const index = line.indexOf('=')
    if (index === -1) continue
    const key = line.slice(0, index).trim()
    const entry = line.slice(index + 1).trim()
    if (!key) continue
    result[key] = entry
  }
  return result
}

function parseShellArgs(value: string): string[] {
  const result: string[] = []
  let current = ''
  let quote: '"' | '\'' | null = null
  let escaped = false

  for (const char of value.trim()) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        result.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) {
    result.push(current)
  }

  return result
}

function readCatalogInputValue(
  values: Record<string, string>,
  key: string,
  fallback: string,
): string {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? '' : fallback
}

function hasMissingRequiredFields(server: CatalogMcpServer, inputs: Record<string, string>): boolean {
  return server.fields.some((field) => field.required && !(inputs[field.key] ?? '').trim())
}

function getExistingFieldValue(
  installed: McpServerConfig | undefined,
  field: CatalogMcpServer['fields'][number],
): string {
  if (!installed) return ''
  if (field.target === 'header' && field.headerName && isRemoteServer(installed)) {
    return installed.headers?.[field.headerName] ?? ''
  }
  return installed.env[field.key] ?? ''
}

function defaultExtraArgsValue(server: CatalogMcpServer, installed: McpServerConfig | undefined): string {
  if (installed && !isRemoteServer(installed)) {
    return installed.args.slice(2).join('\n')
  }
  return (server.defaultArgs ?? []).join('\n')
}
