import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import { getOpenclawConfigResolution } from '../paths.js'
import { getClawmasterRuntimeSelection } from '../clawmasterSettings.js'
import {
  execWslCommand,
  getWslOpenclawProbeSync,
  listWslDistrosSync,
  resolveSelectedWslDistroSync,
  shouldUseWslRuntime,
} from '../wslRuntime.js'

const execAsync = promisify(exec)

async function checkCmd(cmd: string, args: string[], useWsl: boolean, distro: string | null): Promise<string | null> {
  try {
    if (useWsl && distro) {
      const out = await execWslCommand(distro, cmd, args)
      return out.code === 0 ? out.stdout.trim() : null
    }

    const { stdout } = await execAsync(`${cmd} ${args.join(' ')}`, {
      maxBuffer: 1024 * 1024,
      env: process.env,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function detectSystemInfo() {
  const runtimeSelection = getClawmasterRuntimeSelection()
  const distros = listWslDistrosSync()
  const selectedDistro = shouldUseWslRuntime(runtimeSelection)
    ? resolveSelectedWslDistroSync(runtimeSelection)
    : null
  const useWsl = shouldUseWslRuntime(runtimeSelection) && Boolean(selectedDistro)

  let nodejs = { installed: false, version: '' }
  const nv = await checkCmd('node', ['--version'], useWsl, selectedDistro)
  if (nv) nodejs = { installed: true, version: nv }

  let npm = { installed: false, version: '' }
  const npv = await checkCmd('npm', ['--version'], useWsl, selectedDistro)
  if (npv) npm = { installed: true, version: npv.split('\n')[0]?.trim() || npv }

  const profileSelection = getOpenclawConfigResolution().profileSelection
  const wslProbe = useWsl && selectedDistro ? getWslOpenclawProbeSync(selectedDistro, profileSelection) : null
  const resolution = useWsl
    ? {
        configPath: wslProbe?.configPath ?? '',
        dataDir: wslProbe?.dataDir ?? '',
        source: profileSelection.kind === 'dev' ? 'profile-dev' : profileSelection.kind === 'named' ? 'profile-named' : wslProbe?.configExists ? 'existing-default-home' : 'default-home',
        profileSelection,
        overrideActive: profileSelection.kind !== 'default',
        configPathCandidates: wslProbe?.configPath ? [wslProbe.configPath] : [],
        existingConfigPaths: wslProbe?.configExists && wslProbe.configPath ? [wslProbe.configPath] : [],
      }
    : getOpenclawConfigResolution()
  const configPath = resolution.configPath
  const configExists = useWsl ? Boolean(wslProbe?.configExists) : fs.existsSync(configPath)
  const ocRaw = useWsl
    ? wslProbe?.version || null
    : await checkCmd('openclaw', ['--version'], false, null)

  let openclaw = {
    installed: false,
    version: '',
    configPath,
    dataDir: resolution.dataDir,
    pathSource: resolution.source,
    profileMode: resolution.profileSelection.kind,
    profileName: resolution.profileSelection.name ?? null,
    overrideActive: resolution.overrideActive,
    configPathCandidates: resolution.configPathCandidates,
    existingConfigPaths: resolution.existingConfigPaths,
  }
  if (ocRaw || configExists) {
    let version = ''
    if (ocRaw) {
      version = ocRaw.replace(/^openclaw\s+/i, '').replace(/^v/, '').trim()
    }
    openclaw = { ...openclaw, installed: true, version }
  }
  return {
    nodejs,
    npm,
    openclaw,
    runtime: {
      mode: runtimeSelection.mode,
      hostPlatform: process.platform,
      wslAvailable: distros.length > 0,
      selectedDistro: runtimeSelection.mode === 'wsl2' ? (runtimeSelection.wslDistro ?? selectedDistro) : null,
      selectedDistroExists: runtimeSelection.mode === 'wsl2' ? Boolean(selectedDistro) : null,
      backendPort: runtimeSelection.backendPort ?? null,
      autoStartBackend: runtimeSelection.autoStartBackend ?? null,
      distros: distros.map((item) => ({
        ...item,
        hasOpenclaw:
          runtimeSelection.mode === 'wsl2' && selectedDistro === item.name
            ? openclaw.installed
            : undefined,
        openclawVersion:
          runtimeSelection.mode === 'wsl2' && selectedDistro === item.name && openclaw.version
            ? openclaw.version
            : undefined,
      })),
    },
  }
}
