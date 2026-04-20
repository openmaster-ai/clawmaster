import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { installBundledSkill, isBundledSkillSlug } from './bundledSkills.js'

test('isBundledSkillSlug recognizes bundled skill ids case-insensitively', () => {
  assert.equal(isBundledSkillSlug('content-draft'), true)
  assert.equal(isBundledSkillSlug('CONTENT-DRAFT'), true)
  assert.equal(isBundledSkillSlug('ernie-image'), true)
  assert.equal(isBundledSkillSlug('ERNIE-IMAGE'), true)
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

test('installBundledSkill copies the bundled Content Draft skill into the active workspace', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-src-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-bundled-skill-data-'))
  fs.mkdirSync(path.join(sourceRoot, 'references'), { recursive: true })
  fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), '# Content Draft\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, '_meta.json'), '{"slug":"content-draft","version":"0.1.0"}\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'references', 'platforms.md'), 'xhs\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'build-chat-response.mjs'), 'console.log("reply")\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'fetch-url-markdown.mjs'), 'console.log("fetch")\n', 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'scripts', 'save-draft-artifacts.mjs'), 'console.log("save")\n', 'utf8')

  const result = installBundledSkill('content-draft', {
    dataDir,
    env: {
      ...process.env,
      CLAWMASTER_BUNDLED_CONTENT_DRAFT_SKILL_ROOT: sourceRoot,
    },
  })

  const installDir = path.join(dataDir, 'workspace', 'skills', 'content-draft')
  assert.equal(result.installDir, installDir)
  assert.equal(fs.readFileSync(path.join(installDir, 'SKILL.md'), 'utf8'), '# Content Draft\n')
  assert.equal(
    fs.readFileSync(path.join(installDir, '_meta.json'), 'utf8'),
    '{"slug":"content-draft","version":"0.1.0"}\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'references', 'platforms.md'), 'utf8'),
    'xhs\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'scripts', 'build-chat-response.mjs'), 'utf8'),
    'console.log("reply")\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'scripts', 'fetch-url-markdown.mjs'), 'utf8'),
    'console.log("fetch")\n',
  )
  assert.equal(
    fs.readFileSync(path.join(installDir, 'scripts', 'save-draft-artifacts.mjs'), 'utf8'),
    'console.log("save")\n',
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

test('bundled Content Draft skill explicitly keeps article drafting on the repo-owned Node workflow', () => {
  const skillPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/content-draft/SKILL.md',
  )
  const skillBody = fs.readFileSync(skillPath, 'utf8')

  assert.match(skillBody, /Do not delegate this workflow to `baoyu-\*` skills or any Bun-based helper\./)
  assert.match(skillBody, /prefer this skill over `baoyu-article-illustrator` and `baoyu-post-to-wechat`/i)
  assert.match(skillBody, /prefer the repo-owned `ernie-image` skill when it is available/i)
  assert.match(skillBody, /node \$\{SKILL_DIR\}\/scripts\/fetch-url-markdown\.mjs/)
  assert.match(skillBody, /node \$\{SKILL_DIR\}\/scripts\/build-chat-response\.mjs/)
  assert.match(skillBody, /runtime's built-in image generation capability/i)
  assert.match(skillBody, /Return the full final draft body plus the generated images in the same reply\./)
})

test('bundled Content Draft helper saves markdown and image artifacts into the standard layout', () => {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/content-draft/scripts/save-draft-artifacts.mjs',
  )
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-draft-'))
  const outputRoot = path.join(tempRoot, 'out')
  const markdownPath = path.join(tempRoot, 'draft.md')
  const imagePath = path.join(tempRoot, 'cover.png')

  fs.writeFileSync(markdownPath, '# Hello\n', 'utf8')
  fs.writeFileSync(imagePath, 'png', 'utf8')

  const raw = execFileSync(
    process.execPath,
    [
      scriptPath,
      '--platform', 'xhs',
      '--title', 'Hello World',
      '--run-id', 'demo-run',
      '--root', outputRoot,
      '--markdown-file', markdownPath,
      '--image', imagePath,
    ],
    { encoding: 'utf8' },
  )

  const payload = JSON.parse(raw) as {
    draftPath: string
    manifestPath: string
    imagesDir: string
    imageFiles: string[]
    platform: string
    runId: string
  }

  assert.equal(payload.platform, 'xhs')
  assert.equal(payload.runId, 'demo-run')
  assert.deepEqual(payload.imageFiles, ['cover.png'])
  assert.equal(fs.readFileSync(payload.draftPath, 'utf8'), '# Hello\n')
  assert.equal(fs.readFileSync(path.join(payload.imagesDir, 'cover.png'), 'utf8'), 'png')

  const manifest = JSON.parse(fs.readFileSync(payload.manifestPath, 'utf8')) as {
    platform: string
    imageFiles: string[]
  }
  assert.equal(manifest.platform, 'xhs')
  assert.deepEqual(manifest.imageFiles, ['cover.png'])
})

