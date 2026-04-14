import { execOpenclaw, type ExecOpenclawOptions } from '../execOpenclaw.js'

/** Unload from gateway before removing files; best-effort (CLI may non-zero if already off) */
const PLUGIN_DISABLE_BEFORE_UNINSTALL_OPTS: ExecOpenclawOptions = {
  timeoutMs: 2 * 60 * 1000,
  stdinIgnore: true,
}

/** OpenClaw 2026.3.x has no `--yes` on `plugins uninstall|install`; answer `[y/N]` via stdin. */
const PLUGIN_CONFIRM_LINE = 'y\n'

const PLUGIN_INSTALL_CLI_OPTS: ExecOpenclawOptions = {
  timeoutMs: 5 * 60 * 1000,
  stdinInput: PLUGIN_CONFIRM_LINE,
}

const PLUGIN_UNINSTALL_CLI_OPTS: ExecOpenclawOptions = {
  timeoutMs: 5 * 60 * 1000,
  stdinInput: PLUGIN_CONFIRM_LINE,
}

export interface OpenClawPluginRow {
  id: string
  name: string
  status?: string
  version?: string
  source?: string
  description?: string
}

function findBalancedJsonEnd(raw: string, start: number): number | null {
  const first = raw[start]
  if (first !== '{' && first !== '[') return null

  const expectedClosers: string[] = [first === '{' ? '}' : ']']
  let inString = false
  let escaped = false

  for (let index = start + 1; index < raw.length; index += 1) {
    const ch = raw[index]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      expectedClosers.push('}')
      continue
    }
    if (ch === '[') {
      expectedClosers.push(']')
      continue
    }
    if (ch === '}' || ch === ']') {
      const expected = expectedClosers.pop()
      if (expected !== ch) {
        return null
      }
      if (expectedClosers.length === 0) {
        return index
      }
    }
  }

  return null
}

function extractFirstJsonValue(raw: string): unknown | null {
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]
    if (ch !== '{' && ch !== '[') continue
    const end = findBalancedJsonEnd(raw, index)
    if (end === null) continue
    const candidate = raw.slice(index, end + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }
  return null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizePluginRow(item: unknown): OpenClawPluginRow | null {
  if (typeof item === 'string') {
    const id = item.trim()
    return id ? { id, name: id } : null
  }
  if (!isRecord(item)) return null
  const id = String(item.id ?? item.name ?? item.slug ?? '').trim()
  if (!id) return null
  return {
    id,
    name: String(item.name ?? item.title ?? id),
    status: typeof item.status === 'string' ? item.status : undefined,
    version: typeof item.version === 'string' ? item.version : undefined,
    source:
      typeof item.source === 'string'
        ? item.source
        : typeof item.sourcePath === 'string'
          ? item.sourcePath
          : typeof item.path === 'string'
            ? item.path
            : undefined,
    description: typeof item.description === 'string' ? item.description : undefined,
  }
}

/** Parse `plugins list --json` output (array or wrapped in { plugins | items | list }) */
export function parsePluginsJsonString(raw: string): OpenClawPluginRow[] {
  if (!raw.trim()) return []
  const data = extractFirstJsonValue(raw)
  if (data === null) return []
  if (Array.isArray(data)) {
    return data.map(normalizePluginRow).filter((x): x is OpenClawPluginRow => x !== null)
  }
  if (isRecord(data)) {
    if (Array.isArray(data.plugins)) {
      return parsePluginsJsonString(JSON.stringify(data.plugins))
    }
    if (Array.isArray(data.items)) {
      return parsePluginsJsonString(JSON.stringify(data.items))
    }
    if (Array.isArray(data.list)) {
      return parsePluginsJsonString(JSON.stringify(data.list))
    }
  }
  return []
}

const BOX_CHARS = /[│┃┌┐└┘├┤┬┴┼─═╌┄╔╗╚╝╠╣╦╩╬]/
/** CLI tables often use Unicode box pipe │; treat ASCII | the same as column separators */
const TABLE_PIPE_SPLIT = /[|│┃]/

function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '')
}

