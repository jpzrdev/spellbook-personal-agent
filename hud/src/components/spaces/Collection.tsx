import { Search } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn'
import { display, type Filters, type FieldDef, type FieldValue, type SpaceConfig, type SpaceItem } from '../../lib/spaces'
import { tinted, focusRing, raised, solid, sunken } from '../ui/styles'
import { FieldText, MemoryImage } from './Fields'
import { SpaceIcon } from './icons'

type Props = {
  config: SpaceConfig
  items: SpaceItem[]
  /** Where an item opens (a page in the memory); without it, `onOpen` (a template's preview). */
  href?: (item: SpaceItem) => string
  onOpen?: (item: SpaceItem) => void
  /** Kanban: an item dragged to another column. */
  onMove?: (item: SpaceItem, field: string, value: FieldValue) => void
}

function fieldsOf(config: SpaceConfig, keys: string[]): FieldDef[] {
  return keys.map((k) => config.fields.find((f) => f.key === k)).filter((f): f is FieldDef => Boolean(f))
}

/** The item as a link or a button, with the same focus ring. */
function Opener({ item, href, onOpen, className, children }: Pick<Props, 'href' | 'onOpen'> & { item: SpaceItem; className?: string; children: ReactNode }) {
  const cls = cn('block text-left', focusRing, className)
  if (href)
    return (
      <Link to={href(item)} className={cls}>
        {children}
      </Link>
    )
  return (
    <button type="button" onClick={() => onOpen?.(item)} className={cn(cls, 'w-full cursor-pointer')}>
      {children}
    </button>
  )
}

function Shown({ config, item, className }: { config: SpaceConfig; item: SpaceItem; className?: string }) {
  const fields = fieldsOf(config, config.collection.show).filter((f) => f.type !== 'image')
  if (!fields.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {fields.map((f) => (
        <FieldText key={f.key} field={f} value={item.fields[f.key]} />
      ))}
    </div>
  )
}

function Cover({ config, item, className }: { config: SpaceConfig; item: SpaceItem; className?: string }) {
  const key = config.collection.image
  const src = key ? item.fields[key] : null
  if (src && typeof src === 'string') return <MemoryImage src={src} alt="" className={className} />
  return (
    <span aria-hidden className={cn('grid place-items-center', tinted[config.color], className)}>
      <SpaceIcon name={config.icon} className="size-8 opacity-60" />
    </span>
  )
}

function Cards({ config, items, href, onOpen }: Props) {
  const cover = Boolean(config.collection.image)
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <Opener item={item} href={href} onOpen={onOpen} className="h-full rounded-card">
            <article className={cn(raised, 'flex h-full flex-col overflow-hidden rounded-card transition-shadow hover:shadow-raised-lg')}>
              {cover && <Cover config={config} item={item} className="aspect-[16/9] w-full" />}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h3 className="text-lg leading-tight font-semibold">{item.title}</h3>
                {item.summary && <p className="line-clamp-2 text-sm text-ink-muted">{item.summary}</p>}
                <Shown config={config} item={item} className="mt-auto pt-1" />
              </div>
            </article>
          </Opener>
        </li>
      ))}
    </ul>
  )
}

function List({ config, items, href, onOpen }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Opener item={item} href={href} onOpen={onOpen} className="rounded-control">
            <article className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control p-4 shadow-raised-sm transition-shadow hover:shadow-raised">
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-pill', solid[config.color])} />
              <div className="min-w-[10rem] flex-1">
                <h3 className="font-semibold">{item.title}</h3>
                {item.summary && <p className="line-clamp-1 text-sm text-ink-muted">{item.summary}</p>}
              </div>
              <Shown config={config} item={item} />
            </article>
          </Opener>
        </li>
      ))}
    </ul>
  )
}

