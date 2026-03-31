import { runClawprobeCommand, runClawprobeJson } from '../execClawprobe.js'

export async function clawprobeStatus() {
  return runClawprobeJson(['status', '--json'])
}

export async function clawprobeCost(period: string) {
  const args = ['cost', '--json']
  if (period === 'day') args.push('--day')
  else if (period === 'month') args.push('--month')
  else if (period === 'all') args.push('--all')
  else if (period !== 'week') throw new Error('period must be day|week|month|all')
  return runClawprobeJson(args)
}

export async function clawprobeSuggest() {
  return runClawprobeJson(['suggest', '--json'])
}

export async function clawprobeConfig() {
  return runClawprobeJson(['config', '--json'])
}

export async function clawprobeBootstrap() {
  const before = await runClawprobeJson(['status', '--json'])
  const beforeObj =
    typeof before === 'object' && before !== null
      ? (before as { daemonRunning?: boolean })
      : {}
  if (beforeObj.daemonRunning === true) {
    return {
      ok: true,
      alreadyRunning: true,
      daemonRunning: true,
      message: 'ClawProbe 守护进程已在运行',
    }
  }

  const start = await runClawprobeCommand(['start'])
  const after = await runClawprobeJson(['status', '--json'])
  const afterObj =
    typeof after === 'object' && after !== null ? (after as { daemonRunning?: boolean }) : {}

  if (afterObj.daemonRunning === true) {
    return {
      ok: true,
      alreadyRunning: false,
      daemonRunning: true,
      message: 'ClawProbe 已成功拉起',
      stdout: start.stdout,
      stderr: start.stderr,
    }
  }
  throw Object.assign(new Error(start.stderr || start.stdout || '启动命令执行后仍未检测到守护进程'), {
    stdout: start.stdout,
    stderr: start.stderr,
  })
}
