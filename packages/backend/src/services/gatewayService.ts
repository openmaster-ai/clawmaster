import { readConfigJson } from '../configJson.js'
import {
  execOpenclawGatewayStatusJson,
  execOpenclawGatewayStatusPlain,
  extractFirstJsonObject,
  parseGatewayStatusJsonPayload,
  probeGatewayTcpPort,
  runOpenclawGatewayRestart,
  runOpenclawGatewayStop,
  spawnOpenclawGatewayStart,
} from '../execOpenclaw.js'
import { isRecord } from '../serverUtils.js'

export async function getGatewayStatus() {
  const cfg = readConfigJson()
  let port = 18789
  const gwc = cfg?.gateway
  if (isRecord(gwc) && typeof gwc.port === 'number') port = gwc.port

  // Fast path: listening on configured port → skip slow login-shell `openclaw gateway status` (common when gateway is up).
  if (await probeGatewayTcpPort(port)) {
    return { running: true, port }
  }

  const r = await execOpenclawGatewayStatusJson()
  const combined = `${r.stdout}\n${r.stderr}`
  const parsed =
    parseGatewayStatusJsonPayload(combined) ??
    parseGatewayStatusJsonPayload(extractFirstJsonObject(combined) ?? '')
  if (parsed && typeof parsed.port === 'number' && parsed.port > 0) {
    port = parsed.port
  }
  if (parsed?.running) return { running: true, port }

  // JSON explicitly says stopped → skip second expensive plain-text status call; re-probe port (may differ from config).
  if (parsed !== null && !parsed.running) {
    if (await probeGatewayTcpPort(port)) return { running: true, port }
    return { running: false, port }
  }

  if (r.code === 124) {
    return { running: false, port }
  }

  const plain = await execOpenclawGatewayStatusPlain()
  const text = `${plain.stdout}\n${plain.stderr}`
  if (/running|active|已运行|运行/i.test(text)) return { running: true, port }

  if (await probeGatewayTcpPort(port)) return { running: true, port }
  return { running: false, port }
}

export async function startGateway() {
  await spawnOpenclawGatewayStart()
}

export async function stopGateway() {
  await runOpenclawGatewayStop()
}

export async function restartGateway() {
  await runOpenclawGatewayRestart()
}
