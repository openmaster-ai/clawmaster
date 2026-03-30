import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const app = express()
app.use(cors())
app.use(express.json())

const PORT = 3001

// Helper: 执行 openclaw 命令
async function runOpenClaw(args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`openclaw ${args}`)
    return stdout
  } catch (error: any) {
    throw new Error(error.message || 'Command failed')
  }
}

// Helper: 安全读取配置文件（只读！）
function readConfigFile(): any {
  const configPath = path.join(homedir(), '.openclaw', 'openclaw.json')
  if (!existsSync(configPath)) {
    return null
  }
  try {
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

// ========== API Routes ==========

// 系统检测
app.get('/api/system/detect', async (req, res) => {
  try {
    // 检测 Node.js
    let nodejs = { installed: false, version: '' }
    try {
      const { stdout } = await execAsync('node --version 2>/dev/null')
      nodejs = { installed: true, version: stdout.trim() }
    } catch {}

    // 检测 npm
    let npm = { installed: false, version: '' }
    try {
      const { stdout } = await execAsync('npm --version 2>/dev/null')
      npm = { installed: true, version: stdout.trim() }
    } catch {}

    // 检测 OpenClaw
    let openclaw = { installed: false, version: '', configPath: '' }
    try {
      const { stdout } = await execAsync('openclaw --version 2>/dev/null')
      const match = stdout.match(/(\d{4}\.\d+\.\d+)/)
      openclaw = {
        installed: true,
        version: match ? match[1] : 'unknown',
        configPath: path.join(homedir(), '.openclaw', 'openclaw.json')
      }
    } catch {}

    res.json({ nodejs, npm, openclaw })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// 网关状态
app.get('/api/gateway/status', async (req, res) => {
  try {
    const { stdout } = await execAsync('openclaw gateway status --json 2>/dev/null || openclaw gateway status')
    // 简单解析状态
    const running = stdout.includes('running') || stdout.includes('active')
    res.json({
      running,
      port: 18789,
      uptime: running ? 3600 : undefined
    })
  } catch (error: any) {
    res.json({ running: false, port: 18789 })
  }
})

// 网关操作（仅返回模拟响应，实际操作需要用户确认）
app.post('/api/gateway/start', async (req, res) => {
  res.json({ message: 'Gateway start requested', note: 'In web mode, use terminal to start gateway' })
})

app.post('/api/gateway/stop', async (req, res) => {
  res.json({ message: 'Gateway stop requested', note: 'In web mode, use terminal to stop gateway' })
})

app.post('/api/gateway/restart', async (req, res) => {
  res.json({ message: 'Gateway restart requested', note: 'In web mode, use terminal to restart gateway' })
})

// 读取配置（只读！）
app.get('/api/config', (req, res) => {
  const config = readConfigFile()
  if (!config) {
    return res.status(404).json({ error: 'Config not found' })
  }
  res.json(config)
})

// 通道列表
app.get('/api/channels', (req, res) => {
  const config = readConfigFile()
  const channels = config?.channels || {}
  const result = Object.entries(channels).flatMap(([type, ch]: [string, any]) => {
    if (ch.accounts) {
      return Object.entries(ch.accounts).map(([id, acc]: [string, any]) => ({
        id: `${type}-${id}`,
        name: acc.name || id,
        type,
        enabled: acc.enabled
      }))
    }
    return []
  })
  res.json(result)
})

// 模型列表
app.get('/api/models', (req, res) => {
  const config = readConfigFile()
  const models: any[] = []
  const providers = config?.models?.providers || {}
  
  for (const [provider, data] of Object.entries(providers)) {
    const pData = data as any
    if (pData.models) {
      for (const model of pData.models) {
        models.push({
          id: `${provider}/${model.id}`,
          name: model.name || model.id,
          provider,
          enabled: true
        })
      }
    }
  }
  res.json(models)
})

// 代理列表
app.get('/api/agents', (req, res) => {
  const config = readConfigFile()
  const agents = config?.agents?.list || []
  res.json(agents)
})

// 日志（真实读取）
app.get('/api/logs', (req, res) => {
  const lines = parseInt(req.query.lines as string) || 100
  const logPaths = [
    path.join(homedir(), '.openclaw', 'logs', 'openclaw.log'),
    path.join(homedir(), '.openclaw', 'logs', 'gateway.log'),
  ]

  const logFile = logPaths.find((p) => existsSync(p))
  if (!logFile) {
    res.json([{ timestamp: new Date().toISOString(), level: 'INFO', message: '暂无日志文件' }])
    return
  }

  try {
    const content = readFileSync(logFile, 'utf-8')
    const allLines = content.trim().split('\n').filter(Boolean)
    const tail = allLines.slice(-lines)

    const logs = tail.map((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\S*\s*\[(\w+)\]\s*(.*)$/)
      if (match) {
        return { timestamp: match[1], level: match[2], message: match[3] }
      }
      return { timestamp: new Date().toISOString(), level: 'INFO', message: line }
    })

    res.json(logs)
  } catch (err: any) {
    res.json([{ timestamp: new Date().toISOString(), level: 'ERROR', message: `读取日志失败: ${err.message}` }])
  }
})

// 通用命令执行（供 shared/adapters/platform.ts 的 execViaWeb 调用）
app.post('/api/exec', async (req, res) => {
  const { cmd, args } = req.body
  if (!cmd || typeof cmd !== 'string') {
    res.status(400).json({ error: 'Missing cmd parameter' })
    return
  }
  try {
    // 使用 execFile 直接传参，避免 shell 解释导致参数拆分
    const { stdout, stderr } = await execFileAsync(cmd, args ?? [], { shell: false })
    res.json({ stdout: stdout.trim(), stderr: stderr.trim() })
  } catch (err: any) {
    res.status(500).json({ error: err.message, stdout: '', stderr: err.stderr || '' })
  }
})

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`🦞 OpenClaw Manager Backend running on http://localhost:${PORT}`)
  console.log(`   API available at http://localhost:${PORT}/api`)
})

// WebSocket 日志流（模拟）
const wss = new WebSocketServer({ server, path: '/api/logs/stream' })
wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected')
  
  // 模拟日志推送
  const interval = setInterval(() => {
    ws.send(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Heartbeat OK'
    }))
  }, 30000)

  ws.on('close', () => {
    clearInterval(interval)
    console.log('WebSocket client disconnected')
  })
})
