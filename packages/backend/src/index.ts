import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import {
  expandUserPath,
  getDefaultDesktopExportDir,
  getOpenclawConfigPath,
  getOpenclawDataDir,
  getOpenclawLogReadPaths,
  getOpenclawSnapshotsDir,
} from './paths.js'
import {
  createOpenclawBackupTar,
  listSnapshotTarballs,
  removeOpenclawDataDirectory,
  restoreOpenclawFromTarGz,
} from './openclawBackup.js'
import {
  readConfigJson,
  readConfigJsonOrEmpty,
  writeConfigJson,
  setConfigAtPath,
} from './configJson.js'
import {
  agentsFromConfig,
  channelsFromConfig,
  modelsFromConfig,
} from './derive.js'
import {
  execOpenclaw,
  execOpenclawGatewayStatusJson,
  execOpenclawGatewayStatusPlain,
  execShellCommand,
  extractFirstJsonObject,
  parseGatewayStatusJsonPayload,
  probeGatewayTcpPort,
  runOpenclawChecked,
  runOpenclawGatewayRestart,
  runOpenclawGatewayStop,
  spawnOpenclawGatewayStart,
} from './execOpenclaw.js'
import { bootstrapOpenclawAfterInstall } from './openclawBootstrap.js'
import { listOpenclawPlugins, setOpenclawPluginEnabled } from './openclawPlugins.js'
import { runOpenclawSkillsChecked, runOpenclawSkillsUninstall } from './skillsCli.js'
import {
  fetchOpenclawNpmMeta,
  npmInstallOpenclawFromLocalFile,
  npmInstallOpenclawGlobal,
} from './npmOpenclaw.js'
import {
  reinstallOpenclawWithBackup,
  runReinstallBackupStep,
  runReinstallUninstallStep,
} from './reinstallOpenclaw.js'
import { npmUninstallGlobalRobust } from './npmUninstallGlobalRobust.js'
import { runClawprobeJson } from './execClawprobe.js'

const execAsync = promisify(exec)

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 3001

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * HTTP status when openclaw exits non-zero so the UI can tell env vs config vs other failures.
 * - 503: Node version does not satisfy openclaw requirements
 * - 422: openclaw.json (etc.) failed validation (suggest `openclaw doctor --fix`)
 */
function statusForOpenclawCliError(message: string): number {
  if (/Node\.js\s+v?\d/i.test(message) && /required|current:/i.test(message)) {
    return 503
  }
  if (
    /config\s+invalid/i.test(message) ||
    /invalid\s+config/i.test(message) ||
    /must\s+NOT\s+have\s+additional\s+properties/i.test(message)
  ) {
    return 422
  }
  return 500
}

function sendOpenclawFailure(
  res: express.Response,
  error: unknown
): void {
  const msg = error instanceof Error ? error.message : String(error)
  res.status(statusForOpenclawCliError(msg)).type('text').send(msg)
}

