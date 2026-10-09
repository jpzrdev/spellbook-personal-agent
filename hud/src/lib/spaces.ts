// Pages (spaces): the Bridge's closed catalog (bridge/app/spaces/schema.py) and the parsers the blocks use to
// read an item's `## Section`s. Pure functions, so the blocks stay thin and the parsing is tested.
import type { Color } from '../components/ui'

export type FieldType = 'text' | 'number' | 'select' | 'tags' | 'date' | 'bool' | 'rating' | 'url' | 'image' | 'duration' | 'progress'
export type FieldOption = { value: string; label?: string | null; color: Color }
export type FieldDef = { key: string; label: string; type: FieldType; options: FieldOption[]; max?: number | null; unit?: string | null }
export type View = 'cards' | 'list' | 'table' | 'kanban'
export type Collection = {
  view: View
  show: string[]
  group_by?: string | null
  image?: string | null
  sort?: { field: string; order: 'asc' | 'desc' } | null
  filters: string[]
}
type BlockBase = { title?: string | null }
export type Block = BlockBase &
  (
    | { block: 'properties'; fields: string[] }
    | { block: 'markdown'; section: string }
    | { block: 'checklist'; section: string; persist: boolean }
    | { block: 'steps'; section: string; timers: boolean }
    | { block: 'gallery'; section: string }
    | { block: 'links'; section: string }
    | { block: 'chart'; section: string; x: string; y: string; kind: 'line' | 'bar'; series?: string | null }
  )
export type BlockKind = Block['block']
/** A button with a declared result: tasks and row run without AI; skill writes into `section` (see schema.py). */
export type SpaceAction = {
  label: string
  description: string
  kind: 'tasks' | 'row' | 'skill'
  scope: 'page' | 'item'
  section?: string | null
  tag?: string | null
  columns: string[]
  touch?: string | null
  skill?: string | null
  task?: string | null
}
export type SpaceConfig = {
  name: string
  icon: string
  color: Color
  description: string
  item_name: string
  draft: boolean
  template?: string | null
  fields: FieldDef[]
  collection: Collection
  item: Block[]
  actions: SpaceAction[]
}
export type FieldValue = string | number | boolean | string[] | null
export type SpaceItem = {
  id: string
  title: string
  fields: Record<string, FieldValue>
  summary: string
  updated: string
  intro?: string
  sections?: Record<string, string>
  path?: string | null
}
export type SpaceSummary = { slug: string; name: string; icon: string; color: Color; description: string; draft: boolean; count: number; errors: string[] }
export type SpaceDetail = { slug: string; config: SpaceConfig | null; errors: string[]; items: SpaceItem[]; guide: string }
export type SpaceTemplate = { id: string; config: SpaceConfig; samples: SpaceItem[]; guide: string }
export type Module = {
  id: string
  kind: 'screen' | 'page'
  name: string
  description: string
  icon: string
  color: Color
  route: string
  active: boolean
  skills: string[]
}

/** A section of the item by name (case-insensitive), or '' when the note doesn't have it. */
export function section(item: SpaceItem, name: string): string {
  const found = Object.entries(item.sections ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase())
  return found?.[1] ?? ''
}

export type ListItem = { text: string; checked: boolean }

const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/

/** The top-level items of a markdown list (nested ones are left out, like the Bridge does when checking). */
export function listItems(text: string): ListItem[] {
  return text
    .split('\n')
    .map((line) => (/^\s/.test(line) ? null : LIST_ITEM.exec(line)))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ text: m[2].trim(), checked: (m[1] ?? ' ').toLowerCase() === 'x' }))
}

export type Step = { text: string; seconds: number | null }

const DURATION = /\((\d+(?:[.,]\d+)?)\s*(h|hours?|horas?|min|mins|minutes?|minutos?|s|sec|secs|seconds?|seg|segundos?)\)/i

/** Seconds in "(10 min)", "(1.5 h)", "(30 s)" (also in Portuguese). */
export function duration(text: string): number | null {
  const m = DURATION.exec(text)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  const unit = m[2].toLowerCase()
  const factor = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1
  return Math.round(n * factor)
}

export function steps(text: string): Step[] {
  return listItems(text).map((i) => ({ text: i.text, seconds: duration(i.text) }))
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

export type Image = { src: string; alt: string }

/** `![alt](url)` and `![[memory/path.png]]`. */
export function images(text: string): Image[] {
  const out: Image[] = []
  for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)|!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)) {
    if (m[2]) out.push({ src: m[2], alt: m[1] })
    else out.push({ src: m[3].trim(), alt: (m[4] ?? m[3].split('/').pop() ?? '').trim() })
  }
  return out
}

export type LinkItem = { label: string; href: string; host: string; note: string }

/** Markdown links (`[label](https://…)`) and bare URLs, one per list item or line. */
export function links(text: string): LinkItem[] {
  const out: LinkItem[] = []
  for (const line of text.split('\n')) {
    const md = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(line)
    const bare = md ? null : /(https?:\/\/[^\s)>\]]+)/.exec(line)
    const href = md?.[2] ?? bare?.[1]
    if (!href) continue
    let host = ''
    try {
      host = new URL(href).host.replace(/^www\./, '')
    } catch {
      continue
    }
    const note = line
      .replace(md?.[0] ?? href, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s*/, '')
      .replace(/^[\s:–—-]+/, '')
      .trim()
    out.push({ label: md?.[1] ?? host, href, host, note })
  }
  return out
}

