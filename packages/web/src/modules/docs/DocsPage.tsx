import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  BookOpen,
  Bot,
  Copy,
  Database,
  ExternalLink,
  FileSearch,
  HardDrive,
  MessageSquare,
  Radio,
  Shield,
  Terminal,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { execCommand } from '@/shared/adapters/platform'
import {
  searchLocalDataResult,
  upsertLocalDataDocumentsResult,
  type LocalDataDocument,
  type LocalDataSearchResult,
} from '@/shared/adapters/storage'
import { ActionBanner } from '@/shared/components/ActionBanner'

const DOCS_SITE_URL = 'https://docs.openclaw.ai'

interface DocResult {
  title: string
  url: string
  snippet: string
}

interface ResourceCardData {
  id: string
  title: string
  description: string
  icon: LucideIcon
  meta: string
  route?: string
  url?: string
  searchTerms: string[]
}

interface CommandCardData {
  id: string
  title: string
  description: string
  command: string
  icon: LucideIcon
  meta: string
  route?: string
  url?: string
  searchTerms: string[]
}

type FeedbackState = {
  tone: 'info' | 'success' | 'error'
  message: string
} | null

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

function matchesQuery(query: string, values: string[]): boolean {
  const normalized = normalizeSearchValue(query)
  if (!normalized) return true
  return values.some((value) => normalizeSearchValue(value).includes(normalized))
}

export function parseDocsOutput(raw: string, fallbackTitle: string): DocResult[] {
  const results: DocResult[] = []
  const lines = raw
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let current: Partial<DocResult> = {}

  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/[^\s]+/)

    if (urlMatch && !current.url) {
      current.url = urlMatch[0]
      const title = line.replace(urlMatch[0], '').replace(/[-–|]\s*$/, '').trim()
      if (title) current.title = title
      continue
    }

    if (current.url && !current.snippet) {
      current.snippet = line
      results.push({
        title: current.title || current.url,
        url: current.url,
        snippet: current.snippet || '',
      })
      current = {}
    }
  }

  if (current.url) {
    results.push({
      title: current.title || current.url,
      url: current.url,
      snippet: current.snippet || '',
    })
  }

  if (results.length === 0 && lines.length > 0) {
    results.push({
      title: fallbackTitle,
      url: DOCS_SITE_URL,
      snippet: lines.join('\n'),
    })
  }

  return results
}

