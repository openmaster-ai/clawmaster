import { homedir } from 'node:os'
import { join } from 'node:path'
import { Type } from '@sinclair/typebox'
import type {
  OpenClawPluginApi,
  OpenClawPluginCliContext,
} from 'openclaw/plugin-sdk/memory-core'
import type { OpenClawPluginServiceContext } from 'openclaw/plugin-sdk'
import {
  addManagedMemory,
  getManagedMemoryStatsPayload,
  deleteManagedMemory,
  getManagedMemoryStatusPayload,
  listManagedMemories,
  resetManagedMemory,
  searchManagedMemories,
  type ManagedMemoryEngine,
  type ManagedMemoryContext,
} from './runtime.js'
import {
  getManagedMemoryImportStatus,
  importOpenclawWorkspaceMemories,
  resolveOpenclawWorkspaceDir,
} from './workspaceImport.js'

type ManagedPluginConfig = {
  dataRoot: string
  engine: ManagedMemoryEngine
  userId?: string
  agentId?: string
  recallLimit: number
  recallScoreThreshold: number
  autoCapture: boolean
  autoRecall: boolean
  inferOnAdd: boolean
}

const DEFAULT_RECALL_LIMIT = 5
const DEFAULT_RECALL_SCORE_THRESHOLD = 0

export function defaultManagedEngineForTest(
  platform = process.platform,
  arch = process.arch,
): ManagedMemoryEngine {
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) {
    return 'powermem-seekdb'
  }
  return 'powermem-sqlite'
}

function defaultManagedEngine(): ManagedMemoryEngine {
  return defaultManagedEngineForTest()
}