function Table({ config, items, href, onOpen }: Props) {
  const fields = fieldsOf(config, config.collection.show).filter((f) => f.type !== 'image')
  return (
    <div className={cn(sunken, 'overflow-x-auto rounded-card p-1.5')}>
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{config.name}</caption>
        <thead className="text-left text-xs tracking-wide text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              {config.item_name}
            </th>
            {fields.map((f) => (
              <th key={f.key} scope="col" className="px-3 py-2.5 font-semibold">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-shade/60">
              <th scope="row" className="px-3 py-2 text-left font-semibold">
                <Opener item={item} href={href} onOpen={onOpen} className="rounded-control px-1 py-1 hover:text-primary-text">
                  {item.title}
                </Opener>
              </th>
              {fields.map((f) => (
                <td key={f.key} className="px-3 py-2 align-middle">
                  <FieldText field={f} value={item.fields[f.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kanban({ config, items, href, onOpen, onMove }: Props) {
  const group = config.fields.find((f) => f.key === config.collection.group_by)
  const [over, setOver] = useState<string | null>(null)
  if (!group) return <List config={config} items={items} href={href} onOpen={onOpen} />
  const columns = [...group.options.map((o) => ({ value: o.value as string | null, label: o.label ?? o.value, color: o.color })), { value: null, label: `No ${group.label.toLowerCase()}`, color: 'silver' as const }]
  const inColumn = (value: string | null) => items.filter((i) => (value === null ? !group.options.some((o) => o.value === i.fields[group.key]) : i.fields[group.key] === value))

  function drop(e: DragEvent, value: string | null) {
    e.preventDefault()
    setOver(null)
    const item = items.find((i) => i.id === e.dataTransfer.getData('text/plain'))
    if (item && item.fields[group!.key] !== value) onMove?.(item, group!.key, value)
  }

  return (
    <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2">
      {columns.map((col) => {
        const list = inColumn(col.value)
        if (col.value === null && !list.length) return null
        const key = col.value ?? '__none'
        return (
          <section
            key={key}
            aria-label={col.label}
            onDragOver={onMove ? (e) => (e.preventDefault(), setOver(key)) : undefined}
            onDragLeave={() => setOver((o) => (o === key ? null : o))}
            onDrop={onMove ? (e) => drop(e, col.value) : undefined}
            className={cn(sunken, 'flex w-72 shrink-0 snap-start flex-col gap-3 rounded-card p-3 transition-shadow', over === key && 'outline-2 outline-primary/60')}
          >
            <header className="flex items-center gap-2 px-1">
              <span aria-hidden className={cn('size-2 rounded-pill', solid[col.color])} />
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="ml-auto text-xs text-ink-muted tabular-nums">{list.length}</span>
            </header>
            {list.map((item) => (
              <div key={item.id} draggable={Boolean(onMove)} onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}>
                <Opener item={item} href={href} onOpen={onOpen} className="rounded-control">
                  <article className={cn(raised, 'flex flex-col gap-2 overflow-hidden rounded-control shadow-raised-sm transition-shadow hover:shadow-raised')}>
                    {config.collection.image && typeof item.fields[config.collection.image] === 'string' && (
                      <Cover config={config} item={item} className="aspect-[3/1] w-full" />
                    )}
                    <div className="flex flex-col gap-1.5 px-3 pt-1 pb-3">
                      <h4 className="font-semibold">{item.title}</h4>
                      <Shown config={{ ...config, collection: { ...config.collection, show: config.collection.show.filter((k) => k !== group.key) } }} item={item} />
                    </div>
                  </article>
                </Opener>
              </div>
            ))}
            {!list.length && <p className="px-1 py-4 text-center text-xs text-ink-muted">{onMove ? 'drop here' : 'empty'}</p>}
          </section>
        )
      })}
    </div>
  )
}

export function CollectionView(props: Props) {
  switch (props.config.collection.view) {
    case 'list':
      return <List {...props} />
    case 'table':
      return <Table {...props} />
    case 'kanban':
      return <Kanban {...props} />
    default:
      return <Cards {...props} />
  }
}

const pill = cn(sunken, 'h-9 cursor-pointer rounded-pill px-3 text-sm font-semibold', focusRing)

/** Search and the page's filters (select, tags, bool). */
export function FilterBar({ config, items, filters, onFilters, query, onQuery }: { config: SpaceConfig; items: SpaceItem[]; filters: Filters; onFilters: (f: Filters) => void; query: string; onQuery: (q: string) => void }) {
  const fields = fieldsOf(config, config.collection.filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={cn(sunken, 'flex h-9 min-w-[12rem] flex-1 items-center gap-2 rounded-pill px-3 sm:flex-none')}>
        <Search className="size-4 text-ink-muted" aria-hidden />
        <span className="sr-only">Search {config.name}</span>
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted/70" />
      </label>
      {fields.map((f) => {
        const value = filters[f.key]
        const set = (v: string | boolean | null) => onFilters({ ...filters, [f.key]: v })
        if (f.type === 'bool')
          return (
            <select key={f.key} aria-label={f.label} value={value === null || value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value === '' ? null : e.target.value === 'true')} className={pill}>
              <option value="">{f.label}: any</option>
              <option value="true">{f.label}: yes</option>
              <option value="false">{f.label}: no</option>
            </select>
          )
        const options =
          f.type === 'tags'
            ? [...new Set(items.flatMap((i) => (Array.isArray(i.fields[f.key]) ? (i.fields[f.key] as string[]) : [])))].sort().map((t) => ({ value: t, text: `#${t}` }))
            : f.options.map((o) => ({ value: o.value, text: display(f, o.value) }))
        return (
          <select key={f.key} aria-label={f.label} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value || null)} className={pill}>
            <option value="">{f.label}: all</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
        )
      })}
    </div>
  )
}
