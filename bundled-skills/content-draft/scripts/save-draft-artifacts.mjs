import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'draft'
}

function timestampId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('')
}

function parseArgs(argv) {
  const args = {
    images: [],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = argv[i + 1]
    switch (token) {
      case '--platform':
        args.platform = next
        i += 1
        break
      case '--title':
        args.title = next
        i += 1
        break
      case '--source-url':
        args.sourceUrl = next
        i += 1
        break
      case '--run-id':
        args.runId = next
        i += 1
        break
      case '--root':
        args.root = next
        i += 1
        break
      case '--markdown-file':
        args.markdownFile = next
        i += 1
        break
      case '--markdown':
        args.markdown = next
        i += 1
        break
      case '--image':
        args.images.push(next)
        i += 1
        break
      case '--images-dir':
        args.imagesDir = next
        i += 1
        break
      case '--slug':
        args.slug = next
        i += 1
        break
      default:
        fail(`Unknown argument: ${token}`)
    }
  }

  return args
}

function defaultOutputRoot() {
  const workspaceDir = process.env['OPENCLAW_WORKSPACE_DIR']?.trim()
  if (workspaceDir) {
    return path.join(workspaceDir, 'content-drafts')
  }
  const dataDir = process.env['OPENCLAW_DATA_DIR']?.trim()
  if (dataDir) {
    return path.join(dataDir, 'workspace', 'content-drafts')
  }
  const configPath = process.env['OPENCLAW_CONFIG_PATH']?.trim()
  if (configPath) {
    return path.join(path.dirname(configPath), 'workspace', 'content-drafts')
  }
  return path.join(os.homedir(), '.openclaw', 'workspace', 'content-drafts')
}

function resolveMarkdown(args) {
  if (args.markdownFile) {
    return fs.readFileSync(path.resolve(args.markdownFile), 'utf8')
  }
  if (typeof args.markdown === 'string') {
    return args.markdown
  }
  fail('Provide --markdown-file or --markdown')
}

function collectImagePaths(args) {
  const files = []
  for (const imagePath of args.images) {
    if (!imagePath) continue
    const resolved = path.resolve(imagePath)
    if (!fs.existsSync(resolved)) {
      fail(`Image file not found: ${resolved}`)
    }
    files.push(resolved)
  }

  if (args.imagesDir) {
    const resolvedDir = path.resolve(args.imagesDir)
    if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
      fail(`Images directory not found: ${resolvedDir}`)
    }
    for (const entry of fs.readdirSync(resolvedDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      files.push(path.join(resolvedDir, entry.name))
    }
  }

  return files
}

function allocateUniqueImageFileName(imagesDir, sourcePath, usedNames) {
  const parsed = path.parse(path.basename(sourcePath))
  const baseName = parsed.name || 'image'
  const extension = parsed.ext || ''
  let candidate = `${baseName}${extension}`
  let index = 2

  while (usedNames.has(candidate) || fs.existsSync(path.join(imagesDir, candidate))) {
    candidate = `${baseName}-${index}${extension}`
    index += 1
  }

  usedNames.add(candidate)
  return candidate
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const platform = String(args.platform || '').trim().toLowerCase()
  if (!platform) {
    fail('Missing required --platform')
  }

  const title = String(args.title || '').trim()
  const slug = slugify(args.slug || title || platform)
  const runId = String(args.runId || `${timestampId()}-${slug}`).trim()
  const root = path.resolve(args.root || defaultOutputRoot())
  const platformDir = path.join(root, runId, platform)
  const imagesDir = path.join(platformDir, 'images')
  const draftPath = path.join(platformDir, 'draft.md')
  const manifestPath = path.join(platformDir, 'manifest.json')

  fs.mkdirSync(imagesDir, { recursive: true })

  const markdown = resolveMarkdown(args)
  fs.writeFileSync(draftPath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8')

  const imageFiles = []
  const usedImageFileNames = new Set()
  for (const sourcePath of collectImagePaths(args)) {
    const fileName = allocateUniqueImageFileName(imagesDir, sourcePath, usedImageFileNames)
    fs.copyFileSync(sourcePath, path.join(imagesDir, fileName))
    imageFiles.push(fileName)
  }

  const manifest = {
    runId,
    platform,
    title: title || null,
    slug,
    sourceUrl: args.sourceUrl || null,
    draftPath,
    imagesDir,
    imageFiles,
    savedAt: new Date().toISOString(),
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath }, null, 2)}\n`)
}

main()
