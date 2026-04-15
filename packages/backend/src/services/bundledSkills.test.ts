import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { installBundledSkill, isBundledSkillSlug } from './bundledSkills.js'

test('isBundledSkillSlug recognizes ERNIE skill ids case-insensitively', () => {
  assert.equal(isBundledSkillSlug('ernie-image'), true)
  assert.equal(isBundledSkillSlug('ERNIE-IMAGE'), true)
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
