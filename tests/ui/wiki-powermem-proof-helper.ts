#!/usr/bin/env -S node --import tsx

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  getManagedMemoryBridgeStatusPayload,
  syncManagedMemoryBridge,
} from '../../packages/backend/src/services/managedMemoryBridge.js'
import {
  getWikiPage,
  listWikiPages,
  type WikiPageSummary,
  type WikiServiceContext,
} from '../../packages/backend/src/services/wikiService.js'
import { buildGatewayWebUiUrl } from '../../packages/web/src/shared/gatewayUrl.js'

type JsonObject = Record<string, unknown>

interface ProofManifest {
  rootDir: string
  homeDir: string
  configPath: string
  manifestPath: string
  fixturesDir: string
  fixtureFiles: string[]
  webUiUrl: string
  commands: {
    devWeb: string
    markStale: string
    disableAutoRecall: string
    enableAutoRecall: string
  }
  prompts: {
    clawmasterQuery: string
    webUiPositive: string
    webUiFollowUp: string
    webUiOrdinary: string
  }
  warnings: string[]
}

interface CliOptions {
  root?: string
  home?: string
  sourceConfig?: string
  gatewayPort?: number
  gatewayToken?: string
  controlUiBasePath?: string
  skipBridgeSync?: boolean
  title?: string
  pageId?: string
  enabled?: boolean
}

const DEFAULT_GATEWAY_PORT = 18789
const DEFAULT_GATEWAY_TOKEN = 'wiki-proof-token'
const DEFAULT_CONTROL_UI_BASE_PATH = '/openclaw'
const DEFAULT_STALE_TIMESTAMP = '2000-01-01T00:00:00.000Z'
const MANIFEST_FILE = 'wiki-powermem-proof.json'
const AUTO_RECALL_PLUGIN_ID = 'memory-clawmaster-powermem'
const POSITIVE_QUERY = 'what do we know about AI agents?'
const FOLLOW_UP_QUERY = 'Based on the saved synthesis, summarize the shared conclusion in two bullets and mention the wiki freshness.'
const ORDINARY_QUERY = 'what is 2 plus 2?'

const REAL_HOME = os.homedir()

function usage(): string {
  return [
    'Wiki + PowerMem proof helper',
    '',
    'Usage:',
    '  node --import tsx tests/ui/wiki-powermem-proof-helper.ts init [--root DIR] [--source-config FILE] [--gateway-port N] [--gateway-token TOKEN] [--skip-bridge-sync]',
    '  node --import tsx tests/ui/wiki-powermem-proof-helper.ts mark-stale --home DIR [--title "Stale Runtime Notes" | --page-id sources-stale-runtime-notes]',
    '  node --import tsx tests/ui/wiki-powermem-proof-helper.ts set-autorecall --home DIR --enabled true|false',
    '',
    'Notes:',
    '  - `init` creates an isolated HOME, copies or scaffolds openclaw.json, writes deterministic wiki fixtures, and optionally syncs the managed PowerMem bridge.',
    '  - `mark-stale` should be run after ingesting `06-stale-runtime-notes.md` through the Wiki UI.',
    '  - `set-autorecall` updates plugins.entries.memory-clawmaster-powermem.config.autoRecall in the isolated profile. Restart the gateway after toggling it.',
  ].join('\n')
}

function parseBoolean(raw: string | undefined, flagName: string): boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`${flagName} expects true or false`)
}