test('bundled Content Draft helper preserves images that share the same basename', () => {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/content-draft/scripts/save-draft-artifacts.mjs',
  )
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-draft-collision-'))
  const outputRoot = path.join(tempRoot, 'out')
  const markdownPath = path.join(tempRoot, 'draft.md')
  const imageDirA = path.join(tempRoot, 'images-a')
  const imageDirB = path.join(tempRoot, 'images-b')
  const imagePathA = path.join(imageDirA, 'cover.png')
  const imagePathB = path.join(imageDirB, 'cover.png')

  fs.mkdirSync(imageDirA, { recursive: true })
  fs.mkdirSync(imageDirB, { recursive: true })
  fs.writeFileSync(markdownPath, '# Hello\n', 'utf8')
  fs.writeFileSync(imagePathA, 'first-image', 'utf8')
  fs.writeFileSync(imagePathB, 'second-image', 'utf8')

  const raw = execFileSync(
    process.execPath,
    [
      scriptPath,
      '--platform', 'wechat',
      '--title', 'Collision Demo',
      '--run-id', 'collision-run',
      '--root', outputRoot,
      '--markdown-file', markdownPath,
      '--image', imagePathA,
      '--image', imagePathB,
    ],
    { encoding: 'utf8' },
  )

  const payload = JSON.parse(raw) as {
    imagesDir: string
    imageFiles: string[]
  }

  assert.equal(payload.imageFiles.length, 2)
  assert.notEqual(payload.imageFiles[0], payload.imageFiles[1])
  assert.deepEqual(
    payload.imageFiles.map((fileName) => fs.readFileSync(path.join(payload.imagesDir, fileName), 'utf8')).sort(),
    ['first-image', 'second-image'],
  )
})

test('bundled Content Draft fetch helper extracts local HTML into markdown', () => {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/content-draft/scripts/fetch-url-markdown.mjs',
  )
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-draft-fetch-'))
  const htmlPath = path.join(tempRoot, 'article.html')
  const outputPath = path.join(tempRoot, 'article.md')

  fs.writeFileSync(
    htmlPath,
    [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<title>LangChain Products</title>',
      '<meta name="description" content="Product concepts overview.">',
      '</head>',
      '<body>',
      '<main>',
      '<h1>Products</h1>',
      '<p>Products help teams ship faster.</p>',
      '<h2>Why it matters</h2>',
      '<ul><li>Clarity</li><li>Reuse</li></ul>',
      '<p>Read the <a href="https://docs.langchain.com/">docs</a>.</p>',
      '</main>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
    'utf8',
  )

  const raw = execFileSync(
    process.execPath,
    [scriptPath, htmlPath, '--json', '--output', outputPath, '--max-chars', '5000'],
    { encoding: 'utf8' },
  )

  const payload = JSON.parse(raw) as {
    format: string
    title: string
    markdown: string
    truncated: boolean
    outputPath: string
  }

  assert.equal(payload.format, 'html')
  assert.equal(payload.title, 'Products')
  assert.equal(payload.truncated, false)
  assert.equal(payload.outputPath, outputPath)
  assert.match(payload.markdown, /^# Products/m)
  assert.match(payload.markdown, /Source: /)
  assert.match(payload.markdown, /## Why it matters/)
  assert.match(payload.markdown, /(?:-|\*) Clarity/)
  assert.match(payload.markdown, /\[docs\]\(https:\/\/docs\.langchain\.com\/\)/)
  assert.equal(fs.readFileSync(outputPath, 'utf8'), payload.markdown)
})

test('bundled Content Draft chat-response helper rewrites local image refs and appends extra images', () => {
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../bundled-skills/content-draft/scripts/build-chat-response.mjs',
  )
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmaster-content-draft-chat-'))
  const markdownPath = path.join(tempRoot, 'draft.md')
  const imagesDir = path.join(tempRoot, 'images')

  fs.mkdirSync(imagesDir, { recursive: true })
  fs.writeFileSync(
    markdownPath,
    [
      '# Weekly digest',
      '',
      '![Hero](images/cover.png)',
      '',
      'More text.',
      '',
    ].join('\n'),
    'utf8',
  )
  fs.writeFileSync(path.join(imagesDir, 'cover.png'), 'png', 'utf8')
  fs.writeFileSync(path.join(imagesDir, 'extra.webp'), 'webp', 'utf8')

  const raw = execFileSync(
    process.execPath,
    [scriptPath, '--markdown-file', markdownPath, '--images-dir', imagesDir, '--json'],
    { encoding: 'utf8' },
  )

  const payload = JSON.parse(raw) as {
    markdown: string
    embeddedImageCount: number
    appendedImageCount: number
    totalImageCount: number
  }

  assert.equal(payload.embeddedImageCount, 1)
  assert.equal(payload.appendedImageCount, 1)
  assert.equal(payload.totalImageCount, 2)
  assert.match(payload.markdown, /\*Hero\*\n\nMEDIA:.*cover\.png/)
  assert.match(payload.markdown, /## Generated Images/)
  assert.match(payload.markdown, /MEDIA:.*extra\.webp/)
})