function isBorderOrRuleLine(line: string): boolean {
  const t = line.replace(/\s/g, '')
  if (!t) return true
  if (/^[|+:=\-]+$/.test(t)) return true
  if (/^[│├└┌┐┘─═+|]+$/.test(t)) return true
  return false
}

function looksLikeFilesystemPath(s: string): boolean {
  const x = s.trim()
  return x.startsWith('/') || /^[A-Za-z]:[\\/]/.test(x) || x.includes('node_modules')
}

function looksLikePluginId(s: string): boolean {
  const x = s.trim()
  if (x.length < 1 || x.length > 80) return false
  if (/\s/.test(x)) return false
  if (BOX_CHARS.test(x) || x.includes('|')) return false
  return /^[a-z0-9][a-z0-9_.-]*$/i.test(x)
}

/**
 * CLI often puts the real slug in Source when Name/ID wrap across lines, e.g.
 * `global:memory-powermem/index.ts`, `stock:zalouser/index.ts`.
 */
function extractPluginIdFromSourceCell(source: string): string | null {
  const s = source.trim()
  if (!s) return null
  const m = /^(?:global|stock):([^/\s│|]+)/i.exec(s)
  if (!m) return null
  const slug = (m[1] ?? '').trim()
  return slug && looksLikePluginId(slug) ? slug : null
}

function resolveTableRowPluginId(name: string, id: string, source: string): string | null {
  const idTrim = id.trim()
  if (idTrim && looksLikePluginId(idTrim)) return idTrim
  const fromSource = extractPluginIdFromSourceCell(source)
  if (fromSource) return fromSource
  const nameTrim = name.trim()
  if (nameTrim && looksLikePluginId(nameTrim)) return nameTrim
  return null
}

/** Only Status is guaranteed non-empty on the first line of a plugin and does not wrap. */
function isPluginsTablePluginStartRow(statusCell: string): boolean {
  return Boolean(statusCell.trim())
}

/** Merge wrapped Name cells, e.g. `@openclaw/` + `bluebubbles` → `@openclaw/bluebubbles` */
function mergeWrappedPluginName(prev: string, next: string): string {
  const p = prev.trimEnd()
  const n = next.trim()
  if (!n) return p
  if (p.endsWith('/') || p.endsWith('-')) return p + n
  return `${p} ${n}`.trim().replace(/\s+/g, ' ')
}

function mergeWrappedSourceParts(parts: string[]): string | undefined {
  let merged = ''
  for (const part of parts.map((item) => item.trim()).filter(Boolean)) {
    if (!merged) {
      merged = part
      continue
    }
    if (merged.endsWith('/') || merged.endsWith('-')) {
      merged += part
    } else {
      merged += ` ${part}`
    }
  }
  return merged || undefined
}

function lineHasTablePipe(line: string): boolean {
  return TABLE_PIPE_SPLIT.test(line)
}

/** Split on `|` / `│`, keep empty cells (5-column table uses indices; do not filter empty cells) */
function splitPipeRowPreservingCells(line: string): string[] {
  const cells = line.split(TABLE_PIPE_SPLIT).map((c) => c.replace(BOX_CHARS, ' ').trim())
  const hasLeadingPipe = /^[\s]*[|│]/.test(line)
  const hasTrailingPipe = /[|│][\s]*$/.test(line)
  if (!hasLeadingPipe) cells.unshift('')
  if (!hasTrailingPipe) cells.push('')
  return cells
}

type OpenclawPluginsTableLayout = {
  headerIdx: number
  statusIndex: number
  sourceIndex?: number
  versionIndex?: number
}

function findOpenclawPluginsTableLayout(lines: string[]): OpenclawPluginsTableLayout | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!lineHasTablePipe(line)) continue
    const cells = splitPipeRowPreservingCells(line)
    if (cells.length < 6) continue
    const c1 = (cells[1] ?? '').toLowerCase()
    const c2 = (cells[2] ?? '').toLowerCase()
    const c3 = (cells[3] ?? '').toLowerCase()
    const c4 = (cells[4] ?? '').toLowerCase()
    if (c1 !== 'name' || c2 !== 'id') continue
    if (c3 === 'format' && c4.startsWith('status')) {
      return { headerIdx: i, statusIndex: 4, sourceIndex: 5, versionIndex: 6 }
    }
    if (c3.startsWith('status') && c4 === 'version') {
      return { headerIdx: i, statusIndex: 3, versionIndex: 4 }
    }
    if (c3.startsWith('status')) {
      return { headerIdx: i, statusIndex: 3, sourceIndex: 4, versionIndex: 5 }
    }
  }
  return null
}

