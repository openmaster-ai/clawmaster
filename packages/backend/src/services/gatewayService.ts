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

  const r = await execOpenclawGatewayStatusJson()
  const combined = `${r.stdout}\n${r.stderr}`
  const parsed =
    parseGatewayStatusJsonPayload(combined) ??
    parseGatewayStatusJsonPayload(extractFirstJsonObject(combined) ?? '')
  if (parsed && typeof parsed.port === 'number' && parsed.port > 0) {
    port = parsed.port
  }
  if (parsed?.running) return { running: true, port }

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
