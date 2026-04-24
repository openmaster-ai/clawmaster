import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Link as LinkIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import type { ContentDraftImageFile, ContentDraftVariantSummary } from '@/lib/types'
import {
  deleteContentDraftVariantResult,
  getContentDraftVariantsResult,
  readContentDraftImageResult,
  readContentDraftTextResult,
} from '@/shared/adapters/contentDrafts'
import { ActionBanner } from '@/shared/components/ActionBanner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { LoadingState } from '@/shared/components/LoadingState'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'

interface DraftImagePreview {
  name: string
  src: string
  mimeType: string
}

interface DraftVariantDetail {
  draftContent: string
  images: DraftImagePreview[]
}

interface DraftImageDialogState {
  variantId: string
  variantTitle: string
  image: DraftImagePreview
}

function headingClassName(level: number): string {
  switch (level) {
    case 1:
      return 'text-3xl font-semibold tracking-tight text-foreground'
    case 2:
      return 'text-2xl font-semibold tracking-tight text-foreground'
    case 3:
      return 'text-xl font-semibold tracking-tight text-foreground'
    case 4:
      return 'text-lg font-semibold tracking-tight text-foreground'
    default:
      return 'text-base font-semibold tracking-tight text-foreground'
  }
}

function formatSavedAt(value: string | null, fallback: string): string {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function platformLabel(platform: string, t: (key: string) => string): string {
  if (platform === 'xhs') return t('contentDrafts.platform.xhs')
  if (platform === 'wechat') return t('contentDrafts.platform.wechat')
  return platform
}

function joinFilePath(dir: string, fileName: string): string {
  if (!dir) return fileName
  if (dir.endsWith('/') || dir.endsWith('\\')) return `${dir}${fileName}`
  return `${dir}${dir.includes('\\') ? '\\' : '/'}${fileName}`
}

function imageFileToObjectUrl(file: ContentDraftImageFile): string {
  const binary = atob(file.base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const blob = new Blob([bytes], { type: file.mimeType })
  return URL.createObjectURL(blob)
}

function normalizeDraftImageReference(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^['"]|['"]$/g, '')
    .replace(/[?#].*$/, '')
    .replace(/^\.?\//, '')
}

function buildDraftImageLookup(images: DraftImagePreview[]): Record<string, DraftImagePreview> {
  const lookup: Record<string, DraftImagePreview> = {}

  for (const image of images) {
    const normalized = normalizeDraftImageReference(image.name)
    const withImagesPrefix = normalizeDraftImageReference(`images/${image.name}`)
    lookup[normalized] = image
    lookup[withImagesPrefix] = image
  }

  return lookup
}

function resolveDraftImage(imageLookup: Record<string, DraftImagePreview>, rawTarget: string): DraftImagePreview | null {
  return imageLookup[normalizeDraftImageReference(rawTarget)] ?? null
}

function splitMarkdownTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isMarkdownTableDivider(row: string): boolean {
  const cells = splitMarkdownTableRow(row)
  if (cells.length === 0) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isMarkdownTableHeader(row: string, nextRow: string | undefined): boolean {
  if (!row.includes('|') || !nextRow?.includes('|')) return false
  const headerCells = splitMarkdownTableRow(row)
  const dividerCells = splitMarkdownTableRow(nextRow)
  if (headerCells.length === 0 || dividerCells.length !== headerCells.length) return false
  return isMarkdownTableDivider(nextRow)
}

function collectReferencedDraftImages(markdown: string, images: DraftImagePreview[]): Set<string> {
  const imageLookup = buildDraftImageLookup(images)
  const referenced = new Set<string>()
  const markdownMatches = markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)
  const htmlMatches = markdown.matchAll(/<img\b[^>]*src=(['"])(.*?)\1[^>]*>/gi)

  for (const match of markdownMatches) {
    const image = resolveDraftImage(imageLookup, match[1] ?? '')
    if (image) {
      referenced.add(image.name)
    }
  }

  for (const match of htmlMatches) {
    const image = resolveDraftImage(imageLookup, match[2] ?? '')
    if (image) {
      referenced.add(image.name)
    }
  }

  return referenced
}

function parseInlineMarkdown(
  text: string,
  keyPrefix: string,
  imageLookup: Record<string, DraftImagePreview>,
): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /!\[([^\]]*)]\(([^)]+)\)|\[([^\]]+)]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let lastIndex = 0
  let matchIndex = 0

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      const image = resolveDraftImage(imageLookup, match[2])
      if (image) {
        nodes.push(
          <figure key={`${keyPrefix}-image-${matchIndex}`} className="my-5 overflow-hidden rounded-[24px] border border-border/70 bg-background">
            <img src={image.src} alt={match[1] || image.name} className="w-full object-cover" />
            <figcaption className="px-4 py-3 text-xs text-muted-foreground">{match[1] || image.name}</figcaption>
          </figure>,
        )
      } else {
        nodes.push(match[0])
      }
    } else if (match[3] !== undefined && match[4] !== undefined) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${matchIndex}`}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-500 dark:text-sky-300"
        >
          {match[3]}
        </a>,
      )
    } else if (match[5] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-code-${matchIndex}`} className="rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground">
          {match[5]}
        </code>,
      )
    } else if (match[6] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${matchIndex}`} className="font-semibold text-foreground">
          {match[6]}
        </strong>,
      )
    } else if (match[7] !== undefined) {
      nodes.push(
        <em key={`${keyPrefix}-em-${matchIndex}`} className="italic">
          {match[7]}
        </em>,
      )
    }

    lastIndex = start + match[0].length
    matchIndex += 1
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length ? nodes : [text]
}

function renderDraftMarkdown(markdown: string, images: DraftImagePreview[]): ReactNode[] {
  const imageLookup = buildDraftImageLookup(images)
  const lines = markdown.replace(/\r/g, '').split('\n')
  const nodes: ReactNode[] = []
  let index = 0

  const isBlank = (value: string) => value.trim().length === 0
  const isHeading = (value: string) => /^(#{1,6})\s+/.test(value)
  const isHr = (value: string) => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(value.trim())
  const isFence = (value: string) => /^```/.test(value.trim())
  const isQuote = (value: string) => /^>\s?/.test(value)
  const isUnordered = (value: string) => /^[-*+]\s+/.test(value)
  const isOrdered = (value: string) => /^\d+\.\s+/.test(value)
  const isStandaloneImage = (value: string) => /^!\[[^\]]*]\(([^)]+)\)\s*$/.test(value.trim())
  const isTableHeader = (currentIndex: number) => isMarkdownTableHeader(lines[currentIndex] ?? '', lines[currentIndex + 1])
  const isBlockStart = (value: string) =>
    isHeading(value) || isHr(value) || isFence(value) || isQuote(value) || isUnordered(value) || isOrdered(value) || isStandaloneImage(value)

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (isBlank(line)) {
      index += 1
      continue
    }

    if (isFence(line)) {
      const codeLines: string[] = []
      const language = line.trim().slice(3).trim()
      index += 1
      while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      nodes.push(
        <pre key={`code-${index}`} className="overflow-x-auto rounded-[22px] border border-border/70 bg-muted/25 p-4 text-xs leading-6 text-foreground">
          <code>
            {language ? `${language}\n` : ''}
            {codeLines.join('\n')}
          </code>
        </pre>,
      )
      continue
    }

    if (isHr(line)) {
      nodes.push(<hr key={`hr-${index}`} className="border-border/70" />)
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const content = headingMatch[2].trim()
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      nodes.push(
        <Tag key={`heading-${index}`} className={headingClassName(level)}>
          {parseInlineMarkdown(content, `heading-${index}`, imageLookup)}
        </Tag>,
      )
      index += 1
      continue
    }

    const standaloneImageMatch = line.trim().match(/^!\[([^\]]*)]\(([^)]+)\)\s*$/)
    if (standaloneImageMatch) {
      const image = resolveDraftImage(imageLookup, standaloneImageMatch[2])
      if (image) {
        nodes.push(
          <figure key={`standalone-image-${index}`} className="overflow-hidden rounded-[24px] border border-border/70 bg-background">
            <img src={image.src} alt={standaloneImageMatch[1] || image.name} className="w-full object-cover" />
            <figcaption className="px-4 py-3 text-xs text-muted-foreground">
              {standaloneImageMatch[1] || image.name}
            </figcaption>
          </figure>,
        )
      } else {
        nodes.push(
          <p key={`missing-image-${index}`} className="text-sm leading-7 text-muted-foreground">
            {line.trim()}
          </p>,
        )
      }
      index += 1
      continue
    }

    if (isTableHeader(index)) {
      const headers = splitMarkdownTableRow(lines[index] ?? '')
      index += 2
      const rows: string[][] = []

      while (index < lines.length) {
        const row = lines[index] ?? ''
        if (isBlank(row) || !row.includes('|')) {
          break
        }
        rows.push(splitMarkdownTableRow(row))
        index += 1
      }

      nodes.push(
        <div key={`table-${index}`} className="overflow-x-auto rounded-[22px] border border-border/70 bg-background/70">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-muted/35">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`header-${headerIndex}`} className="border-b border-border/60 px-4 py-3 font-semibold text-foreground">
                    {parseInlineMarkdown(header, `table-header-${index}-${headerIndex}`, imageLookup)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="align-top">
                  {headers.map((_, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} className="border-t border-border/50 px-4 py-3 leading-7 text-foreground/90">
                      {parseInlineMarkdown(row[cellIndex] ?? '', `table-cell-${index}-${rowIndex}-${cellIndex}`, imageLookup)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (isQuote(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && isQuote(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').replace(/^>\s?/, ''))
        index += 1
      }
      nodes.push(
        <blockquote key={`quote-${index}`} className="border-l-2 border-primary/35 pl-4 text-sm leading-7 text-muted-foreground">
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={`quote-line-${quoteIndex}`}>{parseInlineMarkdown(quoteLine, `quote-${index}-${quoteIndex}`, imageLookup)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    if (isUnordered(line) || isOrdered(line)) {
      const ordered = isOrdered(line)
      const items: string[] = []
      while (index < lines.length && (ordered ? isOrdered(lines[index] ?? '') : isUnordered(lines[index] ?? ''))) {
        items.push((lines[index] ?? '').replace(ordered ? /^\d+\.\s+/ : /^[-*+]\s+/, ''))
        index += 1
      }
      const ListTag = ordered ? 'ol' : 'ul'
      nodes.push(
        <ListTag
          key={`list-${index}`}
          className={`space-y-2 pl-6 text-sm leading-7 text-foreground ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, itemIndex) => (
            <li key={`list-item-${itemIndex}`}>{parseInlineMarkdown(item, `list-${index}-${itemIndex}`, imageLookup)}</li>
          ))}
        </ListTag>,
      )
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length && !isBlank(lines[index] ?? '') && !isBlockStart(lines[index] ?? '')) {
      paragraphLines.push((lines[index] ?? '').trim())
      index += 1
    }
    nodes.push(
      <p key={`paragraph-${index}`} className="text-[15px] leading-8 text-foreground/92">
        {parseInlineMarkdown(paragraphLines.join(' '), `paragraph-${index}`, imageLookup)}
      </p>,
    )
  }

  return nodes
}

export default function ContentDraftsPage() {
  const { t } = useTranslation()
  const variantsState = useAdapterCall(getContentDraftVariantsResult, { pollInterval: 30_000 })
  const [query, setQuery] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsById, setDetailsById] = useState<Record<string, DraftVariantDetail>>({})
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({})
  const [errorsById, setErrorsById] = useState<Record<string, string>>({})
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [pendingDeleteVariant, setPendingDeleteVariant] = useState<ContentDraftVariantSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [selectedExtraImage, setSelectedExtraImage] = useState<DraftImageDialogState | null>(null)
  const imageUrlsRef = useRef<Record<string, string[]>>({})

  const variants = (variantsState.data ?? []).filter((variant) => !hiddenIds.includes(variant.id))
  const platforms = useMemo(
    () => [...new Set(variants.map((item) => item.platform))].sort(),
    [variants],
  )
  const filteredVariants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return variants.filter((variant) => {
      if (selectedPlatform !== 'all' && variant.platform !== selectedPlatform) {
        return false
      }
      if (!normalizedQuery) return true
      return [
        variant.title ?? '',
        variant.runId,
        variant.platform,
        variant.sourceUrl ?? '',
        variant.slug ?? '',
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [query, selectedPlatform, variants])

  useEffect(() => {
    if (expandedId && !filteredVariants.some((variant) => variant.id === expandedId)) {
      setExpandedId(null)
    }
  }, [expandedId, filteredVariants])

  useEffect(() => {
    return () => {
      for (const urls of Object.values(imageUrlsRef.current)) {
        for (const url of urls) {
          URL.revokeObjectURL(url)
        }
      }
    }
  }, [])

  function revokeVariantImageUrls(variantId: string) {
    for (const url of imageUrlsRef.current[variantId] ?? []) {
      URL.revokeObjectURL(url)
    }
    delete imageUrlsRef.current[variantId]
  }

  async function ensureVariantLoaded(variant: ContentDraftVariantSummary) {
    if (detailsById[variant.id] || loadingById[variant.id]) return

    setLoadingById((current) => ({ ...current, [variant.id]: true }))
    setErrorsById((current) => {
      const next = { ...current }
      delete next[variant.id]
      return next
    })

    const textResult = await readContentDraftTextResult(variant.draftPath)
    if (!textResult.success || !textResult.data) {
      setErrorsById((current) => ({
        ...current,
        [variant.id]: textResult.error ?? t('common.requestFailed'),
      }))
      setLoadingById((current) => ({ ...current, [variant.id]: false }))
      return
    }
    const draftText = textResult.data.content

    const imageResults = await Promise.all(
      variant.imageFiles.map(async (fileName) => ({
        fileName,
        result: await readContentDraftImageResult(joinFilePath(variant.imagesDir, fileName)),
      })),
    )

    revokeVariantImageUrls(variant.id)

    const nextImageUrls: string[] = []
    const nextImages = imageResults
      .filter((entry) => entry.result.success && entry.result.data)
      .map((entry) => {
        const src = imageFileToObjectUrl(entry.result.data!)
        nextImageUrls.push(src)
        return {
          name: entry.fileName,
          src,
          mimeType: entry.result.data!.mimeType,
        }
      })

    imageUrlsRef.current[variant.id] = nextImageUrls
    setDetailsById((current) => ({
      ...current,
      [variant.id]: {
        draftContent: draftText,
        images: nextImages,
      },
    }))
    setLoadingById((current) => ({ ...current, [variant.id]: false }))
  }

  function handleToggleVariant(variant: ContentDraftVariantSummary) {
    if (expandedId === variant.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(variant.id)
    void ensureVariantLoaded(variant)
  }

  async function handleDeleteVariant(variant: ContentDraftVariantSummary) {
    setDeleteBusy(true)
    const result = await deleteContentDraftVariantResult(variant.manifestPath)
    setDeleteBusy(false)

    if (!result.success) {
      setErrorsById((current) => ({
        ...current,
        [variant.id]: result.error ?? t('common.requestFailed'),
      }))
      return
    }

    revokeVariantImageUrls(variant.id)
    setDetailsById((current) => {
      const next = { ...current }
      delete next[variant.id]
      return next
    })
    setErrorsById((current) => {
      const next = { ...current }
      delete next[variant.id]
      return next
    })
    setLoadingById((current) => {
      const next = { ...current }
      delete next[variant.id]
      return next
    })
    setHiddenIds((current) => [...current, variant.id])
    if (expandedId === variant.id) {
      setExpandedId(null)
    }
    if (selectedExtraImage?.variantId === variant.id) {
      setSelectedExtraImage(null)
    }
    void variantsState.refetch()
  }

  const latestSavedAt = variants[0]?.savedAt ?? null

  return (
    <div className="page-shell page-shell-bleed">
      <section className="surface-card space-y-3 rounded-[24px] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="page-header-meta">
              <span>{t('contentDrafts.kicker')}</span>
              <span>{t('contentDrafts.metrics.variants', { count: variants.length })}</span>
              <span>{t('contentDrafts.metrics.platforms', { count: platforms.length })}</span>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('contentDrafts.title')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('contentDrafts.subtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={() => void variantsState.refetch()} className="button-secondary h-9 px-3 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${variantsState.loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <CompactStat label={t('contentDrafts.metrics.variantsLabel')} value={String(variants.length)} />
          <CompactStat label={t('contentDrafts.metrics.platformsLabel')} value={String(platforms.length)} />
          <CompactStat label={t('contentDrafts.metrics.latestLabel')} value={formatSavedAt(latestSavedAt, t('contentDrafts.metrics.none'))} />
        </div>
      </section>

      <section className="space-y-5">
        <div className="surface-card space-y-4 rounded-[24px] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('contentDrafts.libraryTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('contentDrafts.libraryBody')}</p>
            </div>
            <Link to="/skills" className="button-secondary h-8 px-3 text-xs">
              {t('contentDrafts.openSkills')}
            </Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('contentDrafts.searchPlaceholder')}
              className="w-full rounded-2xl border border-border/70 bg-background px-4 py-2.5 text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedPlatform('all')}
                className={`pill-button text-xs ${selectedPlatform === 'all' ? 'pill-button-active' : 'pill-button-inactive'}`}
              >
                {t('contentDrafts.platform.all')}
              </button>
              {platforms.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setSelectedPlatform(platform)}
                  className={`pill-button text-xs ${selectedPlatform === platform ? 'pill-button-active' : 'pill-button-inactive'}`}
                >
                  {platformLabel(platform, t)}
                </button>
              ))}
            </div>
          </div>

          {variantsState.loading && !variants.length ? (
            <LoadingState message={t('common.loading')} fullPage={false} />
          ) : variantsState.error && !variants.length ? (
            <ActionBanner tone="error" message={t('contentDrafts.loadFailed', { error: variantsState.error })} />
          ) : filteredVariants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">{t('contentDrafts.emptyTitle')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('contentDrafts.emptyBody')}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4" aria-live="polite">
          {variantsState.error && variants.length ? (
            <ActionBanner tone="error" message={t('contentDrafts.loadFailed', { error: variantsState.error })} />
          ) : null}

          {!filteredVariants.length ? null : (
            <p className="px-1 text-sm text-muted-foreground">{t('contentDrafts.listHint')}</p>
          )}

          {!filteredVariants.length ? null : filteredVariants.map((variant) => {
            const expanded = expandedId === variant.id
            const detail = detailsById[variant.id]
            const detailError = errorsById[variant.id]
            const detailLoading = loadingById[variant.id] === true
            const referencedImages = detail ? collectReferencedDraftImages(detail.draftContent, detail.images) : new Set<string>()
            const extraImages = detail
              ? detail.images.filter((image) => !referencedImages.has(image.name))
              : []

            return (
              <article
                key={variant.id}
                className={`surface-card overflow-hidden rounded-[24px] border transition ${
                  expanded ? 'border-primary/35 shadow-[0_18px_60px_rgba(20,20,20,0.08)]' : 'border-border/70'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggleVariant(variant)}
                  aria-expanded={expanded}
                  className="w-full text-left"
                >
                  <div className="bg-[radial-gradient(circle_at_top_left,rgba(255,122,0,0.10),transparent_34%),transparent] px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {platformLabel(variant.platform, t)}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t('contentDrafts.imageCount', { count: variant.imageFiles.length })}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                            {variant.title ?? variant.runId}
                          </h2>
                          <p className="break-all text-xs text-muted-foreground">{variant.runId}</p>
                          {variant.sourceUrl ? (
                            <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-sky-600 dark:text-sky-300">
                              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{variant.sourceUrl}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs">
                          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            {t('contentDrafts.savedAt')}
                          </p>
                          <p className="mt-1.5 font-medium text-foreground">
                            {formatSavedAt(variant.savedAt, t('contentDrafts.metrics.none'))}
                          </p>
                        </div>
                        <span className="inline-flex min-h-8 items-center justify-center rounded-full border border-border/70 bg-background/85 px-2.5 text-[11px] font-medium text-muted-foreground">
                          {expanded ? t('contentDrafts.collapseLabel') : t('contentDrafts.expandLabel')}
                        </span>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/85">
                          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} />
                        </span>
                      </div>
                    </div>

                    <div className="mt-3.5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <CompactMetaItem label={t('contentDrafts.metaPlatform')} value={platformLabel(variant.platform, t)} />
                      <CompactMetaItem label={t('contentDrafts.metaRunId')} value={variant.runId} />
                      <CompactMetaItem label={t('contentDrafts.metaSlug')} value={variant.slug ?? t('common.notSet')} />
                      <CompactMetaItem label={t('contentDrafts.metaImages')} value={String(variant.imageFiles.length)} />
                    </div>
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-5 border-t border-border/60 px-5 py-5 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border/60 bg-muted/15 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t('contentDrafts.contentSectionTitle')}</p>
                        <p className="text-xs text-muted-foreground">{t('contentDrafts.contentSectionBody')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteVariant(variant)}
                        className="button-danger inline-flex items-center gap-2 px-3 py-2 text-xs"
                        disabled={deleteBusy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleteBusy && pendingDeleteVariant?.id === variant.id ? t('contentDrafts.deletingLabel') : t('contentDrafts.deleteLabel')}
                      </button>
                    </div>

                    {detailError ? (
                      <ActionBanner tone="error" message={detailError} onDismiss={() => {
                        setErrorsById((current) => {
                          const next = { ...current }
                          delete next[variant.id]
                          return next
                        })
                      }} />
                    ) : null}

                    {detailLoading ? (
                      <LoadingState message={t('contentDrafts.loadingPreview')} fullPage={false} />
                    ) : detail ? (
                      <>
                        <DraftSection
                          title={t('contentDrafts.renderedTitle')}
                          body={t('contentDrafts.renderedBody')}
                        >
                          <article className="mx-auto flex max-w-4xl flex-col gap-6">
                            {renderDraftMarkdown(detail.draftContent, detail.images)}
                          </article>

                          {detail.images.length === 0 ? (
                            <div className="mt-5 rounded-[20px] border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                              {t('contentDrafts.imagesEmpty')}
                            </div>
                          ) : null}

                          {extraImages.length > 0 ? (
                            <div className="mt-6 space-y-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{t('contentDrafts.extraImagesTitle')}</p>
                                <p className="text-xs text-muted-foreground">{t('contentDrafts.extraImagesBody')}</p>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {extraImages.map((image) => (
                                  <button
                                    key={image.name}
                                    type="button"
                                    onClick={() => setSelectedExtraImage({
                                      variantId: variant.id,
                                      variantTitle: variant.title ?? variant.runId,
                                      image,
                                    })}
                                    className="group overflow-hidden rounded-[20px] border border-border/70 bg-background text-left transition hover:border-primary/35 hover:shadow-[0_14px_36px_rgba(20,20,20,0.08)]"
                                  >
                                    <img src={image.src} alt={image.name} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
                                    <span className="flex items-center justify-between gap-3 px-3 py-2.5 text-[11px] text-muted-foreground">
                                      <span className="truncate">{image.name}</span>
                                      <span>{image.mimeType}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </DraftSection>

                        <DraftSection
                          title={t('contentDrafts.detailsSectionTitle')}
                          body={t('contentDrafts.detailsSectionBody')}
                        >
                          <div className="grid gap-2.5 lg:grid-cols-2">
                            <MetaItem label={t('contentDrafts.metaDraftPath')} value={variant.draftPath} />
                            <MetaItem label={t('contentDrafts.metaManifestPath')} value={variant.manifestPath} />
                            <MetaItem label={t('contentDrafts.metaSource')} value={variant.sourceUrl ?? t('common.notSet')} />
                            <MetaItem label={t('contentDrafts.metaSlug')} value={variant.slug ?? t('common.notSet')} />
                          </div>
                        </DraftSection>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDeleteVariant)}
        title={pendingDeleteVariant ? t('contentDrafts.deleteConfirmTitle', { title: pendingDeleteVariant.title ?? pendingDeleteVariant.runId }) : ''}
        description={pendingDeleteVariant ? t('contentDrafts.deleteConfirmBody', { platform: platformLabel(pendingDeleteVariant.platform, t) }) : ''}
        tone="danger"
        busy={deleteBusy}
        confirmLabel={deleteBusy ? t('contentDrafts.deletingLabel') : t('contentDrafts.deleteLabel')}
        onCancel={() => {
          if (deleteBusy) return
          setPendingDeleteVariant(null)
        }}
        onConfirm={() => {
          if (!pendingDeleteVariant || deleteBusy) return
          const current = pendingDeleteVariant
          setPendingDeleteVariant(null)
          void handleDeleteVariant(current)
        }}
      />

      {selectedExtraImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t('contentDrafts.imageDialogTitle', { name: selectedExtraImage.image.name })}
          onClick={() => setSelectedExtraImage(null)}
        >
          <div
            className="flex max-h-[min(92vh,56rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_28px_80px_rgba(0,0,0,0.35)] xl:flex-row"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-h-0 min-w-0 flex-1 bg-muted/20">
              <img
                src={selectedExtraImage.image.src}
                alt={selectedExtraImage.image.name}
                className="h-full max-h-[70vh] w-full object-contain xl:max-h-[92vh]"
              />
            </div>
            <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-border/70 bg-card/70 p-5 xl:w-[22rem] xl:border-l xl:border-t-0">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t('contentDrafts.extraImagesTitle')}
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {selectedExtraImage.image.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('contentDrafts.imageDialogBody', { title: selectedExtraImage.variantTitle })}
                </p>
              </div>

              <div className="grid gap-2.5">
                <MetaItem label={t('contentDrafts.imageDialogFileName')} value={selectedExtraImage.image.name} />
                <MetaItem label={t('contentDrafts.imageDialogMimeType')} value={selectedExtraImage.image.mimeType} />
              </div>

              <button
                type="button"
                onClick={() => setSelectedExtraImage(null)}
                className="button-secondary mt-auto px-3 py-2 text-sm"
              >
                {t('contentDrafts.imageDialogClose')}
              </button>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DraftSection({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-border/70 bg-background/60">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="border-t border-border/60 px-5 py-5">{children}</div>
    </section>
  )
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-background/70 px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-background/70 px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 break-all text-xs leading-5 text-foreground">{value}</p>
    </div>
  )
}

function CompactMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border/70 bg-background/70 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-xs font-medium text-foreground">{value}</p>
    </div>
  )
}