function rowIsTableSeparator(cells: string[]): boolean {
  const inner = cells.slice(1, Math.max(1, cells.length - 1))
  if (inner.length === 0) return true
  return inner.every((c) => {
    const t = c.replace(/\s/g, '')
    return t === '' || /^[-─═┼+]+$/.test(t)
  })
}

type TableAcc = {
  name: string
  id: string
  status: string
  version?: string
  descParts: string[]
}

/**
 * Standard table after Doctor banner: Name | ID | Status | Source | Version.
 * Only Status marks a new plugin (non-empty, no wrap). Other columns may continue on following
 * lines while Status stays empty. When the ID cell is empty on the first line, resolve id from
 * Source (`global:…/index.ts`). Version may appear on a continuation row — pick it up there.
 */
function parseOpenclawPluginsTable(
  lines: string[],
  layout: OpenclawPluginsTableLayout
): OpenClawPluginRow[] {
  const out: OpenClawPluginRow[] = []
  const seen = new Set<string>()
  let cur: TableAcc | null = null

  const flush = () => {
    if (!cur) return
    if (seen.has(cur.id)) return
    seen.add(cur.id)
    const description = mergeWrappedSourceParts(cur.descParts)
    out.push({
      id: cur.id,
      name: cur.name,
      status: cur.status || undefined,
      version: cur.version,
      source: description || undefined,
      description,
    })
    cur = null
  }

  for (let i = layout.headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!lineHasTablePipe(line)) continue
    const cells = splitPipeRowPreservingCells(line)
    if (cells.length <= layout.statusIndex) continue
    if (layout.sourceIndex !== undefined && cells.length <= layout.sourceIndex) continue
    if (layout.versionIndex !== undefined && cells.length <= layout.versionIndex) continue
    if (rowIsTableSeparator(cells)) continue

    const name = (cells[1] ?? '').trim()
    const id = (cells[2] ?? '').trim()
    const statusCell = (cells[layout.statusIndex] ?? '').trim()
    const source = layout.sourceIndex === undefined ? '' : (cells[layout.sourceIndex] ?? '').trim()
    const versionCell = layout.versionIndex === undefined ? '' : (cells[layout.versionIndex] ?? '').trim()

    if (cur && !isPluginsTablePluginStartRow(statusCell)) {
      if (name) cur.name = mergeWrappedPluginName(cur.name, name)
      if (id) {
        const merged = cur.id + id
        if (looksLikePluginId(merged) && merged.length <= 80) cur.id = merged
      }
      if (source) cur.descParts.push(source)
      const verCont = versionCell.trim()
      if (verCont && !cur.version) cur.version = verCont
      continue
    }

    if (!isPluginsTablePluginStartRow(statusCell)) {
      continue
    }

    const resolvedId = resolveTableRowPluginId(name, id, source)
    if (resolvedId === null) {
      continue
    }
    if (!name && !id && !source) {
      continue
    }

    flush()
    const verTrim = versionCell.trim()
    const descParts: string[] = []
    if (source) descParts.push(source)
    cur = {
      name: name || resolvedId,
      id: resolvedId,
      status: statusCell.trim(),
      version: verTrim ? verTrim : undefined,
      descParts,
    }
    continue
  }
  flush()
  return out
}

function cellsFromPipeLineCompact(line: string): string[] | null {
  if (!lineHasTablePipe(line)) return null
  const cells = line
    .split(TABLE_PIPE_SPLIT)
    .map((c) => c.replace(BOX_CHARS, '').trim())
    .filter((c) => c.length > 0 && !/^[-:=\s]+$/.test(c))
  if (cells.length < 2) return null
  return cells
}

