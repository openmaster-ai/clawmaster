import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MAX_CHARS = 40000
const USER_AGENT = 'ClawMaster Content Draft/0.2'
const BLOCK_TAGS = /<\/(?:article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/gi
const OPENING_BLOCK_TAGS = /<(?:article|aside|blockquote|br|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi

function fail(message) {
  throw new Error(message)
}

function parseArgs(argv) {
  const args = {
    json: false,
    maxChars: DEFAULT_MAX_CHARS,
    output: null,
    source: '',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = argv[i + 1]
    switch (token) {
      case '--json':
        args.json = true
        break
      case '--output':
        args.output = next
        i += 1
        break
      case '--max-chars':
        args.maxChars = Number.parseInt(String(next || ''), 10)
        i += 1
        break
      default:
        if (token.startsWith('--')) {
          fail(`Unknown argument: ${token}`)
        }
        if (args.source) {
          fail(`Unexpected extra argument: ${token}`)
        }
        args.source = token
    }
  }

  if (!args.source) {
    fail('Usage: node fetch-url-markdown.mjs <url-or-path> [--json] [--output <file>] [--max-chars <n>]')
  }
  if (!Number.isFinite(args.maxChars) || args.maxChars < 1) {
    fail('Expected --max-chars to be a positive integer')
  }

  return args
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value)
}

function isFileUrl(value) {
  return /^file:\/\//i.test(value)
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = String(entity).toLowerCase()
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return named[lower] ?? match
  })
}

function stripTags(value) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
}

function normalizeInlineText(value) {
  return stripTags(value)
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeMarkdown(value) {
  const normalized = value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized ? `${normalized}\n` : ''
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function truncateMarkdown(markdown, maxChars) {
  if (markdown.length <= maxChars) {
    return { markdown, truncated: false }
  }

  const reserved = '\n\n[Truncated for drafting]\n'
  const limit = Math.max(1, maxChars - reserved.length)
  let clipped = markdown.slice(0, limit)
  const lastParagraphBreak = clipped.lastIndexOf('\n\n')
  if (lastParagraphBreak >= Math.floor(limit * 0.6)) {
    clipped = clipped.slice(0, lastParagraphBreak)
  }
  return {
    markdown: normalizeMarkdown(`${clipped.trimEnd()}${reserved}`),
    truncated: true,
  }
}

function extractAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'))
  return match?.[2] ?? null
}

function extractTagContent(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match?.[1] ?? ''
}

function extractMetaContent(html, name) {
  const metaRegex = /<meta\b[^>]*>/gi
  for (const match of html.match(metaRegex) ?? []) {
    const metaName = extractAttribute(match, 'name') ?? extractAttribute(match, 'property')
    if (!metaName || metaName.toLowerCase() !== name.toLowerCase()) {
      continue
    }
    const content = extractAttribute(match, 'content')
    if (content) {
      return decodeHtmlEntities(content).trim()
    }
  }
  return ''
}

function extractFirstHeading(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  return normalizeInlineText(match?.[1] ?? '')
}

function extractPreferredHtml(html) {
  const article = extractTagContent(html, 'article')
  if (article) {
    return article
  }
  const main = extractTagContent(html, 'main')
  if (main) {
    return main
  }
  const body = extractTagContent(html, 'body')
  return body || html
}

function stripBoilerplateLines(markdown) {
  const skipPatterns = [
    /^copy page$/i,
    /^skip to main content$/i,
    /^search\.\.\.$/i,
    /^navigation$/i,
    /^on this page$/i,
    /^docs by langchain home page/i,
  ]

  const lines = markdown.split('\n').filter((line) => !skipPatterns.some((pattern) => pattern.test(line.trim())))
  return normalizeMarkdown(lines.join('\n'))
}

function absolutizeUrl(baseUrl, rawUrl) {
  if (!rawUrl) {
    return null
  }
  if (!baseUrl) {
    return rawUrl
  }
  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return rawUrl
  }
}

