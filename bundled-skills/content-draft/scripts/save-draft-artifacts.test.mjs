import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { saveDraftArtifacts } from './save-draft-artifacts.mjs'

test('saveDraftArtifacts preserves semantic image linkage through slots and metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-draft-save-'))
  const draftPath = path.join(root, 'draft.md')
  const heroPath = path.join(root, 'hero---123.png')
  const architecturePath = path.join(root, 'architecture---456.png')
  const metaPath = path.join(root, 'image-meta.json')

  try {
    fs.writeFileSync(
      draftPath,
      [
        '# Example',
        '',
        `![Lead](images/${path.basename(heroPath)})`,
        '',
        `![Architecture](./images/${path.basename(architecturePath)})`,
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(heroPath, 'hero', 'utf8')
    fs.writeFileSync(architecturePath, 'architecture', 'utf8')
    fs.writeFileSync(
      metaPath,
      `${JSON.stringify({
        images: [
          {
            sourcePath: architecturePath,
            role: 'architecture',
            section: 'Three-layer architecture',
            anchor: 'three-layer-architecture',
            caption: 'Architecture figure',
            generator: 'ernie-image',
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    )

    const result = saveDraftArtifacts({
      platform: 'wechat',
      title: 'Deep Agents Review',
      slug: 'deep-agents-review',
      root,
      markdownFile: draftPath,
      imageSlots: [
        {
          role: 'hero',
          sourcePath: heroPath,
        },
      ],
      images: [],
      imagesDir: null,
      imageMetaFile: metaPath,
    })

    assert.equal(result.imageFiles.length, 2)
    assert.deepEqual(result.imageFiles, [
      'hero.png',
      '02-architecture-three-layer-architecture.png',
    ])
    assert.equal(result.images[0].role, 'hero')
    assert.equal(result.images[1].anchor, 'three-layer-architecture')
    assert.equal(result.imageLinking.linkedCount, 2)

    const savedDraft = fs.readFileSync(result.draftPath, 'utf8')
    assert.match(savedDraft, /images\/hero\.png/)
    assert.match(savedDraft, /images\/02-architecture-three-layer-architecture\.png/)

    const savedManifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))
    assert.equal(savedManifest.images[0].originalFileName, 'hero---123.png')
    assert.equal(savedManifest.images[1].section, 'Three-layer architecture')
    assert.ok(fs.existsSync(path.join(result.imagesDir, 'hero.png')))
    assert.ok(fs.existsSync(path.join(result.imagesDir, '02-architecture-three-layer-architecture.png')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('saveDraftArtifacts rewrites absolute scratch paths to saved image paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-draft-save-'))
  const draftPath = path.join(root, 'draft.md')
  const sourceDir = path.join(root, 'tool-image-generation')
  const heroPath = path.join(sourceDir, 'hero-deep-agents-architecture---5e2051cd.png')
  const architecturePath = path.join(sourceDir, 'multi-agent-architecture---f93ab411.png')

  try {
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(
      draftPath,
      [
        '# Example',
        '',
        `![Hero](${heroPath})`,
        '',
        `<img src="${architecturePath}" alt="Architecture" />`,
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(heroPath, 'hero', 'utf8')
    fs.writeFileSync(architecturePath, 'architecture', 'utf8')

    const result = saveDraftArtifacts({
      platform: 'wechat',
      title: 'LangChain Deep Agents',
      slug: 'langchain-deep-agents',
      root,
      markdownFile: draftPath,
      imageSlots: [
        {
          role: 'hero',
          sourcePath: heroPath,
        },
        {
          role: 'architecture',
          sourcePath: architecturePath,
        },
      ],
      images: [],
      imagesDir: null,
    })

    const savedDraft = fs.readFileSync(result.draftPath, 'utf8')
    assert.match(savedDraft, /!\[Hero]\(images\/hero\.png\)/)
    assert.match(savedDraft, /<img src="images\/architecture\.png" alt="Architecture" \/>/)
    assert.doesNotMatch(savedDraft, /tool-image-generation/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('saveDraftArtifacts rewrites unmatched inline refs in slot order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-draft-save-'))
  const draftPath = path.join(root, 'draft.md')
  const sourceDir = path.join(root, 'tool-image-generation')
  const heroPath = path.join(sourceDir, 'hero-deep-agents-architecture---5e2051cd.png')
  const architecturePath = path.join(sourceDir, 'architecture-filesystem---f93ab411.png')
  const decisionPath = path.join(sourceDir, 'decision-when-to-use---ab12cd34.png')

  try {
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(
      draftPath,
      [
        '# Example',
        '',
        '![Hero](01-hero-agent-framework.png)',
        '',
        '![Architecture](02-architecture-filesystem.png)',
        '',
        '![Decision](03-decision-when-to-use.png)',
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(heroPath, 'hero', 'utf8')
    fs.writeFileSync(architecturePath, 'architecture', 'utf8')
    fs.writeFileSync(decisionPath, 'decision', 'utf8')

    const result = saveDraftArtifacts({
      platform: 'wechat',
      title: 'LangChain Deep Agents',
      slug: 'langchain-deep-agents',
      root,
      markdownFile: draftPath,
      imageSlots: [
        {
          role: 'hero',
          sourcePath: heroPath,
        },
        {
          role: 'architecture',
          sourcePath: architecturePath,
        },
        {
          role: 'decision',
          sourcePath: decisionPath,
        },
      ],
      images: [],
      imagesDir: null,
    })

    const savedDraft = fs.readFileSync(result.draftPath, 'utf8')
    assert.match(savedDraft, /!\[Hero]\(images\/hero\.png\)/)
    assert.match(savedDraft, /!\[Architecture]\(images\/architecture\.png\)/)
    assert.match(savedDraft, /!\[Decision]\(images\/decision\.png\)/)
    assert.doesNotMatch(savedDraft, /01-hero-agent-framework\.png/)
    assert.doesNotMatch(savedDraft, /02-architecture-filesystem\.png/)
    assert.doesNotMatch(savedDraft, /03-decision-when-to-use\.png/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('saveDraftArtifacts fails when a declared slot is still unreferenced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-draft-save-'))
  const draftPath = path.join(root, 'draft.md')
  const sourceDir = path.join(root, 'tool-image-generation')
  const heroPath = path.join(sourceDir, 'hero-deep-agents-architecture---5e2051cd.png')
  const architecturePath = path.join(sourceDir, 'architecture-filesystem---f93ab411.png')
  const contextPath = path.join(sourceDir, 'context-window---ab12cd34.png')

  try {
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.writeFileSync(
      draftPath,
      [
        '# Example',
        '',
        '![Hero](01-hero-agent-framework.png)',
        '',
        '![Architecture](02-architecture-filesystem.png)',
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(heroPath, 'hero', 'utf8')
    fs.writeFileSync(architecturePath, 'architecture', 'utf8')
    fs.writeFileSync(contextPath, 'context', 'utf8')

    assert.throws(
      () => saveDraftArtifacts({
        platform: 'wechat',
        title: 'LangChain Deep Agents',
        slug: 'langchain-deep-agents',
        root,
        markdownFile: draftPath,
        imageSlots: [
          {
            role: 'hero',
            sourcePath: heroPath,
          },
          {
            role: 'architecture',
            sourcePath: architecturePath,
          },
          {
            role: 'context',
            sourcePath: contextPath,
          },
        ],
        images: [],
        imagesDir: null,
      }),
      /Unreferenced image slots: context/,
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