export default function DocsPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [liveResults, setLiveResults] = useState<DocResult[]>([])
  const [liveSearching, setLiveSearching] = useState(false)
  const [liveSearched, setLiveSearched] = useState(false)
  const [indexedResults, setIndexedResults] = useState<LocalDataSearchResult[]>([])
  const [indexedSearching, setIndexedSearching] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const localDataIndexStateRef = useRef<'idle' | 'pending' | 'ready' | 'failed'>('idle')
  const localDataIndexPromiseRef = useRef<Promise<boolean> | null>(null)
  const localDataIndexGenerationRef = useRef(0)
  const localDataIndexedGenerationRef = useRef<number | null>(null)
  const localDataFailedGenerationRef = useRef<number | null>(null)

  const scenarios = useMemo<ResourceCardData[]>(
    () => [
      {
        id: 'feishu',
        title: t('docs.scenario.feishu.title'),
        description: t('docs.scenario.feishu.desc'),
        icon: MessageSquare,
        meta: t('nav.channels'),
        route: '/channels',
        searchTerms: [t('nav.channels')],
      },
      {
        id: 'cost',
        title: t('docs.scenario.cost.title'),
        description: t('docs.scenario.cost.desc'),
        icon: BarChart3,
        meta: t('nav.observe'),
        route: '/observe',
        searchTerms: [t('nav.observe'), t('nav.gateway')],
      },
      {
        id: 'private',
        title: t('docs.scenario.private.title'),
        description: t('docs.scenario.private.desc'),
        icon: HardDrive,
        meta: t('nav.gateway'),
        route: '/gateway',
        searchTerms: [t('nav.gateway'), t('nav.settings')],
      },
      {
        id: 'extend',
        title: t('docs.scenario.extend.title'),
        description: t('docs.scenario.extend.desc'),
        icon: Zap,
        meta: t('nav.mcp'),
        route: '/mcp',
        searchTerms: [t('nav.mcp'), t('nav.plugins'), t('nav.skills')],
      },
    ],
    [t],
  )

  const guides = useMemo<ResourceCardData[]>(
    () => [
      {
        id: 'quickstart',
        title: t('docs.quickStart'),
        description: t('docs.quickStartDesc'),
        icon: BookOpen,
        meta: DOCS_SITE_URL,
        url: `${DOCS_SITE_URL}/quickstart`,
        searchTerms: ['install', 'setup', 'gateway'],
      },
      {
        id: 'cli',
        title: t('docs.cliRef'),
        description: t('docs.cliRefDesc'),
        icon: Terminal,
        meta: DOCS_SITE_URL,
        url: `${DOCS_SITE_URL}/cli`,
        searchTerms: ['cli', 'command', 'shell'],
      },
      {
        id: 'channels',
        title: t('docs.channelConfig'),
        description: t('docs.channelConfigDesc'),
        icon: MessageSquare,
        meta: DOCS_SITE_URL,
        url: `${DOCS_SITE_URL}/channels`,
        searchTerms: ['discord', 'slack', 'telegram', 'feishu'],
      },
      {
        id: 'models',
        title: t('docs.modelConfig'),
        description: t('docs.modelConfigDesc'),
        icon: Bot,
        meta: DOCS_SITE_URL,
        url: `${DOCS_SITE_URL}/models`,
        searchTerms: ['api key', 'provider', 'fallback'],
      },
      {
        id: 'skills',
        title: t('docs.skillDev'),
        description: t('docs.skillDevDesc'),
        icon: Zap,
        meta: DOCS_SITE_URL,
        url: `${DOCS_SITE_URL}/skills`,
        searchTerms: ['skills', 'publish', 'workflow'],
      },
      {
        id: 'security',
        title: t('docs.securityGuide'),
        description: t('docs.securityGuideDesc'),
        icon: Shield,
        meta: DOCS_SITE_URL,
        url: `${DOCS_SITE_URL}/security`,
        searchTerms: ['token', 'sandbox', 'permission'],
      },
    ],
    [t],
  )

  const troubleshooting = useMemo<ResourceCardData[]>(
    () => [
      {
        id: 'gateway',
        title: t('docs.troubleshooting.gateway.title'),
        description: t('docs.troubleshooting.gateway.desc'),
        icon: Radio,
        meta: t('nav.gateway'),
        route: '/gateway',
        searchTerms: ['port', 'auth', 'restart', 'bind'],
      },
      {
        id: 'channel',
        title: t('docs.troubleshooting.channel.title'),
        description: t('docs.troubleshooting.channel.desc'),
        icon: MessageSquare,
        meta: t('nav.channels'),
        route: '/channels',
        searchTerms: ['login', 'webhook', 'account', 'verify'],
      },
      {
        id: 'model',
        title: t('docs.troubleshooting.model.title'),
        description: t('docs.troubleshooting.model.desc'),
        icon: Bot,
        meta: t('nav.models'),
        route: '/models',
        searchTerms: ['api key', 'base url', 'fallback', 'provider'],
      },
      {
        id: 'runtime',
        title: t('docs.troubleshooting.runtime.title'),
        description: t('docs.troubleshooting.runtime.desc'),
        icon: Wrench,
        meta: t('nav.settings'),
        route: '/settings',
        searchTerms: ['profile', 'plugin', 'skill', 'mcp'],
      },
    ],
    [t],
  )

  const commands = useMemo<CommandCardData[]>(
    () => [
      {
        id: 'gateway-start',
        title: t('docs.command.gatewayStart.title'),
        description: t('docs.command.gatewayStart.desc'),
        command: 'openclaw gateway start',
        icon: Radio,
        meta: t('nav.gateway'),
        route: '/gateway',
        searchTerms: ['gateway', 'start', 'runtime'],
      },
      {
        id: 'docs-search',
        title: t('docs.command.docsSearch.title'),
        description: t('docs.command.docsSearch.desc'),
        command: 'openclaw docs gateway auth',
        icon: FileSearch,
        meta: t('docs.title'),
        url: DOCS_SITE_URL,
        searchTerms: ['docs', 'auth', 'search'],
      },
      {
        id: 'model-set',
        title: t('docs.command.modelSet.title'),
        description: t('docs.command.modelSet.desc'),
        command: 'openclaw models set deepseek-ai/DeepSeek-V3',
        icon: Bot,
        meta: t('nav.models'),
        route: '/models',
        searchTerms: ['models', 'default', 'provider'],
      },
      {
        id: 'plugins-list',
        title: t('docs.command.pluginsList.title'),
        description: t('docs.command.pluginsList.desc'),
        command: 'openclaw plugins list --json',
        icon: Wrench,
        meta: t('nav.plugins'),
        route: '/plugins',
        searchTerms: ['plugins', 'json', 'runtime'],
      },
    ],
    [t],
  )

  const localDataDocuments = useMemo<LocalDataDocument[]>(() => {
    const resourceDocs = [
      ...scenarios.map((item) => ({ item, sourceType: 'scenario' })),
      ...guides.map((item) => ({ item, sourceType: 'guide' })),
      ...troubleshooting.map((item) => ({ item, sourceType: 'troubleshooting' })),
    ].map(({ item, sourceType }) => ({
      id: `docs:${sourceType}:${item.id}`,
      module: 'docs',
      sourceType,
      sourcePath: item.route ?? item.url,
      title: item.title,
      content: `${item.title}\n${item.description}\n${item.meta}\n${item.searchTerms.join(' ')}`,
      tags: [item.meta, ...item.searchTerms],
      metadata: {
        route: item.route,
        url: item.url,
      },
    }))

    const commandDocs = commands.map((item) => ({
      id: `docs:command:${item.id}`,
      module: 'docs',
      sourceType: 'command',
      sourcePath: item.route ?? item.url,
      title: item.title,
      content: `${item.title}\n${item.description}\n${item.command}\n${item.meta}\n${item.searchTerms.join(' ')}`,
      tags: [item.meta, ...item.searchTerms],
      metadata: {
        command: item.command,
        route: item.route,
        url: item.url,
      },
    }))

    return [...resourceDocs, ...commandDocs]
  }, [commands, guides, scenarios, troubleshooting])

  const ensureLocalDataIndexed = useCallback((retryOnFailed: boolean): Promise<boolean> => {
    const generation = localDataIndexGenerationRef.current
    const currentState = localDataIndexStateRef.current
    if (localDataIndexPromiseRef.current) {
      return localDataIndexPromiseRef.current
    }
    if (currentState === 'ready' && localDataIndexedGenerationRef.current === generation) {
      return Promise.resolve(true)
    }
    if (currentState === 'failed' && localDataFailedGenerationRef.current === generation && !retryOnFailed) {
      return Promise.resolve(false)
    }

    localDataIndexStateRef.current = 'pending'
    localDataIndexedGenerationRef.current = null
    localDataFailedGenerationRef.current = null

    let promise: Promise<boolean>
    promise = upsertLocalDataDocumentsResult(localDataDocuments, {
      replace: { module: 'docs' },
    })
      .then((result) => {
        const isCurrent =
          localDataIndexPromiseRef.current === promise &&
          localDataIndexGenerationRef.current === generation
        if (!isCurrent) return false
        const nextState = result.success ? 'ready' : 'failed'
        localDataIndexStateRef.current = nextState
        localDataIndexedGenerationRef.current = result.success ? generation : null
        localDataFailedGenerationRef.current = result.success ? null : generation
        return result.success
      })
      .catch(() => {
        const isCurrent =
          localDataIndexPromiseRef.current === promise &&
          localDataIndexGenerationRef.current === generation
        if (!isCurrent) return false
        localDataIndexStateRef.current = 'failed'
        localDataIndexedGenerationRef.current = null
        localDataFailedGenerationRef.current = generation
        return false
      })
      .finally(() => {
        if (localDataIndexPromiseRef.current === promise) {
          localDataIndexPromiseRef.current = null
        }
      })

    localDataIndexPromiseRef.current = promise
    return promise
  }, [localDataDocuments])

  useEffect(() => {
    setLiveResults([])
    setLiveSearched(false)
  }, [query])

  useEffect(() => {
    localDataIndexGenerationRef.current += 1
    localDataIndexPromiseRef.current = null
    localDataIndexStateRef.current = 'idle'
    localDataIndexedGenerationRef.current = null
    localDataFailedGenerationRef.current = null
    void ensureLocalDataIndexed(false)
  }, [ensureLocalDataIndexed, localDataDocuments])

  useEffect(() => {
    const trimmed = query.trim()
    let cancelled = false
    void (async () => {
      if (!trimmed) {
        setIndexedResults([])
        setIndexedSearching(false)
        return
      }

      setIndexedSearching(true)
      const indexed = await ensureLocalDataIndexed(true)
      if (cancelled) return
      if (!indexed) {
        setIndexedResults([])
        setIndexedSearching(false)
        return
      }

      const result = await searchLocalDataResult({ query: trimmed, module: 'docs', limit: 8 })
      if (cancelled) return
      setIndexedResults(result.success && result.data ? result.data : [])
      setIndexedSearching(false)
    })()

    return () => {
      cancelled = true
    }
  }, [ensureLocalDataIndexed, query])

  const filteredScenarios = scenarios.filter((item) =>
    matchesQuery(query, [item.title, item.description, item.meta, ...item.searchTerms]),
  )
  const filteredGuides = guides.filter((item) =>
    matchesQuery(query, [item.title, item.description, item.meta, ...item.searchTerms]),
  )
  const filteredTroubleshooting = troubleshooting.filter((item) =>
    matchesQuery(query, [item.title, item.description, item.meta, ...item.searchTerms]),
  )
  const filteredCommands = commands.filter((item) =>
    matchesQuery(query, [item.title, item.description, item.command, item.meta, ...item.searchTerms]),
  )

  const hasQuery = query.trim().length > 0
  const hasIndexedResults = indexedResults.length > 0
  const localMatchCount =
    filteredScenarios.length +
    filteredGuides.length +
    filteredTroubleshooting.length +
    filteredCommands.length

  async function handleLiveSearch() {
    const trimmed = query.trim()
    if (!trimmed) return

    setLiveSearching(true)
    setFeedback(null)
    setLiveSearched(true)

    try {
      const raw = await execCommand('openclaw', ['docs', trimmed])
      setLiveResults(parseDocsOutput(raw, t('docs.liveFallbackTitle')))
    } catch {
      setLiveResults([])
      setFeedback({ tone: 'error', message: t('docs.searchFailed') })
    } finally {
      setLiveSearching(false)
    }
  }

  async function handleCopyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command)
      setFeedback({ tone: 'success', message: t('docs.commandCopied') })
    } catch {
      setFeedback({ tone: 'error', message: t('docs.commandCopyFailed') })
    }
  }

  return (
    <div className="page-shell page-shell-wide">
      {feedback ? (
        <ActionBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('docs.indexBadge')}</span>
            <span>{t('docs.contextBadge')}</span>
            <span>{t('docs.fallbackBadge')}</span>
          </div>
          <h1 className="page-title">{t('docs.title')}</h1>
          <p className="page-subtitle">{t('docs.subtitle')}</p>
        </div>
      </div>

      <section className="surface-card relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_44%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.45fr,0.9fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-[1.55rem] font-semibold tracking-tight text-foreground">
                {t('docs.heroTitle')}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('docs.heroDesc')}
              </p>
            </div>

            <div className="toolbar-card flex-col gap-3 md:flex-row">
              <input
                type="text"
                placeholder={t('docs.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleLiveSearch()
                  }
                }}
                className="control-input flex-1"
              />
              <button
                type="button"
                onClick={() => void handleLiveSearch()}
                disabled={liveSearching || !query.trim()}
                className="button-secondary whitespace-nowrap"
              >
                <ExternalLink className="h-4 w-4" />
                {liveSearching ? t('common.searching') : t('docs.searchLive')}
              </button>
            </div>

            <p className="text-sm text-muted-foreground">{t('docs.searchHint')}</p>
          </div>

          <div className="rounded-[1.5rem] border border-border/70 bg-background/85 p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('docs.searchModesTitle')}
                </p>
              </div>
              <div className="grid gap-3">
                <InfoRow title={t('docs.searchMode.local.title')} description={t('docs.searchMode.local.desc')} />
                <InfoRow title={t('docs.searchMode.context.title')} description={t('docs.searchMode.context.desc')} />
                <InfoRow title={t('docs.searchMode.live.title')} description={t('docs.searchMode.live.desc')} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {hasQuery ? (
        <section className="surface-card space-y-5">
          <div className="section-heading">
            <div>
              <h2 className="section-title">{t('docs.localResultsTitle')}</h2>
              <p className="section-subtitle">{t('docs.localResultsDesc', { count: localMatchCount })}</p>
            </div>
          </div>

          {hasIndexedResults || indexedSearching ? (
            <section className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t('docs.indexedResultsTitle')}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('docs.indexedResultsDesc', { count: indexedResults.length })}
                  </p>
                </div>
                <span className="inline-flex whitespace-nowrap rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-foreground">
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  {t('settings.localDataEngineFallback')}
                </span>
              </div>
              {indexedSearching && indexedResults.length === 0 ? (
                <div className="state-panel min-h-0 py-5 text-sm text-muted-foreground">
                  {t('common.searching')}
                </div>
              ) : (
                <div className="grid gap-3">
                  {indexedResults.map((result) => (
                    <IndexedResultCard key={result.id} result={result} />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {localMatchCount === 0 && !hasIndexedResults && !indexedSearching ? (
            <div className="state-panel min-h-0 py-8 text-muted-foreground">
              <p className="font-medium text-foreground">{t('docs.noLocalResultsTitle')}</p>
              <p className="mt-1 text-sm">{t('docs.noLocalResultsDesc')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredScenarios.length > 0 ? (
                <SectionGrid
                  title={t('docs.section.scenarios')}
                  description={t('docs.section.scenariosDesc')}
                  items={filteredScenarios}
                />
              ) : null}
              {filteredGuides.length > 0 ? (
                <SectionGrid
                  title={t('docs.section.guides')}
                  description={t('docs.section.guidesDesc')}
                  items={filteredGuides}
                />
              ) : null}
              {filteredCommands.length > 0 ? (
                <CommandGrid
                  title={t('docs.section.commands')}
                  description={t('docs.section.commandsDesc')}
                  items={filteredCommands}
                  onCopy={handleCopyCommand}
                  t={t}
                />
              ) : null}
              {filteredTroubleshooting.length > 0 ? (
                <SectionGrid
                  title={t('docs.section.troubleshooting')}
                  description={t('docs.section.troubleshootingDesc')}
                  items={filteredTroubleshooting}
                />
              ) : null}
            </div>
          )}
        </section>
      ) : (
        <>
          <SectionGrid
            title={t('docs.section.scenarios')}
            description={t('docs.section.scenariosDesc')}
            items={scenarios}
          />
          <SectionGrid
            title={t('docs.section.guides')}
            description={t('docs.section.guidesDesc')}
            items={guides}
          />
          <CommandGrid
            title={t('docs.section.commands')}
            description={t('docs.section.commandsDesc')}
            items={commands}
            onCopy={handleCopyCommand}
            t={t}
          />
          <SectionGrid
            title={t('docs.section.troubleshooting')}
            description={t('docs.section.troubleshootingDesc')}
            items={troubleshooting}
          />
        </>
      )}

      {(liveResults.length > 0 || (liveSearched && !liveSearching)) && (
        <section className="surface-card space-y-4">
          <div className="section-heading">
            <div>
              <h2 className="section-title">{t('docs.liveResultsTitle')}</h2>
              <p className="section-subtitle">{t('docs.liveSearchHelp')}</p>
            </div>
          </div>

          {liveResults.length > 0 ? (
            <div className="grid gap-3">
              {liveResults.map((result) => (
                <a
                  key={`${result.url}-${result.title}`}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="list-card block transition hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-primary">{result.title}</p>
                      <p className="mt-0.5 truncate text-xs font-mono text-muted-foreground">{result.url}</p>
                      {result.snippet ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {result.snippet}
                        </p>
                      ) : null}
                    </div>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="state-panel min-h-0 py-8 text-muted-foreground">
              {t('docs.liveSearchEmpty')}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function InfoRow({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function IndexedResultCard({ result }: { result: LocalDataSearchResult }) {
  const route = typeof result.metadata.route === 'string' ? result.metadata.route : undefined
  const url = typeof result.metadata.url === 'string' ? result.metadata.url : undefined
  const command = typeof result.metadata.command === 'string' ? result.metadata.command : undefined
  const body = (
    <div className="list-card block transition hover:border-primary/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-primary">{result.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{result.snippet}</p>
          {command ? (
            <code className="mt-2 block overflow-x-auto rounded-xl bg-muted px-3 py-2 text-xs text-foreground">
              {command}
            </code>
          ) : null}
        </div>
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  )

  if (route) {
    return <Link to={route}>{body}</Link>
  }
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    )
  }
  return body
}

function SectionGrid({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: ResourceCardData[]
}) {
  return (
    <section className="surface-card space-y-4">
      <div className="section-heading">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <ResourceCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function CommandGrid({
  title,
  description,
  items,
  onCopy,
  t,
}: {
  title: string
  description: string
  items: CommandCardData[]
  onCopy: (command: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <section className="surface-card space-y-4">
      <div className="section-heading">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/85">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {item.meta}
                  </p>
                  <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">
                    {item.title}
                  </h3>
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>

            <div className="mt-4 rounded-2xl border border-border/80 bg-slate-950 px-4 py-3 text-sm text-slate-50">
              <code className="block overflow-x-auto whitespace-nowrap font-mono">{item.command}</code>
            </div>

            <div className="mt-4 flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={() => onCopy(item.command)}
                className="button-secondary"
              >
                <Copy className="h-4 w-4" />
                {t('docs.copyCommand')}
              </button>
              <CardActionLink
                route={item.route}
                url={item.url}
                label={item.route ? t('docs.openPage') : t('docs.openGuide')}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ResourceCard({ item }: { item: ResourceCardData }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-5 transition hover:border-primary/40 hover:bg-muted/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/85">
            <item.icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {item.meta}
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">
              {item.title}
            </h3>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>

      <div className="mt-4">
        <CardActionLink
          route={item.route}
          url={item.url}
          label={item.route ? t('docs.openPage') : t('docs.openGuide')}
        />
      </div>
    </div>
  )
}

function CardActionLink({
  route,
  url,
  label,
}: {
  route?: string
  url?: string
  label: string
}) {
  if (route) {
    return (
      <Link to={route} className="button-secondary">
        {label}
      </Link>
    )
  }

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="button-secondary"
      >
        <ExternalLink className="h-4 w-4" />
        {label}
      </a>
    )
  }

  return null
}