function defaultManagedDataRoot(): string {
  return join(homedir(), '.clawmaster', 'data', 'default')
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown keys: ${unknown.join(', ')}`)
  }
}

function toRecallLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.min(100, Math.floor(value))
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    return parsed >= 1 ? Math.min(100, parsed) : DEFAULT_RECALL_LIMIT
  }
  return DEFAULT_RECALL_LIMIT
}

function toRecallScoreThreshold(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value))
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed))
    }
  }
  return DEFAULT_RECALL_SCORE_THRESHOLD
}

const managedPluginConfigSchema = {
  parse(value: unknown): ManagedPluginConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        dataRoot: process.env['CLAWMASTER_MANAGED_MEMORY_DATA_ROOT']?.trim() || defaultManagedDataRoot(),
        engine: defaultManagedEngine(),
        recallLimit: DEFAULT_RECALL_LIMIT,
        recallScoreThreshold: DEFAULT_RECALL_SCORE_THRESHOLD,
        autoCapture: true,
        autoRecall: true,
        inferOnAdd: false,
      }
    }

    const cfg = value as Record<string, unknown>
    assertAllowedKeys(
      cfg,
      ['dataRoot', 'engine', 'userId', 'agentId', 'recallLimit', 'recallScoreThreshold', 'autoCapture', 'autoRecall', 'inferOnAdd'],
      'memory-clawmaster-powermem config'
    )

    return {
      dataRoot:
        typeof cfg.dataRoot === 'string' && cfg.dataRoot.trim()
          ? cfg.dataRoot.trim()
          : process.env['CLAWMASTER_MANAGED_MEMORY_DATA_ROOT']?.trim() || defaultManagedDataRoot(),
      engine:
        cfg.engine === 'powermem-seekdb' || cfg.engine === 'powermem-sqlite'
          ? cfg.engine
          : defaultManagedEngine(),
      userId: typeof cfg.userId === 'string' && cfg.userId.trim() ? cfg.userId.trim() : undefined,
      agentId: typeof cfg.agentId === 'string' && cfg.agentId.trim() ? cfg.agentId.trim() : undefined,
      recallLimit: toRecallLimit(cfg.recallLimit),
      recallScoreThreshold: toRecallScoreThreshold(cfg.recallScoreThreshold),
      autoCapture: cfg.autoCapture !== false,
      autoRecall: cfg.autoRecall !== false,
      inferOnAdd: cfg.inferOnAdd === true,
    }
  },
}

function buildManagedContext(cfg: ManagedPluginConfig): ManagedMemoryContext {
  return {
    dataRootOverride: cfg.dataRoot,
    engineOverride: cfg.engine,
  }
}

function describeScopeValue(value: string | undefined): string {
  return value ? value : 'unscoped'
}

function withManagedScope<T extends object>(
  scope: {
    userId?: string
    agentId?: string
  },
  extra?: T,
): T & { userId?: string; agentId?: string } {
  return {
    ...(extra ?? {}),
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
  }
}

function lastUserMessageText(messages: unknown[] | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (!msg || typeof msg !== 'object') continue
    const role = (msg as Record<string, unknown>).role
    if (role !== 'user') continue
    const content = (msg as Record<string, unknown>).content
    if (typeof content === 'string' && content.trim().length >= 5) return content.trim()
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as Record<string, unknown>).type === 'text' &&
          typeof (block as Record<string, unknown>).text === 'string'
        ) {
          const text = String((block as Record<string, unknown>).text).trim()
          if (text.length >= 5) return text
        }
      }
    }
  }
  return ''
}

function buildManagedStatusEntries(
  cfg: ManagedPluginConfig,
  status: Awaited<ReturnType<typeof getManagedMemoryStatusPayload>>,
  managedContext: ManagedMemoryContext,
  agentId?: string,
) {
  return [
    {
      ...(agentId ? { agentId } : {}),
      status: {
        backend: status.engine,
        dirty: false,
        workspaceDir: resolveOpenclawWorkspaceDir(managedContext),
        dbPath: status.dbPath ?? status.storagePath,
        runtimeRoot: status.runtimeRoot,
      },
      scan: {
        totalFiles: status.provisioned ? 1 : 0,
      },
      managed: {
        dataRoot: cfg.dataRoot,
        engine: cfg.engine,
        storagePath: status.storagePath,
      },
    },
  ]
}

function normalizeSearchQuery(
  positionalQuery: unknown,
  opts: { query?: string },
): string {
  const fromOption = typeof opts.query === 'string' ? opts.query.trim() : ''
  if (fromOption) return fromOption
  return String(positionalQuery ?? '').trim()
}

type CommandLike = {
  name(): string
  command(name: string): CommandLike
  description(text: string): CommandLike
  option(flags: string, description: string, defaultValue?: string): CommandLike
  action(handler: (...args: unknown[]) => unknown): CommandLike
  commands?: CommandLike[]
}

function findChildCommand(command: CommandLike, name: string): CommandLike | undefined {
  return (command.commands ?? []).find((entry) => entry.name() === name)
}

export function ensureMemoryIndexCompatibilityCommandForTest(
  program: CommandLike,
  onIndex: () => Promise<void> | void,
): void {
  const existingTopLevelMemory = findChildCommand(program, 'memory')
  const memory =
    existingTopLevelMemory
    ?? program.command('memory').description('Managed memory compatibility commands')

  if (findChildCommand(memory, 'index')) {
    return
  }

  memory
    .command('index')
    .description('Ensure the managed memory runtime is ready')
    .option('--force', 'Compatibility flag')
    .option('--verbose', 'Compatibility flag')
    .action(async () => {
      await onIndex()
    })
}

function resolveCliScope(
  scope: {
    userId?: string
    agentId?: string
  },
  opts: {
    user?: string
    agent?: string
  },
): { userId?: string; agentId?: string } {
  return {
    userId: typeof opts.user === 'string' && opts.user.trim() ? opts.user.trim() : scope.userId,
    agentId: typeof opts.agent === 'string' && opts.agent.trim() ? opts.agent.trim() : scope.agentId,
  }
}

const MEMORY_RECALL_GUIDANCE =
  '## Long-term memory (PowerMem)\n' +
  'When answering about prior preferences, stable facts, or earlier decisions, use memory_recall first or consult any injected <relevant-memories>.\n'

const plugin = {
  id: 'memory-clawmaster-powermem',
  name: 'Memory (ClawMaster PowerMem)',
  description: 'ClawMaster-managed long-term memory powered by the PowerMem TypeScript SDK.',
  kind: 'memory' as const,
  configSchema: managedPluginConfigSchema,

  register(api: OpenClawPluginApi) {
    const cfg = managedPluginConfigSchema.parse(api.pluginConfig)
    const managedContext = buildManagedContext(cfg)
    const scope = {
      userId: cfg.userId,
      agentId: cfg.agentId,
    }

    api.logger.info(
      `memory-clawmaster-powermem: plugin registered (dataRoot: ${cfg.dataRoot}, engine: ${cfg.engine}, user: ${describeScopeValue(scope.userId)}, agent: ${describeScopeValue(scope.agentId)})`,
    )

    api.registerTool(
      {
        name: 'memory_recall',
        label: 'Memory Recall',
        description: 'Search ClawMaster-managed PowerMem long-term memory.',
        parameters: Type.Object({
          query: Type.String({ description: 'Search query' }),
          limit: Type.Optional(Type.Number({ description: 'Maximum results' })),
          scoreThreshold: Type.Optional(Type.Number({ description: 'Minimum score from 0 to 1' })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const limit =
            typeof params.limit === 'number'
              ? Math.max(1, Math.min(100, Math.floor(params.limit)))
              : cfg.recallLimit
          const scoreThreshold =
            typeof params.scoreThreshold === 'number'
              ? Math.max(0, Math.min(1, params.scoreThreshold))
              : cfg.recallScoreThreshold
          const query = String(params.query ?? '')

          try {
            const results = (await searchManagedMemories(
              query,
              withManagedScope(scope, {
                limit: Math.min(100, Math.max(limit * 2, limit + 10)),
              }),
              managedContext,
            ))
              .filter((item) => (item.score ?? 0) >= scoreThreshold)
              .slice(0, limit)

            if (results.length === 0) {
              return {
                content: [{ type: 'text', text: 'No relevant memories found.' }],
                details: { count: 0 },
              }
            }

            const text = results
              .map((item, index) => `${index + 1}. ${item.content} (${((item.score ?? 0) * 100).toFixed(0)}%)`)
              .join('\n')

            return {
              content: [{ type: 'text', text: `Found ${results.length} memories:\n\n${text}` }],
              details: {
                count: results.length,
                memories: results.map((item) => ({
                  id: item.memoryId,
                  text: item.content,
                  score: item.score,
                })),
              },
            }
          } catch (error) {
            api.logger.warn(`memory-clawmaster-powermem: recall failed: ${String(error)}`)
            return {
              content: [{ type: 'text', text: `Memory search failed: ${error instanceof Error ? error.message : String(error)}` }],
              details: { error: String(error) },
            }
          }
        },
      },
      { name: 'memory_recall' },
    )

    api.registerTool(
      {
        name: 'memory_store',
        label: 'Memory Store',
        description: 'Store a stable fact, preference, or reusable note in long-term memory.',
        parameters: Type.Object({
          text: Type.String({ description: 'Information to remember' }),
          importance: Type.Optional(Type.Number({ description: 'Importance between 0 and 1' })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const text = String(params.text ?? '').trim()
          const importance = typeof params.importance === 'number' ? params.importance : 0.7

          try {
            const created = await addManagedMemory(
              {
                content: text,
                ...withManagedScope(scope),
                metadata: { importance },
              },
              managedContext,
            )

            return {
              content: [{ type: 'text', text: `Stored: ${created.content.slice(0, 80)}${created.content.length > 80 ? '...' : ''}` }],
              details: {
                action: 'created',
                id: created.memoryId,
              },
            }
          } catch (error) {
            api.logger.warn(`memory-clawmaster-powermem: store failed: ${String(error)}`)
            return {
              content: [{ type: 'text', text: `Failed to store memory: ${error instanceof Error ? error.message : String(error)}` }],
              details: { error: String(error) },
            }
          }
        },
      },
      { name: 'memory_store' },
    )

    api.registerTool(
      {
        name: 'memory_forget',
        label: 'Memory Forget',
        description: 'Delete one or more managed long-term memories.',
        parameters: Type.Object({
          query: Type.Optional(Type.String({ description: 'Search query to find a memory to remove' })),
          memoryId: Type.Optional(Type.String({ description: 'Explicit memory ID' })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const query = typeof params.query === 'string' ? params.query.trim() : ''
          const memoryId = typeof params.memoryId === 'string' ? params.memoryId.trim() : ''

          try {
            if (memoryId) {
              await deleteManagedMemory(memoryId, managedContext)
              return {
                content: [{ type: 'text', text: `Memory ${memoryId} forgotten.` }],
                details: { action: 'deleted', id: memoryId },
              }
            }

            if (query) {
              const candidates = await searchManagedMemories(
                query,
                withManagedScope(scope, { limit: 5 }),
                managedContext,
              )
              if (candidates.length === 0) {
                return {
                  content: [{ type: 'text', text: 'No matching memories found.' }],
                  details: { found: 0 },
                }
              }
              if (candidates.length === 1 && (candidates[0]?.score ?? 0) > 0.9) {
                await deleteManagedMemory(candidates[0]!.memoryId, managedContext)
                return {
                  content: [{ type: 'text', text: `Forgotten: "${candidates[0]!.content.slice(0, 60)}..."` }],
                  details: { action: 'deleted', id: candidates[0]!.memoryId },
                }
              }
              const list = candidates
                .map((item) => `- [${item.memoryId.slice(0, 8)}] ${item.content.slice(0, 60)}...`)
                .join('\n')
              return {
                content: [{ type: 'text', text: `Found ${candidates.length} candidates. Specify memoryId:\n${list}` }],
                details: {
                  action: 'candidates',
                  candidates: candidates.map((item) => ({
                    id: item.memoryId,
                    text: item.content,
                    score: item.score,
                  })),
                },
              }
            }

            return {
              content: [{ type: 'text', text: 'Provide query or memoryId.' }],
              details: { error: 'missing_param' },
            }
          } catch (error) {
            api.logger.warn(`memory-clawmaster-powermem: forget failed: ${String(error)}`)
            return {
              content: [{ type: 'text', text: `Failed to forget: ${error instanceof Error ? error.message : String(error)}` }],
              details: { error: String(error) },
            }
          }
        },
      },
      { name: 'memory_forget' },
    )

    api.registerCli(
      ({ program }: OpenClawPluginCliContext) => {
        const ltm = program.command('ltm').description('ClawMaster-managed PowerMem memory commands')

        ltm
          .command('status')
          .description('Show managed PowerMem status')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const status = await getManagedMemoryStatusPayload(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(status, null, 2))
                return
              }
              console.log(`PowerMem: ${status.provisioned ? 'healthy' : 'ready'} (${status.dbPath ?? status.storagePath})`)
            } catch (error) {
              console.error('Managed PowerMem status failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('stats')
          .description('Show managed PowerMem statistics')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const stats = await getManagedMemoryStatsPayload(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(stats, null, 2))
                return
              }
              console.log(`PowerMem stats: ${stats.totalMemories} memories, ${stats.userCount} users`)
            } catch (error) {
              console.error('Managed PowerMem stats failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('search')
          .description('Search managed memories')
          .argument('[query]', 'Search query')
          .option('--query <query>', 'Search query')
          .option('--limit <n>', 'Max results', '5')
          .option('--user <userId>', 'User filter')
          .option('--agent <agentId>', 'Agent filter')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[1] ?? {}) as {
              limit?: string
              query?: string
              user?: string
              agent?: string
              json?: boolean
            }
            const query = normalizeSearchQuery(args[0], opts)
            const limit = Number.parseInt(opts.limit ?? '5', 10)
            const resolvedScope = resolveCliScope(scope, opts)
            const results = await searchManagedMemories(
              query,
              withManagedScope(resolvedScope, { limit }),
              managedContext,
            )
            if (opts.json) {
              console.log(JSON.stringify(results, null, 2))
              return
            }
            console.log(JSON.stringify(results, null, 2))
          })

        ltm
          .command('list')
          .description('List managed memories')
          .option('--limit <n>', 'Max results', '20')
          .option('--offset <n>', 'Offset', '0')
          .option('--user <userId>', 'User filter')
          .option('--agent <agentId>', 'Agent filter')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as {
              limit?: string
              offset?: string
              user?: string
              agent?: string
              json?: boolean
            }
            try {
              const resolvedScope = resolveCliScope(scope, opts)
              const result = await listManagedMemories(
                {
                  limit: Number.parseInt(opts.limit ?? '20', 10),
                  offset: Number.parseInt(opts.offset ?? '0', 10),
                  userId: resolvedScope.userId,
                  agentId: resolvedScope.agentId,
                },
                managedContext,
              )
              if (opts.json) {
                console.log(JSON.stringify(result, null, 2))
                return
              }
              console.log(JSON.stringify(result.memories, null, 2))
            } catch (error) {
              console.error('Managed PowerMem list failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('health')
          .description('Check managed PowerMem status')
          .action(async () => {
            try {
              const status = await getManagedMemoryStatusPayload(managedContext)
              console.log(`PowerMem: ${status.provisioned ? 'healthy' : 'ready'} (${status.storagePath})`)
            } catch (error) {
              console.error('Managed PowerMem health check failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('add')
          .description('Manually add a managed memory')
          .argument('<text>', 'Content to store')
          .option('--user <userId>', 'User id override')
          .option('--agent <agentId>', 'Agent id override')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const text = String(args[0] ?? '').trim()
            const opts = (args[1] ?? {}) as { user?: string; agent?: string; json?: boolean }
            try {
              const resolvedScope = resolveCliScope(scope, opts)
              const created = await addManagedMemory(
                {
                  content: text,
                  ...withManagedScope(resolvedScope),
                },
                managedContext,
              )
              if (opts.json) {
                console.log(JSON.stringify(created, null, 2))
                return
              }
              console.log(`Stored memory ${created.memoryId}`)
            } catch (error) {
              console.error('Managed PowerMem add failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('delete')
          .description('Delete a managed memory')
          .argument('<memoryId>', 'Managed memory id')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const memoryId = String(args[0] ?? '').trim()
            const opts = (args[1] ?? {}) as { json?: boolean }
            try {
              const deleted = await deleteManagedMemory(memoryId, managedContext)
              if (opts.json) {
                console.log(JSON.stringify({ deleted }, null, 2))
                return
              }
              console.log(deleted ? `Deleted memory ${memoryId}` : `Memory ${memoryId} was already removed`)
            } catch (error) {
              console.error('Managed PowerMem delete failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('reset')
          .description('Reset managed PowerMem storage')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const stats = await resetManagedMemory(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(stats, null, 2))
                return
              }
              console.log(`Managed PowerMem reset complete (${stats.totalMemories} memories remaining)`)
            } catch (error) {
              console.error('Managed PowerMem reset failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('import-status')
          .description('Show OpenClaw workspace import status')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const status = await getManagedMemoryImportStatus(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(status, null, 2))
                return
              }
              console.log(
                `Import status: ${status.importedMemoryCount}/${status.availableSourceCount} sources tracked`,
              )
            } catch (error) {
              console.error('Managed PowerMem import status failed:', error)
              process.exitCode = 1
            }
          })

        ltm
          .command('import')
          .description('Import OpenClaw workspace memories into managed PowerMem')
          .option('--json', 'Output JSON')
          .action(async (...args: unknown[]) => {
            const opts = (args[0] ?? {}) as { json?: boolean }
            try {
              const imported = await importOpenclawWorkspaceMemories(managedContext)
              if (opts.json) {
                console.log(JSON.stringify(imported, null, 2))
                return
              }
              console.log(
                `Imported workspace memories: ${imported.lastRun?.imported ?? 0} new, ${imported.lastRun?.updated ?? 0} updated, ${imported.lastRun?.skipped ?? 0} unchanged, ${imported.importedMemoryCount} tracked.`,
              )
            } catch (error) {
              console.error('Managed PowerMem import failed:', error)
              process.exitCode = 1
            }
          })

        const existingTopLevelMemory = findChildCommand(program as CommandLike, 'memory')

        if (!existingTopLevelMemory) {
          const memory = program.command('memory').description('Managed memory compatibility commands')

          memory
            .command('status')
            .description('Show managed memory status')
            .option('--json', 'Output JSON')
            .action(async (...args: unknown[]) => {
              const opts = (args[0] ?? {}) as { json?: boolean }
              try {
                const status = await getManagedMemoryStatusPayload(managedContext)
                const payload = buildManagedStatusEntries(cfg, status, managedContext, scope.agentId)
                if (opts.json) {
                  console.log(JSON.stringify(payload, null, 2))
                  return
                }
                console.log(JSON.stringify(payload, null, 2))
              } catch (error) {
                console.error('Managed memory status failed:', error)
                process.exitCode = 1
              }
            })

          memory
            .command('search')
            .description('Search managed memories')
            .argument('[query]', 'Search query')
            .option('--query <query>', 'Search query')
            .option('--max-results <n>', 'Max results', '20')
            .option('--agent <agentId>', 'Agent filter')
            .option('--json', 'Output JSON')
            .action(async (...args: unknown[]) => {
              const opts = (args[1] ?? {}) as {
                query?: string
                maxResults?: string
                agent?: string
                json?: boolean
              }
              const query = normalizeSearchQuery(args[0], opts)
              const limit = Number.parseInt(opts.maxResults ?? '20', 10)
              try {
                const results = await searchManagedMemories(
                  query,
                  withManagedScope(
                    {
                      userId: scope.userId,
                      agentId: opts.agent?.trim() || scope.agentId,
                    },
                    { limit },
                  ),
                  managedContext,
                )
                if (opts.json) {
                  console.log(JSON.stringify(results, null, 2))
                  return
                }
                console.log(JSON.stringify(results, null, 2))
              } catch (error) {
                console.error('Managed memory search failed:', error)
                process.exitCode = 1
              }
            })
        }

        ensureMemoryIndexCompatibilityCommandForTest(program as CommandLike, async () => {
          try {
            const imported = await importOpenclawWorkspaceMemories(managedContext)
            const status = await getManagedMemoryStatusPayload(managedContext)
            console.log(
              `Managed PowerMem index ready (${status.engine}, ${status.dbPath ?? status.storagePath})`
            )
            console.log(
              `Imported workspace memories: ${imported.lastRun?.imported ?? 0} new, ${imported.lastRun?.updated ?? 0} updated, ${imported.lastRun?.skipped ?? 0} unchanged, ${imported.importedMemoryCount} tracked.`,
            )
          } catch (error) {
            console.error('Managed memory index check failed:', error)
            process.exitCode = 1
          }
        })
      },
      { commands: ['ltm', 'memory'] },
    )

    if (cfg.autoRecall) {
      api.on('before_agent_start', async (event: unknown) => {
        const e = event as { prompt?: string; messages?: unknown[] }
        const query =
          (typeof e.prompt === 'string' && e.prompt.trim().length >= 5
            ? e.prompt.trim()
            : lastUserMessageText(e.messages)) || ''
        if (query.length < 5) {
          return { prependSystemContext: MEMORY_RECALL_GUIDANCE }
        }

        try {
          const results = (await searchManagedMemories(
            query,
            withManagedScope(scope, {
              limit: Math.min(100, Math.max(cfg.recallLimit * 2, cfg.recallLimit + 10)),
            }),
            managedContext,
          ))
            .filter((item) => (item.score ?? 0) >= cfg.recallScoreThreshold)
            .slice(0, cfg.recallLimit)

          const memoryContext = results.length > 0 ? results.map((item) => `- ${item.content}`).join('\n') : ''
          return {
            prependSystemContext: MEMORY_RECALL_GUIDANCE,
            ...(memoryContext
              ? {
                  prependContext: `<relevant-memories>\nThe following memories may be relevant to this conversation:\n${memoryContext}\n</relevant-memories>`,
                }
              : {}),
          }
        } catch (error) {
          api.logger.warn(`memory-clawmaster-powermem: recall failed: ${String(error)}`)
          return { prependSystemContext: MEMORY_RECALL_GUIDANCE }
        }
      })
    }

    if (cfg.autoCapture) {
      api.on('agent_end', async (event: unknown) => {
        const e = event as { messages?: unknown[]; success?: boolean }
        if (!e.success || !Array.isArray(e.messages) || e.messages.length === 0) {
          return
        }

        try {
          const texts: string[] = []
          for (const msg of e.messages) {
            if (!msg || typeof msg !== 'object') continue
            const msgObj = msg as Record<string, unknown>
            const role = msgObj.role
            if (role !== 'user' && role !== 'assistant') continue
            const content = msgObj.content
            if (typeof content === 'string') {
              texts.push(content)
              continue
            }
            if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === 'object' &&
                  (block as Record<string, unknown>).type === 'text' &&
                  typeof (block as Record<string, unknown>).text === 'string'
                ) {
                  texts.push((block as Record<string, unknown>).text as string)
                }
              }
            }
          }

          const sanitized = texts
            .map((item) => item.trim())
            .filter((item) => item.length >= 10)
            .filter((item) => !item.includes('<relevant-memories>') && !(item.startsWith('<') && item.includes('</')))
          if (sanitized.length === 0) return

          const combined = sanitized.join('\n\n')
          const chunks: string[] = []
          for (let index = 0; index < combined.length && chunks.length < 3; index += 6000) {
            chunks.push(combined.slice(index, index + 6000))
          }

          let stored = 0
          for (const chunk of chunks) {
            await addManagedMemory(
              {
                content: chunk,
                ...withManagedScope(scope),
                metadata: { source: 'openclaw-gateway-auto-capture' },
              },
              managedContext,
            )
            stored += 1
          }
          if (stored > 0) {
            api.logger.info(`memory-clawmaster-powermem: auto-captured ${stored} memory chunk(s)`)
          }
        } catch (error) {
          api.logger.warn(`memory-clawmaster-powermem: capture failed: ${String(error)}`)
        }
      })
    }

    api.registerService({
      id: 'memory-clawmaster-powermem',
      start: async (_ctx: OpenClawPluginServiceContext) => {
        try {
          const status = await getManagedMemoryStatusPayload(managedContext)
          api.logger.info(
            `memory-clawmaster-powermem: initialized (engine: ${status.engine}, runtimeRoot: ${status.runtimeRoot}, provisioned: ${status.provisioned})`,
          )
        } catch (error) {
          api.logger.warn(`memory-clawmaster-powermem: initialization check failed: ${String(error)}`)
        }
      },
    })
  },
}

export default plugin