async function checkCmd(cmd: string, args: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${cmd} ${args}`, {
      maxBuffer: 1024 * 1024,
      env: process.env,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

async function detectSystemHandler(_req: express.Request, res: express.Response) {
  try {
    let nodejs = { installed: false, version: '' }
    const nv = await checkCmd('node', '--version')
    if (nv) nodejs = { installed: true, version: nv }

    let npm = { installed: false, version: '' }
    const npv = await checkCmd('npm', '--version')
    if (npv) npm = { installed: true, version: npv.split('\n')[0]?.trim() || npv }

    const configPath = getOpenclawConfigPath()
    const configExists = fs.existsSync(configPath)
    const ocRaw = await checkCmd('openclaw', '--version')

    let openclaw = {
      installed: false,
      version: '',
      configPath,
    }
    if (ocRaw || configExists) {
      let version = '未知'
      if (ocRaw) {
        version = ocRaw.replace(/^openclaw\s+/i, '').replace(/^v/, '').trim()
      }
      openclaw = { installed: true, version, configPath }
    }

    res.json({ nodejs, npm, openclaw })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
}

async function gatewayStatusHandler(_req: express.Request, res: express.Response) {
  try {
    const cfg = readConfigJson()
    let port = 18789
    const gwc = cfg?.gateway
    if (isRecord(gwc) && typeof gwc.port === 'number') port = gwc.port

    const r = await execOpenclawGatewayStatusJson()
    const combined = `${r.stdout}\n${r.stderr}`
    const parsed =
      parseGatewayStatusJsonPayload(combined) ??
      parseGatewayStatusJsonPayload(extractFirstJsonObject(combined) ?? '')
    if (parsed && typeof parsed.port === 'number' && parsed.port > 0) {
      port = parsed.port
    }
    if (parsed?.running) {
      res.json({ running: true, port })
      return
    }

    const plain = await execOpenclawGatewayStatusPlain()
    const text = `${plain.stdout}\n${plain.stderr}`
    if (/running|active|已运行|运行/i.test(text)) {
      res.json({ running: true, port })
      return
    }

    if (await probeGatewayTcpPort(port)) {
      res.json({ running: true, port })
      return
    }

    res.json({ running: false, port })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
}

function readLogTailStrings(n: number): string[] {
  const cfg = readConfigJson()
  for (const logPath of getOpenclawLogReadPaths(cfg)) {
    if (!fs.existsSync(logPath)) continue
    const content = fs.readFileSync(logPath, 'utf-8')
    const all = content.split(/\r?\n/)
    const nonEmpty = all.filter((l) => l.length > 0)
    if (nonEmpty.length === 0) continue
    return nonEmpty.slice(-n)
  }
  return ['暂无日志']
}

function parseLogLine(line: string): {
  timestamp: string
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'
  message: string
} {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.*)$/)
  if (match) {
    const lv = match[2].toUpperCase()
    const level =
      lv === 'DEBUG' || lv === 'WARN' || lv === 'ERROR' ? (lv as 'DEBUG' | 'WARN' | 'ERROR') : 'INFO'
    return { timestamp: match[1], level, message: match[3] }
  }
  return { timestamp: new Date().toISOString(), level: 'INFO', message: line }
}

function mapSkillJson(raw: string, installed: boolean) {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON from openclaw skills')
  }
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : isRecord(data) && Array.isArray(data.skills)
        ? data.skills
        : []
  return rows.filter(isRecord).map((s) => {
    const slug = (typeof s.slug === 'string' ? s.slug : typeof s.name === 'string' ? s.name : '') || 'unknown'
    return {
      slug,
      name: (typeof s.name === 'string' ? s.name : slug) || slug,
      description: typeof s.description === 'string' ? s.description : '',
      version: typeof s.version === 'string' ? s.version : 'unknown',
      installed,
    }
  })
}

// ----- Routes aligned with Tauri + web adapters -----

app.get('/api/system/detect', detectSystemHandler)

app.get('/api/npm/openclaw-versions', async (_req, res) => {
  try {
    const meta = await fetchOpenclawNpmMeta()
    res.json(meta)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(502).type('text').send(msg)
  }
})

app.post('/api/npm/install-openclaw', async (req, res) => {
  try {
    const body = req.body as { version?: unknown; localPath?: unknown }
    const localPath = typeof body.localPath === 'string' ? body.localPath.trim() : ''
    if (localPath) {
      const out = await npmInstallOpenclawFromLocalFile(localPath)
      return res.json(out)
    }
    const raw = body.version
    const spec = raw === undefined || raw === null ? 'latest' : String(raw)
    const out = await npmInstallOpenclawGlobal(spec)
    res.json(out)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(400).type('text').send(msg)
  }
})

/** Phased reinstall (for UI progress): backup step only */
app.post('/api/npm/reinstall-step/backup', async (_req, res) => {
  try {
    const result = await runReinstallBackupStep()
    res.json(result)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

/** Phased reinstall: uninstall global openclaw only */
app.post('/api/npm/reinstall-step/uninstall', async (_req, res) => {
  try {
    const out = await runReinstallUninstallStep()
    res.json(out)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

/** Backup ~/.openclaw → uninstall openclaw only → install version (do not uninstall clawhub) */
app.post('/api/npm/reinstall-openclaw', async (req, res) => {
  try {
    const raw = (req.body as { version?: unknown })?.version
    const spec = raw === undefined || raw === null ? 'latest' : String(raw)
    const out = await reinstallOpenclawWithBackup(spec)
    res.json(out)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(400).type('text').send(msg)
  }
})

app.get('/api/gateway/status', gatewayStatusHandler)

app.post('/api/gateway/start', async (_req, res) => {
  try {
    await spawnOpenclawGatewayStart()
    res.status(204).end()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

app.post('/api/gateway/stop', async (_req, res) => {
  try {
    await runOpenclawGatewayStop()
    res.status(204).end()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

app.post('/api/gateway/restart', async (_req, res) => {
  try {
    await runOpenclawGatewayRestart()
    res.status(204).end()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

/** After install/reinstall: write empty config if missing → doctor --fix → try gateway start */
app.post('/api/openclaw/bootstrap-after-install', async (_req, res) => {
  try {
    const result = await bootstrapOpenclawAfterInstall()
    res.json(result)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

app.get('/api/config', (_req, res) => {
  res.json(readConfigJsonOrEmpty())
})

/** Replace entire openclaw.json (same as Tauri save_config) */
app.put('/api/config', (req, res) => {
  const body = req.body
  if (!isRecord(body)) {
    return res.status(400).type('text').send('Body must be a JSON object')
  }
  try {
    writeConfigJson(body as Record<string, unknown>)
    res.status(204).end()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    res.status(500).type('text').send(msg)
  }
})

/** POST /api/config/<dot.path> body: { value } — same as web setConfig */
app.use((req, res, next) => {
  if (req.method !== 'POST') return next()
  if (!req.path.startsWith('/api/config/')) return next()
  const pathKey = decodeURIComponent(req.path.slice('/api/config/'.length))
  if (!pathKey) return next()
  const value = (req.body as { value?: unknown })?.value
  const config = readConfigJsonOrEmpty()
  try {
    setConfigAtPath(config, pathKey, value)
    writeConfigJson(config)
    return res.status(204).end()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return res.status(500).type('text').send(msg)
  }
})

app.get('/api/channels', (_req, res) => {
  res.json(channelsFromConfig(readConfigJsonOrEmpty()))
})

app.post('/api/channels', (req, res) => {
  const body = req.body as { type?: string; name?: string; config?: Record<string, unknown> }
  if (!body?.type) {
    return res.status(400).type('text').send('Missing type')
  }
  const config = readConfigJsonOrEmpty()
  const channels = isRecord(config.channels) ? { ...config.channels } : {}
  channels[body.type] = { enabled: true, ...(body.config ?? {}) }
  config.channels = channels
  writeConfigJson(config)
  res.status(204).end()
})

app.delete('/api/channels/:id', (req, res) => {
  const id = req.params.id
  const config = readConfigJsonOrEmpty()
  if (!isRecord(config.channels) || !config.channels[id]) {
    return res.status(404).type('text').send('Channel not found')
  }
  delete config.channels[id]
  writeConfigJson(config)
  res.status(204).end()
})

app.get('/api/models', (_req, res) => {
  res.json(modelsFromConfig(readConfigJsonOrEmpty()))
})

app.post('/api/models/default', (req, res) => {
  const modelId = (req.body as { modelId?: string })?.modelId
  if (typeof modelId !== 'string') {
    return res.status(400).type('text').send('Missing modelId')
  }
  const config = readConfigJsonOrEmpty()
  const agents = isRecord(config.agents) ? { ...config.agents } : {}
  const defaults = isRecord(agents.defaults) ? { ...agents.defaults } : {}
  const model = isRecord(defaults.model) ? { ...defaults.model } : {}
  model.primary = modelId
  defaults.model = model
  agents.defaults = defaults
  config.agents = agents
  writeConfigJson(config)
  res.status(204).end()
})

app.get('/api/agents', (_req, res) => {
  res.json(agentsFromConfig(readConfigJsonOrEmpty()))
})

app.post('/api/agents', (req, res) => {
  const body = req.body as { id?: string; name?: string; model?: string }
  if (!body?.id || !body.name || !body.model) {
    return res.status(400).type('text').send('Missing id, name or model')
  }
  const config = readConfigJsonOrEmpty()
  const agents = isRecord(config.agents) ? { ...config.agents } : {}
  const list = Array.isArray(agents.list) ? [...agents.list] : []
  list.push({ id: body.id, name: body.name, model: body.model })
  agents.list = list
  config.agents = agents
  writeConfigJson(config)
  res.status(204).end()
})

app.delete('/api/agents/:id', (req, res) => {
  const id = req.params.id
  const config = readConfigJsonOrEmpty()
  const agentBlock = isRecord(config.agents) ? config.agents : null
  if (!agentBlock || !Array.isArray(agentBlock.list)) {
    return res.status(404).type('text').send('Agents not found')
  }
  const prevLen = agentBlock.list.length
  const list = agentBlock.list.filter((a) => (isRecord(a) ? a.id !== id : true))
  if (list.length === prevLen) {
    return res.status(404).type('text').send('Agent not found')
  }
  config.agents = { ...agentBlock, list }
  writeConfigJson(config)
  res.status(204).end()
})

app.get('/api/plugins', async (_req, res) => {
  try {
    const out = await listOpenclawPlugins()
    res.json({
      plugins: out.rows,
      rawCliOutput:
        out.rows.length === 0 && out.fallbackText ? out.fallbackText : null,
    })
  } catch (error: unknown) {
    sendOpenclawFailure(res, error)
  }
})

app.post('/api/plugins/set-enabled', async (req, res) => {
  try {
    const body = req.body
    if (
      !isRecord(body) ||
      typeof body.id !== 'string' ||
      typeof body.enabled !== 'boolean'
    ) {
      return res.status(400).type('text').send('Body must be JSON: { "id": string, "enabled": boolean }')
    }
    await setOpenclawPluginEnabled(body.id, body.enabled)
    res.status(204).end()
  } catch (error: unknown) {
    sendOpenclawFailure(res, error)
  }
})

app.get('/api/skills', async (_req, res) => {
  try {
    const out = await runOpenclawSkillsChecked(['list', '--json'])
    res.json(mapSkillJson(out, true))
  } catch (error: unknown) {
    sendOpenclawFailure(res, error)
  }
})

app.get('/api/skills/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  if (!q.trim()) {
    return res.json([])
  }
  try {
    const out = await runOpenclawSkillsChecked(['search', q, '--json'])
    res.json(mapSkillJson(out, false))
  } catch (error: unknown) {
    sendOpenclawFailure(res, error)
  }
})

app.post('/api/skills/install', async (req, res) => {
  const slug = (req.body as { slug?: string })?.slug
  if (!slug) {
    return res.status(400).type('text').send('Missing slug')
  }
  try {
    await runOpenclawSkillsChecked(['install', slug])
    res.status(204).end()
  } catch (error: unknown) {
    sendOpenclawFailure(res, error)
  }
})

app.post('/api/skills/uninstall', async (req, res) => {
  const slug = (req.body as { slug?: string })?.slug
  if (!slug) {
    return res.status(400).type('text').send('Missing slug')
  }
  try {
    await runOpenclawSkillsUninstall(slug)
    res.status(204).end()
  } catch (error: unknown) {
    sendOpenclawFailure(res, error)
  }
})

/** Reset config = write openclaw.json as `{}` (clear settings); does not delete file or uninstall CLI */
app.get('/api/settings/backup-defaults', (_req, res) => {
  const snapshotsDir = getOpenclawSnapshotsDir()
  res.json({
    desktopDir: getDefaultDesktopExportDir(),
    snapshotsDir,
    dataDir: getOpenclawDataDir(),
    /** Same as openclaw-uninstaller option 2; wizard default tar.gz location */
    defaultBackupPath: snapshotsDir,
  })
})

app.post('/api/settings/openclaw-backup', async (req, res) => {
  const body = req.body as { mode?: string; exportDir?: string }
  const mode = body.mode
  let exportDir: string
  if (mode === 'snapshots') {
    exportDir = getOpenclawSnapshotsDir()
  } else if (mode === 'desktop' || mode === 'custom') {
    exportDir = body.exportDir
      ? expandUserPath(body.exportDir)
      : getDefaultDesktopExportDir()
  } else {
    return res.status(400).type('text').send('mode 须为 snapshots | desktop | custom')
  }
  try {
    const result = await createOpenclawBackupTar(exportDir)
    res.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.get('/api/settings/openclaw-backups', (_req, res) => {
  try {
    res.json({ files: listSnapshotTarballs() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.post('/api/settings/openclaw-restore', async (req, res) => {
  const tarPath =
    typeof (req.body as { tarPath?: string })?.tarPath === 'string'
      ? (req.body as { tarPath: string }).tarPath
      : ''
  if (!tarPath.trim()) {
    return res.status(400).type('text').send('缺少 tarPath')
  }
  try {
    await restoreOpenclawFromTarGz(expandUserPath(tarPath))
    res.status(204).end()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.post('/api/settings/remove-openclaw-data', (req, res) => {
  const confirm = (req.body as { confirm?: string })?.confirm
  if (confirm !== 'DELETE') {
    return res.status(400).type('text').send('请在 body 中传入 confirm: "DELETE"')
  }
  try {
    removeOpenclawDataDirectory()
    res.status(204).end()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.post('/api/settings/reset-config', (_req, res) => {
  try {
    writeConfigJson({})
    res.status(204).end()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.post('/api/settings/uninstall-openclaw', async (_req, res) => {
  try {
    const a = await npmUninstallGlobalRobust('openclaw')
    const b = await npmUninstallGlobalRobust('clawhub')
    const ok = a.code === 0 && b.code === 0
    res.json({
      ok,
      code: ok ? 0 : Math.max(a.code, b.code),
      stdout: [a.stdout, b.stdout].filter(Boolean).join('\n'),
      stderr: [a.stderr, b.stderr].filter(Boolean).join('\n'),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.get('/api/logs', (req, res) => {
  const lines = Math.min(parseInt(String(req.query.lines), 10) || 100, 5000)
  const raw = readLogTailStrings(lines)
  const entries = raw.map(parseLogLine)
  res.json(entries)
})

/** ClawProbe observability (local `clawprobe` package — JSON subcommands) */
app.get('/api/clawprobe/status', async (_req, res) => {
  try {
    const data = await runClawprobeJson(['status', '--json'])
    res.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.get('/api/clawprobe/cost', async (req, res) => {
  const period = String(req.query.period ?? 'week')
  const args = ['cost', '--json']
  if (period === 'day') args.push('--day')
  else if (period === 'month') args.push('--month')
  else if (period === 'all') args.push('--all')
  else if (period !== 'week') {
    res.status(400).type('text').send('period must be day|week|month|all')
    return
  }
  try {
    const data = await runClawprobeJson(args)
    res.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.get('/api/clawprobe/suggest', async (_req, res) => {
  try {
    const data = await runClawprobeJson(['suggest', '--json'])
    res.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

app.get('/api/clawprobe/config', async (_req, res) => {
  try {
    const data = await runClawprobeJson(['config', '--json'])
    res.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).type('text').send(msg)
  }
})

const server = app.listen(PORT, () => {
  console.log(`🦞 OpenClaw Manager Backend (Tauri-parity) on http://localhost:${PORT}`)
})

const wss = new WebSocketServer({ server, path: '/api/logs/stream' })
wss.on('connection', (ws: WebSocket) => {
  let lastLine = ''
  const tick = () => {
    try {
      const tail = readLogTailStrings(1)
      const line = tail[tail.length - 1] ?? ''
      if (line && line !== lastLine) {
        lastLine = line
        ws.send(JSON.stringify(parseLogLine(line)))
      }
    } catch {
      /* ignore */
    }
  }
  tick()
  const interval = setInterval(tick, 2000)
  ws.on('close', () => clearInterval(interval))
})