export type Table = { headers: string[]; rows: string[][] }

/** The first markdown table of the text. */
export function table(text: string): Table | null {
  const lines = text.split('\n').map((l) => l.trim())
  const start = lines.findIndex((l, i) => l.startsWith('|') && /^\|?\s*:?-{2,}/.test(lines[i + 1] ?? ''))
  if (start < 0) return null
  const cells = (l: string) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const rows = []
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith('|')) break
    rows.push(cells(l))
  }
  return { headers: cells(lines[start]), rows }
}

/** The (x, y) points of two columns; rows whose y isn't a number are skipped. With `by` (a column) and `only`,
 * just the rows of that series. */
export function series(t: Table, x: string, y: string, by?: string | null, only?: string | null): Array<{ x: string; y: number }> {
  const find = (name: string) => t.headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const xi = find(x)
  const yi = find(y)
  const si = by ? find(by) : -1
  if (xi < 0 || yi < 0) return []
  return t.rows
    .filter((r) => si < 0 || !only || (r[si] ?? '').trim().toLowerCase() === only.toLowerCase())
    .map((r) => ({ x: r[xi] ?? '', y: parseFloat((r[yi] ?? '').replace(',', '.').replace(/[^\d.-]/g, '')) }))
    .filter((p) => Number.isFinite(p.y))
}

/** The distinct values of a column (a chart's series), in order of appearance. */
export function seriesNames(t: Table, by: string): string[] {
  const i = t.headers.findIndex((h) => h.toLowerCase() === by.toLowerCase())
  if (i < 0) return []
  const seen = new Map<string, string>() // case-insensitive, first spelling wins
  for (const r of t.rows) {
    const v = (r[i] ?? '').trim()
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v)
  }
  return [...seen.values()]
}

/** Names of a steps section's items without the details ("Bench press: 4 × 8" → "Bench press"); rests are left out. */
export function stepNames(text: string): string[] {
  return steps(text)
    .filter((s) => !/^(rest|descanso|pausa)\b/i.test(s.text))
    .map((s) => s.text.split(/\s*[:—–(]\s*|\s+-\s+/)[0].trim())
    .filter(Boolean)
}

export type Filters = Record<string, string | boolean | null>

function compare(a: FieldValue | undefined, b: FieldValue | undefined): number {
  const empty = (v: FieldValue | undefined) => v === null || v === undefined || v === ''
  if (empty(a) && empty(b)) return 0
  if (empty(a)) return 1 // empty values go last in both orders
  if (empty(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/** The items the filters let through, in the page's order (empty values always last). */
export function arrange(items: SpaceItem[], c: Collection, filters: Filters, query = ''): SpaceItem[] {
  const q = query.trim().toLowerCase()
  const kept = items.filter((i) => {
    if (q && !`${i.title} ${i.summary}`.toLowerCase().includes(q)) return false
    return Object.entries(filters).every(([key, want]) => {
      if (want === null || want === '') return true
      const v = i.fields[key]
      if (Array.isArray(v)) return v.includes(String(want))
      if (typeof want === 'boolean') return Boolean(v) === want
      return v === want
    })
  })
  if (!c.sort) return kept.sort((a, b) => a.title.localeCompare(b.title))
  const { field, order } = c.sort
  const value = (i: SpaceItem) => (field === 'title' ? i.title : i.fields[field])
  return kept.sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const empty = (v: FieldValue | undefined) => v === null || v === undefined || v === ''
    if (empty(va) || empty(vb)) return compare(va, vb)
    return order === 'desc' ? compare(vb, va) : compare(va, vb)
  })
}

export function optionOf(f: FieldDef, value: FieldValue): FieldOption | undefined {
  return f.options.find((o) => o.value === value)
}

/** A field's value as short text (cards, tables, the kanban). */
export function display(f: FieldDef, v: FieldValue | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  switch (f.type) {
    case 'select':
      return optionOf(f, v)?.label ?? String(v)
    case 'tags':
      return Array.isArray(v) ? v.join(', ') : String(v)
    case 'bool':
      return v ? 'yes' : 'no'
    case 'duration': {
      const min = Number(v)
      return min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`
    }
    case 'rating':
      return `${v}/${f.max ?? 5}`
    case 'progress':
      return `${Math.round((Number(v) / (f.max ?? 100)) * 100)}%`
    case 'number':
      return f.unit ? `${v} ${f.unit}` : String(v)
    case 'url':
      try {
        return new URL(String(v)).host.replace(/^www\./, '')
      } catch {
        return String(v)
      }
    default:
      return String(v)
  }
}

/** The page's sections, in the order of its blocks (what a new item's note gets as headings). */
export function blockSections(c: SpaceConfig): string[] {
  const seen: string[] = []
  for (const b of c.item) {
    if ('section' in b && !seen.some((s) => s.toLowerCase() === b.section.toLowerCase())) seen.push(b.section)
  }
  return seen
}