function parseNumber(raw: string | undefined, flagName: string): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flagName} expects a positive integer`)
  }
  return parsed
}

function parseArgs(argv: string[]): { command: string; options: CliOptions } {
  const [command = 'help', ...rest] = argv
  const options: CliOptions = {}
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index]
    const next = rest[index + 1]
    switch (flag) {
      case '--root':
        options.root = next
        index += 1
        break
      case '--home':
        options.home = next
        index += 1
        break
      case '--source-config':
        options.sourceConfig = next
        index += 1
        break
      case '--gateway-port':
        options.gatewayPort = parseNumber(next, '--gateway-port')
        index += 1
        break
      case '--gateway-token':
        options.gatewayToken = next
        index += 1
        break
      case '--control-ui-base-path':
        options.controlUiBasePath = next
        index += 1
        break
      case '--skip-bridge-sync':
        options.skipBridgeSync = true
        break
      case '--title':
        options.title = next
        index += 1
        break
      case '--page-id':
        options.pageId = next
        index += 1
        break
      case '--enabled':
        options.enabled = parseBoolean(next, '--enabled')
        index += 1
        break
      default:
        throw new Error(`Unknown option: ${flag}`)
    }
  }
  return { command, options }
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs.stat(targetPath).then(() => true).catch(() => false)
}

async function readJsonFile(targetPath: string): Promise<JsonObject> {
  const raw = await fs.readFile(targetPath, 'utf8')
  return asRecord(JSON.parse(raw))
}

async function writeJsonFile(targetPath: string, value: JsonObject): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeTextFile(targetPath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, value, 'utf8')
}

function normalizeBasePath(input?: string): string {
  const trimmed = input?.trim() || DEFAULT_CONTROL_UI_BASE_PATH
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

function normalizeFixturePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function buildFixtureFiles(fixturesDir: string): Array<{ path: string; title: string; body: string }> {
  return [
    {
      path: path.join(fixturesDir, '01-gateway-runtime.md'),
      title: 'Gateway Runtime',
      body: 'The gateway runtime keeps provider auth and model routing centralized.',
    },
    {
      path: path.join(fixturesDir, '02-agent-patterns.md'),
      title: 'Agent Patterns',
      body: 'AI agents use tools, memory, and feedback loops to complete open-ended tasks. Workflows are better when paths are predefined.',
    },
    {
      path: path.join(fixturesDir, '03-agent-runtime.md'),
      title: 'Agent Runtime',
      body: 'Reliable AI agents need clear tool contracts, environmental feedback, and checkpoints for human review.',
    },
    {
      path: path.join(fixturesDir, '04-runtime-claim-a.md'),
      title: 'Runtime Claim A',
      body: '[[Runtime Claim B]] says the runtime is local-only.',
    },
    {
      path: path.join(fixturesDir, '05-runtime-claim-b.md'),
      title: 'Runtime Claim B',
      body: 'Runtime Claim B says the runtime is remote-first.',
    },
    {
      path: path.join(fixturesDir, '06-stale-runtime-notes.md'),
      title: 'Stale Runtime Notes',
      body: 'The runtime has no centralized gateway, avoids memory, and should not rely on tool feedback. Verification is still pending.',
    },
  ]
}

function buildScaffoldConfig(): JsonObject {
  return {
    gateway: {
      port: DEFAULT_GATEWAY_PORT,
      bind: 'loopback',
      auth: {
        mode: 'token',
        token: DEFAULT_GATEWAY_TOKEN,
      },
      controlUi: {
        basePath: DEFAULT_CONTROL_UI_BASE_PATH,
      },
    },
    agents: {
      defaults: {},
    },
    models: {
      providers: {},
    },
  }
}

async function resolveSourceConfigPath(sourceConfig?: string): Promise<string | null> {
  if (sourceConfig?.trim()) {
    const explicit = path.resolve(sourceConfig.trim())
    return await pathExists(explicit) ? explicit : null
  }

  const defaultPath = path.join(REAL_HOME, '.openclaw', 'openclaw.json')
  return await pathExists(defaultPath) ? defaultPath : null
}

function ensureNestedRecord(root: JsonObject, key: string): JsonObject {
  const next = asRecord(root[key])
  root[key] = next
  return next
}

function overlayProofConfig(config: JsonObject, options: CliOptions): JsonObject {
  const next = structuredClone(config)
  const gateway = ensureNestedRecord(next, 'gateway')
  const existingPort = Number(gateway.port)
  gateway.port = options.gatewayPort ?? (Number.isFinite(existingPort) && existingPort > 0 ? existingPort : DEFAULT_GATEWAY_PORT)
  gateway.bind = 'loopback'
  const auth = ensureNestedRecord(gateway, 'auth')
  auth.mode = 'token'
  auth.token = options.gatewayToken?.trim() || String(auth.token || DEFAULT_GATEWAY_TOKEN)
  const controlUi = ensureNestedRecord(gateway, 'controlUi')
  controlUi.basePath = normalizeBasePath(options.controlUiBasePath || String(controlUi.basePath || DEFAULT_CONTROL_UI_BASE_PATH))
  return next
}

function buildHomeEnvCommand(homeDir: string): string {
  const noProxy = '127.0.0.1,localhost,::1'
  return `env HOME="${homeDir}" NO_PROXY="${noProxy}" no_proxy="${noProxy}" npm run dev:web`
}

function buildMarkStaleCommand(homeDir: string): string {
  return `node --import tsx tests/ui/wiki-powermem-proof-helper.ts mark-stale --home "${homeDir}" --title "Stale Runtime Notes"`
}

function buildSetAutoRecallCommand(homeDir: string, enabled: boolean): string {
  return `node --import tsx tests/ui/wiki-powermem-proof-helper.ts set-autorecall --home "${homeDir}" --enabled ${enabled ? 'true' : 'false'}`
}

function buildManifest(rootDir: string, homeDir: string, config: JsonObject, fixtureFiles: string[], warnings: string[]): ProofManifest {
  const configPath = path.join(homeDir, '.openclaw', 'openclaw.json')
  const manifestPath = path.join(rootDir, MANIFEST_FILE)
  return {
    rootDir,
    homeDir,
    configPath,
    manifestPath,
    fixturesDir: path.join(rootDir, 'fixtures'),
    fixtureFiles: fixtureFiles.map(normalizeFixturePath),
    webUiUrl: buildGatewayWebUiUrl(config as any),
    commands: {
      devWeb: buildHomeEnvCommand(homeDir),
      markStale: buildMarkStaleCommand(homeDir),
      disableAutoRecall: buildSetAutoRecallCommand(homeDir, false),
      enableAutoRecall: buildSetAutoRecallCommand(homeDir, true),
    },
    prompts: {
      clawmasterQuery: POSITIVE_QUERY,
      webUiPositive: POSITIVE_QUERY,
      webUiFollowUp: FOLLOW_UP_QUERY,
      webUiOrdinary: ORDINARY_QUERY,
    },
    warnings,
  }
}

function buildWikiContext(homeDir: string): WikiServiceContext {
  return {
    homeDir,
    profileSelection: { kind: 'default' },
    managedMemoryContext: {
      homeDir,
      profileSelection: { kind: 'default' },
    },
  }
}

async function initProfile(options: CliOptions): Promise<void> {
  const rootDir = options.root
    ? path.resolve(options.root)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'clawmaster-wiki-proof-'))
  const homeDir = path.join(rootDir, 'home')
  const fixturesDir = path.join(rootDir, 'fixtures')
  const configPath = path.join(homeDir, '.openclaw', 'openclaw.json')
  const warnings: string[] = []

  const sourceConfigPath = await resolveSourceConfigPath(options.sourceConfig)
  const baseConfig = sourceConfigPath ? await readJsonFile(sourceConfigPath) : buildScaffoldConfig()
  if (!sourceConfigPath) {
    warnings.push('No source config was found. The helper created a scaffold only; add a real default text model and provider credentials before running suite 24.')
  }

  const proofConfig = overlayProofConfig(baseConfig, options)
  const defaults = asRecord(asRecord(proofConfig.agents).defaults)
  const model = asRecord(defaults.model)
  if (!String(model.primary || '').trim()) {
    warnings.push('agents.defaults.model.primary is missing. OpenClaw WebUI proof requires a real default text model.')
  }
  const providers = asRecord(asRecord(proofConfig.models).providers)
  if (Object.keys(providers).length === 0) {
    warnings.push('models.providers is empty. Copy a working openclaw.json or update the isolated config before running the proof.')
  }

  await writeJsonFile(configPath, proofConfig)
  await fs.mkdir(fixturesDir, { recursive: true })
  const fixtures = buildFixtureFiles(fixturesDir)
  for (const fixture of fixtures) {
    await writeTextFile(
      fixture.path,
      `# ${fixture.title}\n\n${fixture.body}\n`,
    )
  }

  process.env.HOME = homeDir

  let bridgeState = 'skipped'
  if (!options.skipBridgeSync) {
    try {
      const status = await syncManagedMemoryBridge({
        homeDir,
        profileSelection: { kind: 'default' },
      })
      bridgeState = status.state
      if (status.state !== 'ready') {
        warnings.push(`Managed PowerMem bridge sync completed but reported state "${status.state}". Review /memory before collecting proof.`)
      }
    } catch (error) {
      warnings.push(`Managed PowerMem bridge sync failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const manifest = buildManifest(
    rootDir,
    homeDir,
    proofConfig,
    fixtures.map((fixture) => fixture.path),
    [
      ...warnings,
      `Bridge sync result: ${bridgeState}.`,
      sourceConfigPath ? `Source config: ${sourceConfigPath}` : 'Source config: scaffolded.',
    ],
  )
  await writeJsonFile(manifest.manifestPath, manifest as unknown as JsonObject)
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
}

async function markStale(options: CliOptions): Promise<void> {
  const homeDir = options.home?.trim()
  if (!homeDir) throw new Error('--home is required')
  process.env.HOME = path.resolve(homeDir)
  const wikiContext = buildWikiContext(process.env.HOME)
  const pages = await listWikiPages(wikiContext)
  const page = resolveTargetPage(pages, options)
  if (!page) {
    throw new Error(`Could not find a wiki page matching ${options.pageId ? `page id "${options.pageId}"` : `title "${options.title || 'Stale Runtime Notes'}"`}`)
  }
  const detail = await getWikiPage(page.id, wikiContext)
  const updated = upsertFrontmatterLine(
    await fs.readFile(detail.path, 'utf8'),
    'updatedAt',
    DEFAULT_STALE_TIMESTAMP,
  )
  await fs.writeFile(detail.path, updated, 'utf8')
  process.stdout.write(`${JSON.stringify({
    pageId: page.id,
    title: detail.title,
    path: detail.path,
    updatedAt: DEFAULT_STALE_TIMESTAMP,
  }, null, 2)}\n`)
}

function resolveTargetPage(pages: WikiPageSummary[], options: CliOptions): WikiPageSummary | undefined {
  if (options.pageId?.trim()) {
    return pages.find((page) => page.id === options.pageId!.trim())
  }
  const title = options.title?.trim() || 'Stale Runtime Notes'
  return pages.find((page) => page.title === title)
}

function upsertFrontmatterLine(markdown: string, key: string, value: string): string {
  const lines = markdown.split('\n')
  const target = `${key}: `
  const targetValue = `${key}: "${value}"`
  let inFrontmatter = false
  let sawFrontmatter = false
  let inserted = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (index === 0 && line.trim() === '---') {
      inFrontmatter = true
      sawFrontmatter = true
      continue
    }
    if (inFrontmatter && line.trim() === '---') {
      if (!inserted) {
        lines.splice(index, 0, targetValue)
        inserted = true
      }
      break
    }
    if (inFrontmatter && line.startsWith(target)) {
      lines[index] = targetValue
      inserted = true
      break
    }
  }

  if (!sawFrontmatter) {
    return `---\n${targetValue}\n---\n${markdown.replace(/^\n+/, '')}`
  }

  return lines.join('\n')
}

async function setAutoRecall(options: CliOptions): Promise<void> {
  const homeDir = options.home?.trim()
  if (!homeDir) throw new Error('--home is required')
  if (typeof options.enabled !== 'boolean') throw new Error('--enabled is required')
  const resolvedHome = path.resolve(homeDir)
  process.env.HOME = resolvedHome
  const configPath = path.join(resolvedHome, '.openclaw', 'openclaw.json')
  const config = await readJsonFile(configPath)
  const plugins = ensureNestedRecord(config, 'plugins')
  const entries = ensureNestedRecord(plugins, 'entries')
  const bridgeEntry = ensureNestedRecord(entries, AUTO_RECALL_PLUGIN_ID)
  const bridgeConfig = ensureNestedRecord(bridgeEntry, 'config')
  bridgeConfig.autoRecall = options.enabled
  await writeJsonFile(configPath, config)

  let bridgeStatus: string | null = null
  try {
    bridgeStatus = (await getManagedMemoryBridgeStatusPayload({
      homeDir: resolvedHome,
      profileSelection: { kind: 'default' },
    })).state
  } catch {
    bridgeStatus = null
  }

  process.stdout.write(`${JSON.stringify({
    configPath,
    autoRecall: options.enabled,
    restartRequired: true,
    bridgeState: bridgeStatus,
  }, null, 2)}\n`)
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (command === 'init') {
    await initProfile(options)
    return
  }
  if (command === 'mark-stale') {
    await markStale(options)
    return
  }
  if (command === 'set-autorecall') {
    await setAutoRecall(options)
    return
  }
  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
