import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getOpenclawConfigPath } from '../paths.js'
import {
  getPaddleOcrStatus,
  PADDLEOCR_DOC_SKILL_ID,
  PADDLEOCR_TEXT_SKILL_ID,
  setupPaddleOcr,
} from './paddleocrService.js'

const originalEnv = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  APPDATA: process.env.APPDATA,
  HOMEDRIVE: process.env.HOMEDRIVE,
  HOMEPATH: process.env.HOMEPATH,
}

function makeTempHome(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clawmaster-paddleocr-${label}-`))
}

function setTempHomeEnv(homeDir: string): void {
  process.env.HOME = homeDir
  process.env.USERPROFILE = homeDir
  process.env.APPDATA = path.join(homeDir, 'AppData', 'Roaming')
  process.env.HOMEDRIVE = path.parse(homeDir).root.replace(/[\\/]+$/, '')
  process.env.HOMEPATH = homeDir.slice(process.env.HOMEDRIVE.length) || path.sep
}

function writeSkillAsset(root: string, id: string): void {
  const skillRoot = path.join(root, id)
  fs.mkdirSync(path.join(skillRoot, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${id}\n`, 'utf8')
  fs.writeFileSync(path.join(skillRoot, 'scripts', 'lib.py'), 'print("ok")\n', 'utf8')
}

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof originalEnv]
    } else {
      process.env[key as keyof typeof originalEnv] = value
    }
  }
})

test('getPaddleOcrStatus reports first-run setup as unconfigured', () => {
  const homeDir = makeTempHome('status-empty')
  setTempHomeEnv(homeDir)

  const status = getPaddleOcrStatus({
    skillsDir: path.join(homeDir, '.openclaw', 'workspace', 'skills'),
  })

  assert.equal(status.configured, false)
  assert.deepEqual(status.enabledModules, [])
  assert.deepEqual(status.missingModules, [
    PADDLEOCR_TEXT_SKILL_ID,
    PADDLEOCR_DOC_SKILL_ID,
  ])
  assert.equal(status.textRecognition.configured, false)
  assert.equal(status.textRecognition.apiUrlConfigured, false)
  assert.equal(status.docParsing.configured, false)
  assert.equal(status.docParsing.apiUrlConfigured, false)
})

test('setupPaddleOcr writes the text recognition entry and prepares bundled modules', async () => {
  const homeDir = makeTempHome('setup')
  setTempHomeEnv(homeDir)

  const assetRoot = path.join(homeDir, 'assets')
  writeSkillAsset(assetRoot, PADDLEOCR_TEXT_SKILL_ID)
  writeSkillAsset(assetRoot, PADDLEOCR_DOC_SKILL_ID)

  const skillsDir = path.join(homeDir, '.openclaw', 'workspace', 'skills')
  const status = await setupPaddleOcr(
    {
      moduleId: PADDLEOCR_TEXT_SKILL_ID,
      apiUrl: 'https://demo.paddleocr.com/ocr',
      accessToken: 'tok_test_1234567890',
    },
    {
      assetRoot,
      skillsDir,
      validateCredentials: async () => undefined,
    },
  )

  assert.equal(status.configured, false)
  assert.deepEqual(status.enabledModules, [PADDLEOCR_TEXT_SKILL_ID])
  assert.deepEqual(status.missingModules, [])
  assert.equal(status.textRecognition.configured, true)
  assert.equal(status.textRecognition.apiUrl, 'https://demo.paddleocr.com/ocr')
  assert.equal(status.docParsing.configured, false)

  assert.ok(fs.existsSync(path.join(skillsDir, PADDLEOCR_TEXT_SKILL_ID, 'SKILL.md')))
  assert.ok(fs.existsSync(path.join(skillsDir, PADDLEOCR_DOC_SKILL_ID, 'SKILL.md')))

  const config = JSON.parse(fs.readFileSync(getOpenclawConfigPath(), 'utf8')) as Record<string, any>
  const textEntry = config.skills.entries[PADDLEOCR_TEXT_SKILL_ID]
  const docEntry = config.skills.entries[PADDLEOCR_DOC_SKILL_ID]

  assert.equal(textEntry.enabled, true)
  assert.equal(textEntry.apiKey, 'tok_test_1234567890')
  assert.equal(textEntry.config.apiUrl, 'https://demo.paddleocr.com/ocr')
  assert.equal(textEntry.config.accessToken, 'tok_test_1234567890')
  assert.equal(
    textEntry.env.PADDLEOCR_OCR_API_URL,
    'https://demo.paddleocr.com/ocr',
  )
  assert.equal(textEntry.env.PADDLEOCR_ACCESS_TOKEN, 'tok_test_1234567890')
  assert.equal(docEntry, undefined)
})

