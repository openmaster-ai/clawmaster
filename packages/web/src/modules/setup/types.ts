/** 能力项 ID */
export type CapabilityId = 'engine' | 'memory' | 'observe' | 'ocr' | 'agent'

/** 能力项状态 */
export interface CapabilityStatus {
  id: CapabilityId
  name: string
  status: 'checking' | 'installed' | 'not_installed' | 'error'
  version?: string
  error?: string
}

/** 安装进度 */
export interface InstallProgress {
  id: CapabilityId
  status: 'waiting' | 'installing' | 'done' | 'error'
  progress?: number // 0-100
  log?: string // 当前安装输出行
  error?: string
}

/** 安装向导总状态 */
export type SetupPhase = 'detecting' | 'ready' | 'installing' | 'done' | 'error'

/** 能力定义（用户看到的名称和底层安装命令的映射） */
export interface CapabilityDef {
  id: CapabilityId
  name: string
  detectCmd: string
  detectArgs: string[]
  installSteps: Array<{ cmd: string; args: string[] }>
  /** 是否必装。false 表示可在对应模块页面按需安装 */
  required: boolean
}

/** 五项内置能力定义 */
export const CAPABILITIES: CapabilityDef[] = [
  {
    id: 'engine',
    name: '核心引擎',
    detectCmd: 'openclaw',
    detectArgs: ['--version'],
    required: true,
    installSteps: [
      { cmd: 'npm', args: ['install', '-g', 'openclaw'] },
    ],
  },
  {
    id: 'memory',
    name: '记忆管理',
    detectCmd: 'openclaw',
    detectArgs: ['ltm', 'health'],
    required: false,
    installSteps: [
      // 1. 创建目录 + 虚拟环境
      { cmd: 'mkdir', args: ['-p', '~/.openclaw/powermem'] },
      { cmd: 'python3', args: ['-m', 'venv', '~/.openclaw/powermem/.venv'] },
      // 2. 在虚拟环境中安装 PowerMem
      { cmd: '~/.openclaw/powermem/.venv/bin/pip', args: ['install', 'powermem'] },
      // 3. 安装 OpenClaw 插件
      { cmd: 'openclaw', args: ['plugins', 'install', 'memory-powermem'] },
      // 4. 通过 ClawHub Skill 自动完成配置 + 槽位切换
      { cmd: 'clawhub', args: ['install', 'teingi/install-powermem-memory-minimal'] },
      // 5. 启动 PowerMem HTTP API 服务（供大师 GUI 调用）
      { cmd: 'bash', args: ['-c', 'cd ~/.openclaw/powermem && source .venv/bin/activate && nohup powermem-server --host 0.0.0.0 --port 8000 > powermem.log 2>&1 &'] },
    ],
  },
  {
    id: 'observe',
    name: '可观测性',
    detectCmd: 'clawprobe',
    detectArgs: ['--version'],
    required: false,
    installSteps: [
      { cmd: 'npm', args: ['install', '-g', 'clawprobe'] },
    ],
  },
  {
    id: 'ocr',
    name: '文档与图像识别',
    detectCmd: 'clawhub',
    detectArgs: ['list', '--json'],
    required: false,
    installSteps: [
      { cmd: 'clawhub', args: ['install', 'paddleocr-doc-parsing'] },
      { cmd: 'clawhub', args: ['install', 'paddleocr-text-recognition'] },
    ],
  },
  {
    id: 'agent',
    name: '智能体编排',
    detectCmd: 'python3',
    detectArgs: ['-c', 'import deepagents; print(deepagents.__version__)'],
    required: false,
    installSteps: [
      { cmd: 'pip', args: ['install', 'langchain', 'langgraph', 'deepagents'] },
    ],
  },
]
