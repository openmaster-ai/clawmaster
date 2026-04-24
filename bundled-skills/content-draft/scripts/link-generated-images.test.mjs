import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { linkGeneratedImages } from './link-generated-images.mjs'

test('linkGeneratedImages renames saved images, rewrites draft refs, and stores linkage metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-draft-image-link-'))
  const platformDir = path.join(root, 'wechat')
  const imagesDir = path.join(platformDir, 'images')
  fs.mkdirSync(imagesDir, { recursive: true })

  const draftPath = path.join(platformDir, 'draft.md')
  const manifestPath = path.join(platformDir, 'manifest.json')
  const firstImage = 'hero---abc123.png'
  const secondImage = 'detail---def456.png'

  try {
    fs.writeFileSync(path.join(imagesDir, firstImage), 'hero', 'utf8')
    fs.writeFileSync(path.join(imagesDir, secondImage), 'detail', 'utf8')
    fs.writeFileSync(
      draftPath,
      [
        '# Example',
        '',
        `![Lead image](images/${firstImage})`,
        '',
        `![Architecture](./images/${secondImage})`,
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({
        runId: '20260424-example',
        platform: 'wechat',
        title: 'Example',
        slug: 'example',
        draftPath,
        imagesDir,
        imageFiles: [firstImage, secondImage],
      }, null, 2)}\n`,
      'utf8',
    )

    const linksPath = path.join(root, 'links.json')
    fs.writeFileSync(
      linksPath,
      `${JSON.stringify({
        articleSlug: 'deep-agents',
        images: [
          {
            match: firstImage,
            role: 'hero',
            section: 'Problem Background',
            anchor: 'problem-background',
            caption: 'Lead image',
            prompt: 'Prompt A',
            generator: 'ernie-image',
          },
          {
            match: secondImage,
            role: 'architecture',
            section: 'Three-layer architecture',
            anchor: 'architecture',
            caption: 'Architecture view',
            prompt: 'Prompt B',
            generator: 'ernie-image',
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    )

    const summary = linkGeneratedImages({
      manifestFile: manifestPath,
      linksFile: linksPath,
    })

    assert.equal(summary.linkedCount, 2)
    assert.equal(summary.totalImageCount, 2)
    assert.deepEqual(summary.imageFiles, [
      '01-hero-problem-background.png',
      '02-architecture-architecture.png',
    ])

    const nextDraft = fs.readFileSync(draftPath, 'utf8')
    assert.match(nextDraft, /images\/01-hero-problem-background\.png/)
    assert.match(nextDraft, /images\/02-architecture-architecture\.png/)

    const nextManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.equal(nextManifest.imageLinking.linkedCount, 2)
    assert.equal(nextManifest.images[0].originalFileName, firstImage)
    assert.equal(nextManifest.images[0].role, 'hero')
    assert.equal(nextManifest.images[0].anchor, 'problem-background')
    assert.equal(nextManifest.images[1].fileName, '02-architecture-architecture.png')

    assert.ok(fs.existsSync(path.join(imagesDir, '01-hero-problem-background.png')))
    assert.ok(fs.existsSync(path.join(imagesDir, '02-architecture-architecture.png')))
    assert.ok(!fs.existsSync(path.join(imagesDir, firstImage)))
    assert.ok(!fs.existsSync(path.join(imagesDir, secondImage)))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