test('setupPaddleOcr is idempotent and preserves existing skill files', async () => {
  const homeDir = makeTempHome('idempotent')
  setTempHomeEnv(homeDir)

  const assetRoot = path.join(homeDir, 'assets')
  writeSkillAsset(assetRoot, PADDLEOCR_TEXT_SKILL_ID)
  writeSkillAsset(assetRoot, PADDLEOCR_DOC_SKILL_ID)

  const skillsDir = path.join(homeDir, '.openclaw', 'workspace', 'skills')

  await setupPaddleOcr(
    {
      moduleId: PADDLEOCR_TEXT_SKILL_ID,
      apiUrl: 'https://demo.paddleocr.com/ocr',
      accessToken: 'tok_test_1234567890',
    },
    {
      assetRoot,
      skillsDir,
      validateCredentials: async () => undefined,
    },
  )

  const customSkillPath = path.join(skillsDir, PADDLEOCR_TEXT_SKILL_ID, 'SKILL.md')
  fs.writeFileSync(customSkillPath, '# custom text recognition\n', 'utf8')

  await setupPaddleOcr(
    {
      moduleId: PADDLEOCR_TEXT_SKILL_ID,
      apiUrl: 'https://demo.paddleocr.com/ocr',
      accessToken: 'tok_test_1234567890',
    },
    {
      assetRoot,
      skillsDir,
      validateCredentials: async () => undefined,
    },
  )

  assert.equal(fs.readFileSync(customSkillPath, 'utf8'), '# custom text recognition\n')
})

test('setupPaddleOcr surfaces credential validation failures', async () => {
  const homeDir = makeTempHome('validation-error')
  setTempHomeEnv(homeDir)

  const assetRoot = path.join(homeDir, 'assets')
  writeSkillAsset(assetRoot, PADDLEOCR_TEXT_SKILL_ID)
  writeSkillAsset(assetRoot, PADDLEOCR_DOC_SKILL_ID)

  await assert.rejects(
    () =>
      setupPaddleOcr(
        {
          moduleId: PADDLEOCR_TEXT_SKILL_ID,
          apiUrl: 'https://demo.paddleocr.com/ocr',
          accessToken: 'bad-token',
        },
        {
          assetRoot,
          skillsDir: path.join(homeDir, '.openclaw', 'workspace', 'skills'),
          validateCredentials: async () => {
            throw new Error('PaddleOCR text recognition rejected the access token (403).')
          },
        },
      ),
    /rejected the access token/,
  )
})

test('setupPaddleOcr preserves the other module when configuring document parsing later', async () => {
  const homeDir = makeTempHome('two-stage')
  setTempHomeEnv(homeDir)

  const assetRoot = path.join(homeDir, 'assets')
  writeSkillAsset(assetRoot, PADDLEOCR_TEXT_SKILL_ID)
  writeSkillAsset(assetRoot, PADDLEOCR_DOC_SKILL_ID)

  const skillsDir = path.join(homeDir, '.openclaw', 'workspace', 'skills')

  await setupPaddleOcr(
    {
      moduleId: PADDLEOCR_TEXT_SKILL_ID,
      apiUrl: 'https://demo.paddleocr.com/ocr',
      accessToken: 'tok_text',
    },
    {
      assetRoot,
      skillsDir,
      validateCredentials: async () => undefined,
    },
  )

  const status = await setupPaddleOcr(
    {
      moduleId: PADDLEOCR_DOC_SKILL_ID,
      apiUrl: 'https://demo.paddleocr.com/layout-parsing',
      accessToken: 'tok_doc',
    },
    {
      assetRoot,
      skillsDir,
      validateCredentials: async () => undefined,
    },
  )

  assert.equal(status.configured, true)
  assert.equal(status.textRecognition.configured, true)
  assert.equal(status.docParsing.configured, true)

  const config = JSON.parse(fs.readFileSync(getOpenclawConfigPath(), 'utf8')) as Record<string, any>
  assert.equal(
    config.skills.entries[PADDLEOCR_TEXT_SKILL_ID].env.PADDLEOCR_ACCESS_TOKEN,
    'tok_text',
  )
  assert.equal(
    config.skills.entries[PADDLEOCR_DOC_SKILL_ID].env.PADDLEOCR_ACCESS_TOKEN,
    'tok_doc',
  )
})