function isTableHeaderRowCompact(cells: string[]): boolean {
  if (cells.length === 2 && cells[0].toLowerCase() === 'name' && cells[1].toLowerCase() === 'id') {
    return true
  }
  if (cells.length === 2 && cells[0].toLowerCase() === 'name' && cells[1].toLowerCase() === 'name') {
    return true
  }
  const joined = cells.join(' ').toLowerCase()
  if (/^name\s+id$/i.test(joined)) return true
  return cells.every((c) => /^(name|id|version|plugin|description)$/i.test(c.trim()))
}

/**
 * OpenClaw `plugins list`: Doctor box + source roots + 5-column table + continuation lines.
 * Prefer header-based column parse; fall back to compact `|` rows.
 */
export function parsePluginsPlainText(stdout: string): OpenClawPluginRow[] {
  const lines = stripAnsi(stdout)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .map((l) => l.trim())
    .filter(Boolean)

  const tableLayout = findOpenclawPluginsTableLayout(lines)
  if (tableLayout) {
    const tableRows = parseOpenclawPluginsTable(lines, tableLayout)
    if (tableRows.length > 0) return tableRows
  }

  const rows: OpenClawPluginRow[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (isBorderOrRuleLine(line)) continue
    if (/^source\s+roots?:/i.test(line)) continue
    if (looksLikeFilesystemPath(line) && !lineHasTablePipe(line)) continue

    const pipeCells = cellsFromPipeLineCompact(line)
    if (pipeCells) {
      if (isTableHeaderRowCompact(pipeCells)) continue
      if (pipeCells.every((c) => /^[\s\-:]+$/.test(c))) continue

      let name: string
      let id: string
      let version: string | undefined
      let description: string | undefined

      if (pipeCells.length === 2) {
        const [a, b] = pipeCells
        if (looksLikePluginId(b) && !looksLikePluginId(a)) {
          name = a
          id = b
        } else if (looksLikePluginId(a) && b.length > a.length) {
          id = a
          name = b
        } else {
          name = a
          id = looksLikePluginId(b) ? b : a.replace(/\s+/g, '-').toLowerCase().slice(0, 64)
        }
      } else {
        name = pipeCells[0]
        const idCandidate = pipeCells[1]
        id = looksLikePluginId(idCandidate) ? idCandidate : idCandidate.replace(/\s+/g, '-').toLowerCase()
        if (pipeCells.length === 4) {
          description = pipeCells[2]
          if (pipeCells[3] && /^[\d.+\w-]+$/.test(pipeCells[3]) && pipeCells[3].length < 32) {
            version = pipeCells[3]
          }
        } else {
          if (pipeCells[2] && /^[\d.+\w-]+$/.test(pipeCells[2]) && pipeCells[2].length < 32) {
            version = pipeCells[2]
          } else if (pipeCells[2]) {
            description = pipeCells[2]
          }
          if (pipeCells[3]) {
            description = description ? `${description} ${pipeCells.slice(3).join(' ')}` : pipeCells.slice(3).join(' ')
          }
        }
      }

      if (!id || id.length > 120 || BOX_CHARS.test(id) || id.includes('|')) continue
      if (/^(name|id|plugin|version)$/i.test(id)) continue
      if (seen.has(id)) continue
      seen.add(id)
      rows.push({
        id,
        name: name || id,
        status:
          description && /^(loaded|enabled|active|ready|ok|disabled|error|failed)$/i.test(description)
            ? description
            : undefined,
        version,
        description:
          description && /^(loaded|enabled|active|ready|ok|disabled|error|failed)$/i.test(description)
            ? undefined
            : description,
      })
      continue
    }

    const parts = line.split(/\s{2,}|\t+/).map((s) => s.trim()).filter(Boolean)
    if (parts.length < 2) continue
    const [a, b] = parts
    if (!looksLikePluginId(b)) continue
    if (looksLikeFilesystemPath(a) || looksLikeFilesystemPath(b)) continue
    if (/^source|^stock:/i.test(a)) continue
    const id = b
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({
      id,
      name: a,
      version:
        parts[2] && /^[\d.+\w-]+$/.test(parts[2]) && parts[2].length < 32 ? parts[2] : undefined,
    })
  }

  return rows
}