function htmlToMarkdownFallback(html, source) {
  const htmlFragment = extractPreferredHtml(html)
  const articleHeading = extractFirstHeading(htmlFragment) || extractFirstHeading(html)
  const title = articleHeading || normalizeInlineText(extractTagContent(html, 'title'))
  const description = extractMetaContent(html, 'description')
  let body = htmlFragment
  const headingHtmlMatch = body.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)
  if (headingHtmlMatch?.index != null) {
    body = body.slice(headingHtmlMatch.index)
  }

  body = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|canvas)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  body = body.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    const text = stripTags(code).replace(/^\n+|\n+$/g, '')
    return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : '\n\n'
  })

  body = body.replace(/<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, __, href, inner) => {
    const text = normalizeInlineText(inner)
    if (!text) {
      return ''
    }
    const url = absolutizeUrl(isHttpUrl(source) || isFileUrl(source) ? source : null, href)
    if (!url || text === url) {
      return text
    }
    return `[${text}](${url})`
  })

  body = body.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = absolutizeUrl(isHttpUrl(source) || isFileUrl(source) ? source : null, extractAttribute(tag, 'src'))
    const alt = normalizeInlineText(extractAttribute(tag, 'alt') ?? '')
    if (!src && !alt) {
      return ''
    }
    const label = alt || 'image'
    return src ? `\n\n![${label}](${src})\n\n` : `\n\n![${label}]\n\n`
  })

  for (let level = 6; level >= 1; level -= 1) {
    body = body.replace(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi'), (_, inner) => {
      const text = normalizeInlineText(inner)
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '\n\n'
    })
  }

  body = body.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const text = normalizeInlineText(inner)
    if (!text) {
      return '\n\n'
    }
    return `\n\n${text.split(/\n+/).map((line) => `> ${line}`).join('\n')}\n\n`
  })

  body = body.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    const text = normalizeInlineText(inner)
    return text ? `\n- ${text}` : '\n'
  })

  body = body
    .replace(BLOCK_TAGS, '\n\n')
    .replace(OPENING_BLOCK_TAGS, '\n')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
      const text = normalizeInlineText(inner)
      return text ? `\`${text}\`` : ''
    })
    .replace(/<[^>]+>/g, ' ')

  let content = normalizeMarkdown(decodeHtmlEntities(body))
  if (articleHeading) {
    const headingMatch = content.match(new RegExp(`(^|\\n)#\\s+${escapeRegex(articleHeading)}\\s*\\n`, 'i'))
    if (headingMatch?.index != null) {
      content = content.slice(Math.max(0, headingMatch.index)).trimStart()
    }
  }
  if (title) {
    content = content.replace(new RegExp(`^#\\s+${escapeRegex(title)}\\s*\\n+`, 'i'), '')
  }
  content = stripBoilerplateLines(content)
  const headerLines = []
  if (title) {
    headerLines.push(`# ${title}`)
  }
  headerLines.push(`Source: ${source}`)
  if (description) {
    headerLines.push(`> ${description}`)
  }

  return {
    title,
    markdown: normalizeMarkdown(`${headerLines.join('\n\n')}\n\n${content}`),
    description,
    converter: 'builtin-html',
  }
}

function inferFormat(contentType, text, sourcePath) {
  const lowerType = String(contentType || '').toLowerCase()
  const lowerPath = String(sourcePath || '').toLowerCase()
  if (lowerType.includes('text/html') || /<html[\s>]|<body[\s>]|<main[\s>]|<article[\s>]/i.test(text)) {
    return 'html'
  }
  if (
    lowerType.includes('markdown')
    || lowerPath.endsWith('.md')
    || lowerPath.endsWith('.markdown')
    || /^[\t ]{0,3}#{1,6}\s/m.test(text)
  ) {
    return 'markdown'
  }
  return 'text'
}

async function loadSource(source) {
  if (isHttpUrl(source)) {
    const response = await fetch(source, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html, text/markdown, text/plain;q=0.9, */*;q=0.1',
      },
      redirect: 'follow',
    })
    if (!response.ok) {
      fail(`Failed to fetch ${source}: ${response.status} ${response.statusText}`)
    }
    return {
      source,
      contentType: response.headers.get('content-type') || '',
      text: await response.text(),
    }
  }

  const filePath = isFileUrl(source) ? fileURLToPath(source) : path.resolve(source)
  return {
    source: filePath,
    contentType: '',
    text: await fs.readFile(filePath, 'utf8'),
  }
}

export async function extractSourceToMarkdown(source, options = {}) {
  const loaded = await loadSource(source)
  const format = inferFormat(loaded.contentType, loaded.text, loaded.source)

  let title = ''
  let description = ''
  let markdown = ''
  let converter = format

  if (format === 'html') {
    const extracted = htmlToMarkdownFallback(loaded.text, loaded.source)
    title = extracted.title
    description = extracted.description
    markdown = extracted.markdown
    converter = extracted.converter ?? 'html'
  } else {
    markdown = normalizeMarkdown(loaded.text)
    if (format === 'markdown') {
      const heading = markdown.match(/^\s*#\s+(.+)$/m)
      title = heading?.[1]?.trim() ?? ''
    } else {
      title = path.basename(loaded.source)
    }
  }

  const limited = truncateMarkdown(markdown, options.maxChars ?? DEFAULT_MAX_CHARS)

  return {
    source: loaded.source,
    contentType: loaded.contentType,
    format,
    title,
    description,
    markdown: limited.markdown,
    truncated: limited.truncated,
    characterCount: limited.markdown.length,
    converter,
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const payload = await extractSourceToMarkdown(args.source, { maxChars: args.maxChars })

  if (args.output) {
    const outputPath = path.resolve(args.output)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, payload.markdown, 'utf8')
    payload.outputPath = outputPath
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }

  process.stdout.write(payload.markdown)
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
const modulePath = fileURLToPath(import.meta.url)

if (entryPath === modulePath) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
