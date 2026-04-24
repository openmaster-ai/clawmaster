import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = argv[i + 1]
    switch (token) {
      case '--manifest-file':
        args.manifestFile = next
        i += 1
        break
      case '--platform-dir':
        args.platformDir = next
        i += 1
        break
      case '--links-file':
        args.linksFile = next
        i += 1
        break
      case '--article-slug':
        args.articleSlug = next
        i += 1
        break
      default:
        fail(`Unknown argument: ${token}`)
    }
  }

  if (!args.manifestFile && !args.platformDir) {
    fail('Provide --manifest-file or --platform-dir')
  }
  if (!args.linksFile) {
    fail('Missing required --links-file')
  }

  return args
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function padIndex(index) {
  return String(index + 1).padStart(2, '0')
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`Failed to read JSON from ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function resolveManifestPath(args) {
  if (args.manifestFile) {
    return path.resolve(args.manifestFile)
  }
  return path.resolve(args.platformDir, 'manifest.json')
}

function normalizeLinkEntries(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && Array.isArray(raw.images)) return raw.images
  fail('Links file must be a JSON array or an object with an "images" array')
}

function normalizeMatchCandidates(entry) {
  return [
    entry.match,
    entry.fileName,
    entry.sourcePath ? path.basename(entry.sourcePath) : undefined,
    entry.originalFileName,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => String(value).trim())
}

function findLinkEntry(fileName, linkEntries) {
  for (const entry of linkEntries) {
    if (!entry || typeof entry !== 'object') continue
    const candidates = normalizeMatchCandidates(entry)
    if (candidates.includes(fileName)) {
      return entry
    }
  }
  return null
}

function allocateTargetFileName(imagesDir, originalFileName, linkEntry, usedNames, index, articleSlug) {
  const parsed = path.parse(originalFileName)
  const role = slugify(linkEntry?.role) || 'image'
  const section =
    slugify(linkEntry?.anchor)
    || slugify(linkEntry?.section)
    || slugify(linkEntry?.caption)
    || slugify(articleSlug)
    || slugify(parsed.name)
    || 'article'
  const preferred =
    slugify(linkEntry?.preferredName)
    || `${padIndex(index)}-${role}-${section}`.replace(/-+/g, '-')
  const extension = parsed.ext || ''

  let candidate = `${preferred}${extension}`
  let collisionIndex = 2
  while (usedNames.has(candidate) || fs.existsSync(path.join(imagesDir, candidate))) {
    candidate = `${preferred}-${collisionIndex}${extension}`
    collisionIndex += 1
  }

  usedNames.add(candidate)
  return candidate
}

function replaceDraftRefs(markdown, oldName, newName) {
  if (oldName === newName) return markdown

  const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const directPatterns = [
    [new RegExp(`(]\\()((?:\\.\\/)?images\\/${escapedOld})(\\))`, 'g'), `$1images/${newName}$3`],
    [new RegExp(`(]\\()(${escapedOld})(\\))`, 'g'), `$1images/${newName}$3`],
    [new RegExp(`(<img\\b[^>]*src=(['"]))((?:\\.\\/)?images\\/${escapedOld})(\\2)`, 'gi'), `$1images/${newName}$4`],
    [new RegExp(`(<img\\b[^>]*src=(['"]))(${escapedOld})(\\2)`, 'gi'), `$1images/${newName}$4`],
  ]

  let next = markdown
  for (const [pattern, replacement] of directPatterns) {
    next = next.replace(pattern, replacement)
  }
  return next
}

function buildImageMetadata(fileName, targetFileName, linkEntry) {
  return {
    fileName: targetFileName,
    originalFileName: fileName,
    role: typeof linkEntry?.role === 'string' ? linkEntry.role : null,
    section: typeof linkEntry?.section === 'string' ? linkEntry.section : null,
    anchor: typeof linkEntry?.anchor === 'string' ? linkEntry.anchor : null,
    caption: typeof linkEntry?.caption === 'string' ? linkEntry.caption : null,
    prompt: typeof linkEntry?.prompt === 'string' ? linkEntry.prompt : null,
    generator: typeof linkEntry?.generator === 'string' ? linkEntry.generator : null,
    sourcePath: typeof linkEntry?.sourcePath === 'string' ? linkEntry.sourcePath : null,
    linked: Boolean(linkEntry),
  }
}

export function linkGeneratedImages({
  manifestFile,
  linksFile,
  articleSlug,
}) {
  const resolvedManifestPath = path.resolve(manifestFile)
  const manifest = readJsonFile(resolvedManifestPath)
  const rawLinks = readJsonFile(path.resolve(linksFile))
  const linkEntries = normalizeLinkEntries(rawLinks)
  const inheritedArticleSlug =
    slugify(articleSlug)
    || slugify(rawLinks?.articleSlug)
    || slugify(manifest.slug)
    || slugify(manifest.title)

  const imagesDir = path.resolve(manifest.imagesDir || path.join(path.dirname(resolvedManifestPath), 'images'))
  const draftPath = path.resolve(manifest.draftPath || path.join(path.dirname(resolvedManifestPath), 'draft.md'))
  const imageFiles = Array.isArray(manifest.imageFiles) ? manifest.imageFiles.map((item) => String(item)) : []

  if (!fs.existsSync(imagesDir) || !fs.statSync(imagesDir).isDirectory()) {
    fail(`Images directory not found: ${imagesDir}`)
  }
  if (!fs.existsSync(draftPath)) {
    fail(`Draft markdown not found: ${draftPath}`)
  }

  let markdown = fs.readFileSync(draftPath, 'utf8')
  const usedNames = new Set()
  const nextImageFiles = []
  const imageMetadata = []
  const renamed = []

  for (let index = 0; index < imageFiles.length; index += 1) {
    const fileName = imageFiles[index]
    const currentPath = path.join(imagesDir, fileName)
    if (!fs.existsSync(currentPath)) continue

    const linkEntry = findLinkEntry(fileName, linkEntries)
    const targetFileName = linkEntry
      ? allocateTargetFileName(imagesDir, fileName, linkEntry, usedNames, index, inheritedArticleSlug)
      : allocateTargetFileName(imagesDir, fileName, null, usedNames, index, inheritedArticleSlug)
    const targetPath = path.join(imagesDir, targetFileName)

    if (fileName !== targetFileName) {
      fs.renameSync(currentPath, targetPath)
      markdown = replaceDraftRefs(markdown, fileName, targetFileName)
      renamed.push({ from: fileName, to: targetFileName })
    }

    nextImageFiles.push(targetFileName)
    imageMetadata.push(buildImageMetadata(fileName, targetFileName, linkEntry))
  }

  fs.writeFileSync(draftPath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8')

  const nextManifest = {
    ...manifest,
    imageFiles: nextImageFiles,
    images: imageMetadata,
    imageLinking: {
      articleSlug: inheritedArticleSlug || null,
      linkedAt: new Date().toISOString(),
      linkedCount: imageMetadata.filter((item) => item.linked).length,
      totalImageCount: imageMetadata.length,
    },
  }

  fs.writeFileSync(resolvedManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')

  return {
    manifestPath: resolvedManifestPath,
    draftPath,
    imagesDir,
    imageFiles: nextImageFiles,
    renamed,
    linkedCount: nextManifest.imageLinking.linkedCount,
    totalImageCount: nextManifest.imageLinking.totalImageCount,
    articleSlug: nextManifest.imageLinking.articleSlug,
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const summary = linkGeneratedImages({
    manifestFile: resolveManifestPath(args),
    linksFile: args.linksFile,
    articleSlug: args.articleSlug,
  })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
