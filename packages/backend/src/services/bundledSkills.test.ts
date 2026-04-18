import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { installBundledSkill, isBundledSkillSlug } from './bundledSkills.js'

test('isBundledSkillSlug recognizes bundled skill ids case-insensitively', () => {
  assert.equal(isBundledSkillSlug('ernie-image'), true)
  assert.equal(isBundledSkillSlug('ERNIE-IMAGE'), true)
  assert.equal(isBundledSkillSlug('models-dev'), true)
  assert.equal(isBundledSkillSlug('MODELS-DEV'), true)
  assert.equal(isBundledSkillSlug('paddleocr-doc-parsing'), true)
  assert.equal(isBundledSkillSlug('PADDLEOCR-DOC-PARSING'), true)
  assert.equal(isBundledSkillSlug('image-generate'), false)
})

test('installBundledSkill copies the packaged skill into the active workspace', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-src-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-data-'))
  fs.mkdirSync(path.join(sourceRoot, 'references'), { recursive: true })
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), '# ERNIE Image\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, '_meta.json'), '{"slug":"ernie-image","version":"1.0.0"}\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'references', 'args.md'), 'size\n', 'utf8')

  const result = installBundledSkill('ernie-image', {
    dataDir,
    env: {
      ...process.env,
      CLAWMASTER_BUNDLED_ERNIE_IMAGE_SKILL_ROOT: sourceRoot,
    },
  })

  const installDir = path.join(dataDir, 'workspace', 'skills', 'ernie-image')
  assert.equal(result.installDir, installDir)
  assert.equal(fs.readFileSync(path.join(installDir, 'SKILL.md'), 'utf8'), '# ERNIE Image\n')
  assert.equal(
    fs.readFileSync(path.join(installDir, '_meta.json'), 'utf8'),
    '{"slug":"ernie-image","version":"1.0.0"}\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'references', 'args.md'), 'utf8'),
    'size\n',
  )
})

test('installBundledSkill copies the bundled PaddleOCR skill into the active workspace', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-src-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-data-'))
  fs.mkdirSync(path.join(sourceRoot, 'references'), { recursive: true })
  fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), '# PaddleOCR\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, '_meta.json'), '{"slug":"paddleocr-doc-parsing","version":"1.0.0"}\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'references', 'presets.md'), 'pdf\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'parse-document.mjs'), 'console.log("parse")\n', 'utf8')

  const result = installBundledSkill('paddleocr-doc-parsing', {
    dataDir,
    env: {
      ...process.env,
      CLAWMASTER_BUNDLED_PADDLEOCR_DOC_PARSING_SKILL_ROOT: sourceRoot,
    },
  })

  const installDir = path.join(dataDir, 'workspace', 'skills', 'paddleocr-doc-parsing')
  assert.equal(result.installDir, installDir)
  assert.equal(fs.readFileSync(path.join(installDir, 'SKILL.md'), 'utf8'), '# PaddleOCR\n')
  assert.equal(
    fs.readFileSync(path.join(installDir, '_meta.json'), 'utf8'),
    '{"slug":"paddleocr-doc-parsing","version":"1.0.0"}\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'references', 'presets.md'), 'utf8'),
    'pdf\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'scripts', 'parse-document.mjs'), 'utf8'),
    'console.log("parse")\n',
  )
})

test('installBundledSkill copies the bundled models.dev skill into the active workspace', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-src-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-data-'))
  fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), '# models.dev\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, '_meta.json'), '{"slug":"models-dev","version":"1.0.0"}\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'query-models.mjs'), 'console.log("query")\n', 'utf8')

  const result = installBundledSkill('models-dev', {
    dataDir,
    env: {
      ...process.env,
      CLAWMASTER_BUNDLED_MODELS_DEV_SKILL_ROOT: sourceRoot,
    },
  })

  const installDir = path.join(dataDir, 'workspace', 'skills', 'models-dev')
  assert.equal(result.installDir, installDir)
  assert.equal(fs.readFileSync(path.join(installDir, 'SKILL.md'), 'utf8'), '# models.dev\n')
  assert.equal(
    fs.readFileSync(path.join(installDir, '_meta.json'), 'utf8'),
    '{"slug":"models-dev","version":"1.0.0"}\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'scripts', 'query-models.mjs'), 'utf8'),
    'console.log("query")\n',
  )
})

test('bundled models.dev skill explicitly instructs agents to read the skill and exec the script', () => {
  const skillPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/models-dev/SKILL.md',
  )
  const skillBody = fs.readFileSync(skillPath, 'utf8')

  assert.match(skillBody, /Do not call `models-dev` as if it were a built-in tool\./)
  assert.match(skillBody, /First use `read` to load this `SKILL\.md`\./)
  assert.match(skillBody, /Then use `exec` to run the bundled Node scripts with `node`\./)
})

test('bundled PaddleOCR skill explicitly instructs agents to read the skill and exec the script', () => {
  const skillPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/paddleocr-doc-parsing/SKILL.md',
  )
  const skillBody = fs.readFileSync(skillPath, 'utf8')

  assert.match(skillBody, /Do not call `paddleocr-doc-parsing` as if it were a tool name\./)
  assert.match(skillBody, /First use `read` to load this `SKILL\.md`\./)
  assert.match(skillBody, /Then use `exec` to run the bundled Node script with `node`\./)
})
