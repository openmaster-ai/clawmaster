import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import { getOpenclawConfigPath } from '../paths.js'

const execAsync = promisify(exec)

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

export async function detectSystemInfo() {
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
  return { nodejs, npm, openclaw }
}
