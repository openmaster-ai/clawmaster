import { readConfigJsonOrEmpty, setConfigAtPath, updateConfigJson, writeConfigJson } from '../configJson.js'
import { isRecord } from '../serverUtils.js'

export function getConfig() {
  return readConfigJsonOrEmpty()
}

export function saveConfig(body: unknown) {
  if (!isRecord(body)) {
    throw new Error('Body must be a JSON object')
  }
  writeConfigJson(body as Record<string, unknown>)
}

export async function setConfigPath(pathKey: string, value: unknown) {
  await updateConfigJson((config) => {
    setConfigAtPath(config, pathKey, value)
  })
}
