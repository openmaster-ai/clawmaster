import { execOpenclaw } from './execOpenclaw.js'

export interface OpenClawPluginRow {
  id: string
  name: string
  status?: string
  version?: string
  description?: string
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
    description: typeof item.description === 'string' ? item.description : undefined,
  }
}

/** Parse `plugins list --json` output (array or wrapped in { plugins | items | list }) */
export function parsePluginsJsonString(raw: string): OpenClawPluginRow[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  let data: unknown
  try {
    if (trimmed.startsWith('[')) {
      data = JSON.parse(trimmed)
    } else {
      const arrM = raw.match(/\[[\s\S]*\]/)
      if (arrM) {
        data = JSON.parse(arrM[0])
      } else {
        const objM = raw.match(/\{[\s\S]*\}/)
        if (!objM) return []
        data = JSON.parse(objM[0])
      }
    }
  } catch {
    return []
  }
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

function isVersionTableCell(s: string): boolean {
  const t = s.trim()
  return t.length > 0 && /^[\d.][\d.a-z+-]*$/i.test(t) && t.length < 40
}

/** Merge wrapped Name cells, e.g. `@openclaw/` + `bluebubbles` → `@openclaw/bluebubbles` */
function mergeWrappedPluginName(prev: string, next: string): string {
  const p = prev.trimEnd()
  const n = next.trim()
  if (!n) return p
  if (p.endsWith('/') || p.endsWith('-')) return p + n
  return `${p} ${n}`.trim().replace(/\s+/g, ' ')
}

function lineHasTablePipe(line: string): boolean {
  return TABLE_PIPE_SPLIT.test(line)
}

/** Split on `|` / `│`, keep empty cells (5-column table uses indices; do not filter empty cells) */
function splitPipeRowPreservingCells(line: string): string[] {
  return line.split(TABLE_PIPE_SPLIT).map((c) => c.replace(BOX_CHARS, ' ').trim())
}

function findOpenclawPluginsTableHeader(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!lineHasTablePipe(line)) continue
    const cells = splitPipeRowPreservingCells(line)
    if (cells.length < 5) continue
    const c1 = (cells[1] ?? '').toLowerCase()
    const c2 = (cells[2] ?? '').toLowerCase()
    const c3 = (cells[3] ?? '').toLowerCase()
    if (c1 === 'name' && c2 === 'id' && c3.startsWith('status')) {
      return i
    }
  }
  return -1
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
 * A plugin starts on a row with non-empty Name/ID/Status; Status does not wrap, so a row with
 * empty Status continues the previous row (wrapped name or Source-only continuation).
 */
function parseOpenclawPluginsTable(lines: string[], headerIdx: number): OpenClawPluginRow[] {
  const out: OpenClawPluginRow[] = []
  const seen = new Set<string>()
  let cur: TableAcc | null = null

  const flush = () => {
    if (!cur) return
    if (seen.has(cur.id)) return
    seen.add(cur.id)
    const description = cur.descParts.map((s) => s.trim()).filter(Boolean).join(' ') || undefined
    out.push({
      id: cur.id,
      name: cur.name,
      status: cur.status || undefined,
      version: cur.version,
      description,
    })
    cur = null
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!lineHasTablePipe(line)) continue
    const cells = splitPipeRowPreservingCells(line)
    if (cells.length < 5) continue
    if (rowIsTableSeparator(cells)) continue

    const name = (cells[1] ?? '').trim()
    const id = (cells[2] ?? '').trim()
    const statusCell = (cells[3] ?? '').trim()
    const source = (cells[4] ?? '').trim()
    const versionCell = (cells[5] ?? '').trim()

    const idOk = looksLikePluginId(id)

    if (cur && !statusCell) {
      if (name) cur.name = mergeWrappedPluginName(cur.name, name)
      if (id) {
        const merged = cur.id + id
        if (looksLikePluginId(merged) && merged.length <= 80) cur.id = merged
      }
      if (source) cur.descParts.push(source)
      continue
    }

    if (name && id && idOk && statusCell) {
      flush()
      const ver = isVersionTableCell(versionCell) ? versionCell.trim() : undefined
      const descParts: string[] = []
      if (source) descParts.push(source)
      cur = { name, id, status: statusCell, version: ver, descParts }
      continue
    }
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

  const headerIdx = findOpenclawPluginsTableHeader(lines)
  if (headerIdx >= 0) {
    const tableRows = parseOpenclawPluginsTable(lines, headerIdx)
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
        if (pipeCells[2] && /^[\d.+\w-]+$/.test(pipeCells[2]) && pipeCells[2].length < 32) {
          version = pipeCells[2]
        }
        if (pipeCells[3]) {
          description = pipeCells.slice(3).join(' ')
        }
      }

      if (!id || id.length > 120 || BOX_CHARS.test(id) || id.includes('|')) continue
      if (/^(name|id|plugin|version)$/i.test(id)) continue
      if (seen.has(id)) continue
      seen.add(id)
      rows.push({
        id,
        name: name || id,
        version,
        description,
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
  let r = await execOpenclaw(['plugins', 'list', '--json'])
  const jsonBlob = [r.stdout, r.stderr].filter(Boolean).join('\n')
  if (r.code === 0 && jsonBlob.trim()) {
    const rows = parsePluginsJsonString(jsonBlob)
    if (rows.length > 0) return { rows }
  }
  r = await execOpenclaw(['plugins', 'list'])
  if (r.code !== 0) {
    throw new Error(r.stderr || r.stdout || `openclaw plugins list failed (${r.code})`)
  }
  const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
  const fromText = parsePluginsPlainText(text)
  if (fromText.length > 0) return { rows: fromText }
  return { rows: [], fallbackText: text || undefined }
}

/** Run `openclaw plugins enable|disable <id>`; id is allowlisted to avoid shell injection */
export async function setOpenclawPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const x = id.trim()
  if (!looksLikePluginId(x)) {
    throw new Error('Invalid plugin id')
  }
  const sub = enabled ? 'enable' : 'disable'
  const r = await execOpenclaw(['plugins', sub, x])
  if (r.code !== 0) {
    throw new Error(
      [r.stderr, r.stdout].filter(Boolean).join('\n').trim() || `openclaw plugins ${sub} failed (${r.code})`
    )
  }
}