export async function listOpenclawPlugins(): Promise<{
  rows: OpenClawPluginRow[]
  fallbackText?: string
}> {
  // Warnings (e.g. plugins.allow empty) often go to stderr with ANSI; CLI may still exit non-zero
  // even when stdout has valid --json or a table. Parse stdout first; do not require code === 0.
  let r = await execOpenclaw(['plugins', 'list', '--json'])
  let jsonRows = parsePluginsJsonString(stripAnsi(r.stdout))
  if (jsonRows.length === 0) {
    jsonRows = parsePluginsJsonString(stripAnsi(r.stderr))
  }
  if (jsonRows.length > 0) {
    return { rows: jsonRows }
  }

  r = await execOpenclaw(['plugins', 'list'])
  const out = stripAnsi(r.stdout).trim()
  let fromText = parsePluginsPlainText(out)
  if (fromText.length === 0) {
    const combined = stripAnsi([r.stdout, r.stderr].filter(Boolean).join('\n')).trim()
    fromText = parsePluginsPlainText(combined)
  }
  if (fromText.length > 0) {
    return { rows: fromText }
  }
  const fallback = stripAnsi([r.stdout, r.stderr].filter(Boolean).join('\n')).trim()
  if (r.code !== 0) {
    return {
      rows: [],
      fallbackText:
        fallback ||
        stripAnsi(r.stderr || r.stdout).trim() ||
        `openclaw plugins list failed (${r.code})`,
    }
  }
  return { rows: [], fallbackText: fallback || undefined }
}

/** Run `openclaw plugins enable|disable <id>`; id is allowlisted to avoid shell injection */
export async function setOpenclawPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const x = id.trim()
  if (!looksLikePluginId(x)) {
    throw new Error('Invalid plugin id')
  }
  const sub = enabled ? 'enable' : 'disable'
  const r = await execOpenclaw(['plugins', sub, x], { stdinIgnore: true })
  if (r.code !== 0) {
    throw new Error(
      [r.stderr, r.stdout].filter(Boolean).join('\n').trim() || `openclaw plugins ${sub} failed (${r.code})`
    )
  }
}

/** Run `openclaw plugins install <id>`; id is allowlisted to avoid shell injection */
export async function installOpenclawPlugin(id: string): Promise<void> {
  const x = id.trim()
  if (!looksLikePluginId(x)) {
    throw new Error('Invalid plugin id')
  }
  const r = await execOpenclaw(['plugins', 'install', x], PLUGIN_INSTALL_CLI_OPTS)
  if (r.code !== 0) {
    throw new Error(
      [r.stderr, r.stdout].filter(Boolean).join('\n').trim() || `openclaw plugins install failed (${r.code})`
    )
  }
}

export async function installOpenclawPluginFromPath(
  pluginPath: string,
  options?: { link?: boolean }
): Promise<void> {
  const normalized = pluginPath.trim()
  if (!normalized) {
    throw new Error('Plugin path is required')
  }
  const args = ['plugins', 'install']
  if (options?.link !== false) {
    args.push('-l')
  }
  args.push(normalized)
  const r = await execOpenclaw(args, PLUGIN_INSTALL_CLI_OPTS)
  if (r.code !== 0) {
    throw new Error(
      [r.stderr, r.stdout].filter(Boolean).join('\n').trim() || `openclaw plugins install failed (${r.code})`
    )
  }
}

/** Run `openclaw plugins uninstall <id>`; optional `--keep-files` per OpenClaw CLI */
export async function uninstallOpenclawPlugin(
  id: string,
  keepFiles?: boolean,
  options?: { disableLoadedFirst?: boolean }
): Promise<void> {
  const x = id.trim()
  if (!looksLikePluginId(x)) {
    throw new Error('Invalid plugin id')
  }
  if (options?.disableLoadedFirst === true) {
    await execOpenclaw(['plugins', 'disable', x], PLUGIN_DISABLE_BEFORE_UNINSTALL_OPTS)
  }
  const args = ['plugins', 'uninstall', x]
  if (keepFiles) {
    args.push('--keep-files')
  }
  const r = await execOpenclaw(args, PLUGIN_UNINSTALL_CLI_OPTS)
  if (r.code !== 0) {
    throw new Error(
      [r.stderr, r.stdout].filter(Boolean).join('\n').trim() || `openclaw plugins uninstall failed (${r.code})`
    )
  }
}
