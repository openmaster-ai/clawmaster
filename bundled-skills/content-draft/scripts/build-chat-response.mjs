import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    images: [],
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = argv[i + 1]
    switch (token) {
      case '--markdown-file':
        args.markdownFile = next
        i += 1
        break
      case '--images-dir':
        args.imagesDir = next
        i += 1
        break
      case '--image':
        args.images.push(next)
        i += 1
        break
      case '--json':
        args.json = true
        break
      default:
        fail(`Unknown argument: ${token}`)
    }
  }

  if (!args.markdownFile) {
    fail('Missing required --markdown-file')
  }

  return args
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function normalizeRef(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[?#].*$/, '')
    .replace(/^\.?\//, '')
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

  return [...new Set(files)]
}

function buildImageLookup(imagePaths) {
  const lookup = new Map()

  for (const imagePath of imagePaths) {
    const fileName = path.basename(imagePath)
    const payload = {
      name: fileName,
      path: imagePath,
      mimeType: inferMimeType(imagePath),
    }

    for (const key of [fileName, `images/${fileName}`].map(normalizeRef)) {
      lookup.set(key, payload)
    }
  }

  return lookup
}

function buildChatResponse(markdown, imageLookup) {
  const referenced = new Set()
  let output = markdown.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (full, alt, target) => {
    const image = imageLookup.get(normalizeRef(target))
    if (!image) return full
    referenced.add(image.name)
    const caption = String(alt || '').trim()
    return caption ? `*${caption}*\n\nMEDIA:${image.path}` : `MEDIA:${image.path}`
  })

  output = output.replace(/<img\b([^>]*)src=(['"])(.*?)\2([^>]*)>/gi, (full, before, quote, target, after) => {
    const image = imageLookup.get(normalizeRef(target))
    if (!image) return full
    referenced.add(image.name)
    return `MEDIA:${image.path}`
  })

  const extras = [...new Set([...imageLookup.values()].map((image) => image.name))]
    .filter((name) => !referenced.has(name))
    .map((name) => imageLookup.get(name))
    .filter(Boolean)

  if (extras.length > 0) {
    const extraBlock = [
      '',
      '',
      '## Generated Images',
      '',
      ...extras.flatMap((image) => [`MEDIA:${image.path}`, '']),
    ].join('\n')
    output = `${output.replace(/\s+$/, '')}${extraBlock}`
  }

  return {
    markdown: output.endsWith('\n') ? output : `${output}\n`,
    embeddedImageCount: referenced.size,
    appendedImageCount: extras.length,
    totalImageCount: [...new Set([...imageLookup.values()].map((image) => image.name))].length,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const markdownPath = path.resolve(args.markdownFile)
  const markdown = fs.readFileSync(markdownPath, 'utf8')
  const imageLookup = buildImageLookup(collectImagePaths(args))
  const response = buildChatResponse(markdown, imageLookup)

  if (args.json) {
    process.stdout.write(`${JSON.stringify({
      markdown: response.markdown,
      embeddedImageCount: response.embeddedImageCount,
      appendedImageCount: response.appendedImageCount,
      totalImageCount: response.totalImageCount,
    }, null, 2)}\n`)
    return
  }

  process.stdout.write(response.markdown)
}

main()
