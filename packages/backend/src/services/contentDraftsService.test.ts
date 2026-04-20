import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  deleteContentDraftVariant,
  listContentDraftVariants,
  readContentDraftImageFile,
  readContentDraftTextFile,
} from './contentDraftsService.js'

test('content draft service lists saved variants and guards file reads to content-draft roots', () => {
  const previousHome = process.env.HOME
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-home-'))

  try {
    process.env.HOME = tempHome

    const variantDir = path.join(tempHome, '.openclaw', 'workspace', 'content-drafts', 'run-001', 'xhs')
    const imagesDir = path.join(variantDir, 'images')
    fs.mkdirSync(imagesDir, { recursive: true })
    fs.writeFileSync(path.join(variantDir, 'draft.md'), '# Draft body\n', 'utf8')
    fs.writeFileSync(path.join(imagesDir, 'cover.png'), 'png', 'utf8')
    fs.writeFileSync(
      path.join(variantDir, 'manifest.json'),
      JSON.stringify({
        runId: 'run-001',
        platform: 'xhs',
        title: 'Draft title',
        sourceUrl: 'https://example.com/source',
        savedAt: '2026-04-19T08:00:00.000Z',
        draftPath: path.join(variantDir, 'draft.md'),
        imagesDir,
        imageFiles: ['cover.png'],
      }),
      'utf8',
    )

    const variants = listContentDraftVariants()
    assert.equal(variants.length, 1)
    assert.equal(variants[0]?.id, 'run-001:xhs')
    assert.equal(variants[0]?.title, 'Draft title')

    const draftFile = readContentDraftTextFile(path.join(variantDir, 'draft.md'))
    assert.equal(draftFile.content, '# Draft body\n')

    const imageFile = readContentDraftImageFile(path.join(imagesDir, 'cover.png'))
    assert.equal(imageFile.mimeType, 'image/png')
    assert.deepEqual(imageFile.bytes, [...Buffer.from('png')])

    const outsidePath = path.join(tempHome, 'outside.md')
    fs.writeFileSync(outsidePath, 'nope\n', 'utf8')
    assert.throws(() => readContentDraftTextFile(outsidePath), /outside content draft roots/i)
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
})

test('content draft service deletes a saved variant and prunes the empty run directory', () => {
  const previousHome = process.env.HOME
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-delete-'))

  try {
    process.env.HOME = tempHome

    const variantDir = path.join(tempHome, '.openclaw', 'workspace', 'content-drafts', 'run-002', 'wechat')
    fs.mkdirSync(path.join(variantDir, 'images'), { recursive: true })
    const manifestPath = path.join(variantDir, 'manifest.json')
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        runId: 'run-002',
        platform: 'wechat',
      }),
      'utf8',
    )

    const result = deleteContentDraftVariant(manifestPath)
    assert.equal(result.removedPath, variantDir)
    assert.equal(fs.existsSync(variantDir), false)
    assert.equal(fs.existsSync(path.dirname(variantDir)), false)
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
})

test('content draft service discovers variants under OPENCLAW_WORKSPACE_DIR/content-drafts', () => {
  const previousHome = process.env.HOME
  const previousWorkspaceDir = process.env.OPENCLAW_WORKSPACE_DIR
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-home-'))
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-workspace-'))

  try {
    process.env.HOME = tempHome
    process.env.OPENCLAW_WORKSPACE_DIR = tempWorkspace

    const variantDir = path.join(tempWorkspace, 'content-drafts', 'run-003', 'wechat')
    const imagesDir = path.join(variantDir, 'images')
    fs.mkdirSync(imagesDir, { recursive: true })
    fs.writeFileSync(path.join(variantDir, 'draft.md'), '# Workspace draft\n', 'utf8')
    fs.writeFileSync(
      path.join(variantDir, 'manifest.json'),
      JSON.stringify({
        runId: 'run-003',
        platform: 'wechat',
        title: 'Workspace draft',
        draftPath: path.join(variantDir, 'draft.md'),
        imagesDir,
        imageFiles: [],
      }),
      'utf8',
    )

    const variants = listContentDraftVariants()
    assert.equal(variants.length, 1)
    assert.equal(variants[0]?.id, 'run-003:wechat')
    assert.equal(variants[0]?.draftPath, path.join(variantDir, 'draft.md'))
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
    if (previousWorkspaceDir === undefined) {
      delete process.env.OPENCLAW_WORKSPACE_DIR
    } else {
      process.env.OPENCLAW_WORKSPACE_DIR = previousWorkspaceDir
    }
    fs.rmSync(tempHome, { recursive: true, force: true })
    fs.rmSync(tempWorkspace, { recursive: true, force: true })
  }
})

test('content draft service discovers variants under OPENCLAW_DATA_DIR and OPENCLAW_CONFIG_PATH roots', () => {
  const previousHome = process.env.HOME
  const previousDataDir = process.env.OPENCLAW_DATA_DIR
  const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-home-'))
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-data-'))
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-drafts-config-'))
  const configPath = path.join(tempConfigDir, 'openclaw.json')

  try {
    process.env.HOME = tempHome
    process.env.OPENCLAW_DATA_DIR = tempDataDir
    process.env.OPENCLAW_CONFIG_PATH = configPath

    const dataVariantDir = path.join(tempDataDir, 'workspace', 'content-drafts', 'run-004', 'wechat')
    fs.mkdirSync(path.join(dataVariantDir, 'images'), { recursive: true })
    fs.writeFileSync(path.join(dataVariantDir, 'draft.md'), '# Data dir draft\n', 'utf8')
    fs.writeFileSync(
      path.join(dataVariantDir, 'manifest.json'),
      JSON.stringify({
        runId: 'run-004',
        platform: 'wechat',
        title: 'Data dir draft',
        draftPath: path.join(dataVariantDir, 'draft.md'),
        imagesDir: path.join(dataVariantDir, 'images'),
        imageFiles: [],
      }),
      'utf8',
    )

    const configVariantDir = path.join(tempConfigDir, 'workspace', 'content-drafts', 'run-005', 'xhs')
    fs.mkdirSync(path.join(configVariantDir, 'images'), { recursive: true })
    fs.writeFileSync(path.join(configVariantDir, 'draft.md'), '# Config dir draft\n', 'utf8')
    fs.writeFileSync(
      path.join(configVariantDir, 'manifest.json'),
      JSON.stringify({
        runId: 'run-005',
        platform: 'xhs',
        title: 'Config dir draft',
        draftPath: path.join(configVariantDir, 'draft.md'),
        imagesDir: path.join(configVariantDir, 'images'),
        imageFiles: [],
      }),
      'utf8',
    )

    const variants = listContentDraftVariants()
    const ids = variants.map((variant) => variant.id).sort()
    assert.deepEqual(ids, ['run-004:wechat', 'run-005:xhs'])
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
    if (previousDataDir === undefined) {
      delete process.env.OPENCLAW_DATA_DIR
    } else {
      process.env.OPENCLAW_DATA_DIR = previousDataDir
    }
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath
    }
    fs.rmSync(tempHome, { recursive: true, force: true })
    fs.rmSync(tempDataDir, { recursive: true, force: true })
    fs.rmSync(tempConfigDir, { recursive: true, force: true })
  }
})
