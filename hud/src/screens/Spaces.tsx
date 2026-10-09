import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, CircleHelp, FileText, ListChecks, Play, Plus, Settings2, TableRowsSplit, Trash2, TriangleAlert, Wand2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Markdown } from '../components/Markdown'
import { ItemBody } from '../components/spaces/Blocks'
import { CollectionView, FilterBar } from '../components/spaces/Collection'
import { FieldEditor } from '../components/spaces/Fields'
import { ICON_NAMES, SpaceIcon } from '../components/spaces/icons'
import { Badge, Button, Dropdown, EmptyState, IconChip, Input, Modal, Tabs, Toggle, useToast, type Color } from '../components/ui'
import { focusRing, raised, solid, sunken } from '../components/ui/styles'
import { isSessionActive, patch } from '../lib/api'
import { cn } from '../lib/cn'
import {
  useAgent,
  useCreateItem,
  useDeleteItem,
  useModulePreview,
  useModules,
  useRemoveSpace,
  useSaveSpace,
  useSessions,
  useSpace,
  useSpaceAction,
  useSpaceItem,
  useSpaces,
  useToggleModule,
  useUpdateItem,
} from '../lib/queries'
import { arrange, section, stepNames, type Block, type FieldValue, type Filters, type Module, type SpaceAction, type SpaceConfig, type SpaceItem, type View } from '../lib/spaces'

const BLOCK_NAMES: Record<Block['block'], string> = {
  properties: 'Properties',
  markdown: 'Text',
  checklist: 'Checklist',
  steps: 'Steps',
  gallery: 'Gallery',
  links: 'Links',
  chart: 'Chart',
}
const COLORS: Color[] = ['primary', 'primary-light', 'wood', 'gold', 'ember', 'violet', 'silver']
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'cards', label: 'Cards' },
  { id: 'list', label: 'List' },
  { id: 'table', label: 'Table' },
  { id: 'kanban', label: 'Kanban' },
]

function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-1.5 self-start rounded-pill text-sm font-semibold text-ink-muted hover:text-ink', focusRing)}>
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </Link>
  )
}

/** The page's guide: what each part and each button does (the assistant reads the same text). */
function HowItWorks({ guide, open: startOpen = false }: { guide: string; open?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  if (!guide.trim()) return null
  return (
    <section className={cn(raised, 'rounded-card')}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn('flex w-full cursor-pointer items-center gap-3 rounded-card p-4 text-left', focusRing)}>
        <CircleHelp className="size-5 text-primary" aria-hidden />
        <span className="flex-1 font-semibold">How it works</span>
        <ChevronDown className={cn('size-4 text-ink-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <Markdown text={guide} className="anim-enter px-5 pb-5 text-sm" />}
    </section>
  )
}

// ---------- Modules ----------

/** A module with its switch (the Modules screen and the setup). */
export function ModuleRow({ m, compact }: { m: Module; compact?: boolean }) {
  const toggle = useToggleModule()
  const toast = useToast()
  const set = (active: boolean) => toggle.mutate({ id: m.id, active }, { onError: (e) => toast('error', e.message) })
  return (
    <article className={cn('flex items-start gap-4 rounded-card p-4', compact ? 'shadow-raised-sm' : cn(raised, 'p-5'))}>
      <IconChip color={m.color} size={compact ? 'sm' : 'md'}>
        <SpaceIcon name={m.icon} />
      </IconChip>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-semibold">{m.name}</h3>
        <p className="text-sm text-ink-muted">{m.description}</p>
        {!compact && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
            {m.active && (
              <Link to={m.route} className={cn('rounded-pill text-primary-text hover:underline', focusRing)}>
                Open
              </Link>
            )}
            {m.kind === 'page' && !m.active && (
              <Link to={`/modules/${m.id}`} className={cn('rounded-pill text-ink-muted hover:text-ink', focusRing)}>
                Preview
              </Link>
            )}
          </div>
        )}
      </div>
      <Toggle on={m.active} onChange={set} label={`${m.name} on`} disabled={toggle.isPending} />
    </article>
  )
}

/** The features the user turns on and off; turning one off hides it and keeps its data. */
export function Modules() {
  const agent = useAgent().name
  const { data: modules = [], isPending } = useModules()
  const { data: spaces = [] } = useSpaces()
  const ids = new Set(modules.map((m) => m.id))
  const others = spaces.filter((s) => !ids.has(s.slug))

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Manage modules</h1>
        <p className="mt-1 text-ink-muted">Turn on what you want {agent} to look after. Turning a module off only hides it: nothing is deleted.</p>
      </header>
      {isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {modules.map((m) => (
            <li key={m.id}>
              <ModuleRow m={m} />
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <section aria-labelledby="modules-others" className="flex flex-col gap-3">
          <div>
            <h2 id="modules-others" className="text-xl font-semibold">Other pages</h2>
            <p className="text-sm text-ink-muted">Pages in your memory (spaces/) that aren’t modules.</p>
          </div>
          <ul className="flex flex-col gap-2">
            {others.map((s) => (
              <li key={s.slug}>
                <Link to={`/p/${s.slug}`} className={cn('flex items-center gap-3 rounded-control p-3 shadow-raised-sm hover:shadow-raised', focusRing)}>
                  {s.errors.length ? <TriangleAlert className="size-4 text-ember" aria-hidden /> : <SpaceIcon name={s.icon} className="size-4" />}
                  <span className="flex-1 font-semibold">{s.name}</span>
                  {s.draft && <Badge color={s.errors.length ? 'ember' : 'gold'}>{s.errors.length ? 'broken' : 'draft'}</Badge>}
                  <span className="text-sm text-ink-muted">{s.count} item(s)</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PageHeader({ config, count, children }: { config: SpaceConfig; count?: number; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        <IconChip color={config.color} size="lg">
          <SpaceIcon name={config.icon} />
        </IconChip>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{config.name}</h1>
          <p className="mt-1 text-ink-muted">
            {config.description}
            {count !== undefined && <span className="whitespace-nowrap"> · {count} {count === 1 ? config.item_name : `${config.item_name}s`}</span>}
          </p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  )
}

/** A page module before turning it on: its guide and a sample (timers and checklists work, nothing is saved). */
export function ModulePreview() {
  const { id = '' } = useParams()
  const { data: t, isPending } = useModulePreview(id)
  const toggle = useToggleModule()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState<SpaceItem | null>(null)

  if (isPending) return <p className="text-ink-muted">loading…</p>
  if (!t) return <EmptyState icon={<CircleHelp />} color="ember" title="Module not found" />
  const item = open ?? t.samples[0]

  return (
    <div className="flex flex-col gap-6">
      <Back to="/modules" label="Manage modules" />
      <PageHeader config={t.config}>
        <Button
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ id, active: true }, { onSuccess: () => navigate(`/p/${id}`), onError: (e) => toast('error', e.message) })}
        >
          <Check className="size-4" aria-hidden /> Turn on
        </Button>
      </PageHeader>
      <p className={cn(sunken, 'rounded-control px-4 py-3 text-sm text-ink-muted')}>A preview with a sample. When you turn it on, the page starts empty: add things here or by chat.</p>
      <HowItWorks guide={t.guide} open />
      <CollectionView config={t.config} items={t.samples} onOpen={setOpen} />
      {item && (
        <section aria-label={item.title} className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">{item.title}</h2>
          <ItemBody config={t.config} item={item} />
        </section>
      )}
    </div>
  )
}

// ---------- A page ----------

/** A new item: its title and the page's fields (the note gets one heading per section of the page). */
function NewItemModal({ slug, config, open, onClose }: { slug: string; config: SpaceConfig; open: boolean; onClose: () => void }) {
  const create = useCreateItem(slug)
  const navigate = useNavigate()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const fields = config.fields.filter((f) => f.type !== 'image')

  function save() {
    create.mutate(
      { title: title.trim(), fields: values },
      {
        onSuccess: (r) => {
          setTitle('')
          setValues({})
          onClose()
          navigate(`/p/${slug}/${r.id}`)
        },
        onError: (e) => toast('error', e.message),
      },
    )
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`New ${config.item_name}`}
      icon={<SpaceIcon name={config.icon} />}
      color={config.color}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!title.trim() || create.isPending}>
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{f.label}</span>
              <FieldEditor field={f} value={values[f.key] ?? null} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function Chooser<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: Array<{ value: T; text: string }>; onChange: (v: T | '') => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T | '')} className={cn(sunken, 'h-11 cursor-pointer rounded-control px-3 font-normal', focusRing)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  )
}

/** How the page looks, edited by hand (no AI): view, fields shown, sort, icon, block order. */
function SettingsModal({ slug, config, open, onClose }: { slug: string; config: SpaceConfig; open: boolean; onClose: () => void }) {
  const save = useSaveSpace(slug)
  const toast = useToast()
  const [c, setC] = useState(config)
  const set = (patch: Partial<SpaceConfig>) => setC((x) => ({ ...x, ...patch }))
  const setCol = (patch: Partial<SpaceConfig['collection']>) => setC((x) => ({ ...x, collection: { ...x.collection, ...patch } }))
  const selects = c.fields.filter((f) => f.type === 'select')
  const imagesF = c.fields.filter((f) => f.type === 'image')
  const moved = (i: number, to: number) => {
    const item = [...c.item]
    const [b] = item.splice(i, 1)
    item.splice(to, 0, b)
    set({ item })
  }

  function submit() {
    save.mutate(c, {
      onSuccess: () => {
        toast('success', 'Page saved')
        onClose()
      },
      onError: (e) => toast('error', e.message),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Page settings"
      icon={<Settings2 />}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            <Check className="size-4" aria-hidden /> Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Input label="Name" value={c.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Icon and color</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICON_NAMES.map((name) => (
              <button key={name} type="button" aria-label={name} aria-pressed={c.icon === name} onClick={() => set({ icon: name })} className={cn('grid size-9 cursor-pointer place-items-center rounded-pill [&_svg]:size-4', c.icon === name ? 'text-primary-text shadow-sunken-sm' : 'text-ink-muted shadow-raised-sm', focusRing)}>
                <SpaceIcon name={name} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button key={color} type="button" aria-label={color} aria-pressed={c.color === color} onClick={() => set({ color })} className={cn('grid size-9 cursor-pointer place-items-center rounded-pill', c.color === color ? 'shadow-sunken-sm' : 'shadow-raised-sm', focusRing)}>
                <span className={cn('size-4 rounded-pill', solid[color])} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold">How the list looks</legend>
          <Tabs label="View" value={c.collection.view} onChange={(v) => setCol({ view: v as View, group_by: v === 'kanban' ? c.collection.group_by ?? selects[0]?.key ?? null : c.collection.group_by })} items={VIEWS.filter((v) => v.id !== 'kanban' || selects.length)} />
          <div className="grid gap-4 sm:grid-cols-2">
            {c.collection.view === 'kanban' && (
              <Chooser label="Columns by" value={c.collection.group_by ?? ''} options={selects.map((f) => ({ value: f.key, text: f.label }))} onChange={(v) => setCol({ group_by: v || null })} />
            )}
            {c.collection.view === 'cards' && imagesF.length > 0 && (
              <Chooser label="Cover" value={c.collection.image ?? ''} options={[{ value: '', text: 'None' }, ...imagesF.map((f) => ({ value: f.key, text: f.label }))]} onChange={(v) => setCol({ image: v || null })} />
            )}
            <Chooser
              label="Sort by"
              value={c.collection.sort ? `${c.collection.sort.field}:${c.collection.sort.order}` : ''}
              options={[{ value: '', text: 'Name' }, ...c.fields.filter((f) => !['tags', 'image'].includes(f.type)).flatMap((f) => [
                { value: `${f.key}:asc`, text: `${f.label} ↑` },
                { value: `${f.key}:desc`, text: `${f.label} ↓` },
              ])]}
              onChange={(v) => setCol({ sort: v ? { field: v.split(':')[0], order: v.split(':')[1] as 'asc' | 'desc' } : null })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Fields shown on each {c.item_name}</span>
            <div className="flex flex-wrap gap-2">
              {c.fields.filter((f) => f.type !== 'image').map((f) => {
                const on = c.collection.show.includes(f.key)
                return (
                  <button key={f.key} type="button" aria-pressed={on} onClick={() => setCol({ show: on ? c.collection.show.filter((k) => k !== f.key) : [...c.collection.show, f.key].slice(0, 8) })} className={cn('cursor-pointer rounded-pill px-3 py-1.5 text-sm font-semibold', on ? 'text-primary-text shadow-sunken-sm' : 'text-ink-muted shadow-raised-sm', focusRing)}>
                    {on && <Check className="mr-1 inline size-3.5" aria-hidden />}
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Blocks of a {c.item_name}, top to bottom</legend>
          <ol className="flex flex-col gap-2">
            {c.item.map((b, i) => (
              <li key={`${b.block}-${i}`} className="flex items-center gap-2 rounded-control p-2 pl-3 shadow-raised-sm">
                <span className="flex-1 text-sm">
                  <span className="font-semibold">{BLOCK_NAMES[b.block]}</span>
                  {'section' in b && <span className="text-ink-muted"> · {b.title ?? b.section}</span>}
                </span>
                <Button variant="icon" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => moved(i, i - 1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="icon" size="sm" aria-label="Move down" disabled={i === c.item.length - 1} onClick={() => moved(i, i + 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button variant="icon" size="sm" aria-label="Hide block" disabled={c.item.length === 1} onClick={() => set({ item: c.item.filter((_, j) => j !== i) })}>
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-muted">Hiding a block keeps its text in each note.</p>
        </fieldset>
      </div>
    </Modal>
  )
}

/** A page: its items in the page's view, with filters and the guide. */
export function SpaceScreen() {
  const { slug = '' } = useParams()
  const { data, isPending, error } = useSpace(slug)
  const save = useSaveSpace(slug)
  const remove = useRemoveSpace()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: modules = [] } = useModules()
  const [filters, setFilters] = useState<Filters>({})
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'new' | 'settings' | null>(null)
  const items = useMemo(() => (data?.config ? arrange(data.items, data.config.collection, filters, query) : []), [data, filters, query])
  const module = modules.find((m) => m.id === slug)

  if (isPending) return <p className="text-ink-muted">loading…</p>
  if (error || !data) return <EmptyState icon={<FileText />} color="ember" title="Page not found" description={error?.message} />

  function discard() {
    if (!confirm('Remove this page? Its notes stay in the memory (spaces/).')) return
    remove.mutate(slug, { onSuccess: () => navigate('/modules'), onError: (e) => toast('error', e.message) })
  }

  if (!data.config)
    return (
      <div className="flex flex-col gap-6">
        <Back to="/modules" label="Manage modules" />
        <EmptyState
          icon={<TriangleAlert />}
          color="ember"
          title="This page doesn’t load"
          description={
            <span className="flex flex-col gap-2 text-left">
              <span>Its layout (spaces/{slug}/space.yaml) has problems:</span>
              <span className="flex flex-col gap-1 font-mono text-xs">
                {data.errors.map((e) => (
                  <span key={e}>• {e}</span>
                ))}
              </span>
            </span>
          }
          action={
            <Button variant="ghost" onClick={discard}>
              <Trash2 className="size-4" aria-hidden /> Remove
            </Button>
          }
        />
      </div>
    )

  const config = data.config
  const move = (item: SpaceItem, field: string, value: FieldValue) =>
    patch(`/spaces/${slug}/items/${item.id}`, { fields: { [field]: value } })
      .then(() => qc.invalidateQueries({ queryKey: ['spaces', slug] }))
      .catch((e: Error) => toast('error', e.message))
  const options = [
    { id: 'settings', label: 'Page settings', icon: <Settings2 />, onSelect: () => setModal('settings') },
    ...(module ? [] : [{ id: 'remove', label: 'Remove page', icon: <Trash2 />, danger: true, onSelect: discard }]),
  ]

  return (
    <div className="flex flex-col gap-6">
      {config.draft && (
        <div className={cn(raised, 'flex flex-wrap items-center gap-3 rounded-card p-4')}>
          <Badge color="gold">draft</Badge>
          <p className="min-w-[12rem] flex-1 text-sm">This page isn’t on the menu. Publish it to put it there.</p>
          <Button variant="ghost" onClick={discard}>
            Discard
          </Button>
          <Button onClick={() => save.mutate({ ...config, draft: false }, { onSuccess: () => toast('success', `“${config.name}” is on the menu`), onError: (e) => toast('error', e.message) })}>
            <Check className="size-4" aria-hidden /> Publish
          </Button>
        </div>
      )}
      <PageHeader config={config} count={data.items.length}>
        <Dropdown label={<Settings2 className="size-4" aria-label="Page options" />} align="right" items={options} />
        <Button onClick={() => setModal('new')}>
          <Plus className="size-4" aria-hidden /> New {config.item_name}
        </Button>
      </PageHeader>
      <HowItWorks guide={data.guide} open={data.items.length === 0} />
      {data.items.length > 0 && <FilterBar config={config} items={data.items} filters={filters} onFilters={setFilters} query={query} onQuery={setQuery} />}
      {data.items.length === 0 ? (
        <EmptyState
          icon={<SpaceIcon name={config.icon} />}
          color={config.color}
          title={`No ${config.item_name}s yet`}
          description="Add one here, or tell the assistant in the chat."
          action={
            <Button onClick={() => setModal('new')}>
              <Plus className="size-4" aria-hidden /> New {config.item_name}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <p className="text-ink-muted">Nothing matches the filters.</p>
      ) : (
        <CollectionView config={config} items={items} href={(i) => `/p/${slug}/${i.id}`} onMove={move} />
      )}
      <NewItemModal slug={slug} config={config} open={modal === 'new'} onClose={() => setModal(null)} />
      {modal === 'settings' && <SettingsModal slug={slug} config={config} open onClose={() => setModal(null)} />}
    </div>
  )
}

// ---------- An item and its buttons ----------

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const isDateColumn = (c: string) => /^(date|data|dia|day)\b/i.test(c)

/** The form of a `row` button: one field per column; "Save and add another" keeps the date. */
function RowModal({ action, config, item, onClose, onSave, saving }: { action: SpaceAction; config: SpaceConfig; item: SpaceItem; onClose: () => void; onSave: (values: Record<string, string>, again: boolean) => void; saving: boolean }) {
  const fresh = () => Object.fromEntries(action.columns.map((c) => [c, isDateColumn(c) ? today() : '']))
  const [values, setValues] = useState<Record<string, string>>(fresh)
  // Names the item already uses (its steps, e.g. the exercises) as suggestions.
  const stepsBlock = config.item.find((b) => b.block === 'steps')
  const suggestions = stepsBlock && 'section' in stepsBlock ? stepNames(section(item, stepsBlock.section)) : []
  const listId = `row-suggestions-${action.section}`
  const filled = action.columns.some((c) => !isDateColumn(c) && values[c].trim())

  function submit(again: boolean) {
    onSave(values, again)
    if (again) {
      setValues((v) => Object.fromEntries(action.columns.map((c) => [c, isDateColumn(c) ? v[c] : ''])))
      document.querySelector<HTMLInputElement>('[role=dialog] input:not([type=date])')?.focus()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={action.label}
      icon={<TableRowsSplit />}
      color={config.color}
      footer={
        <>
          <Button variant="ghost" onClick={() => submit(true)} disabled={!filled || saving}>
            Save and add another
          </Button>
          <Button onClick={() => submit(false)} disabled={!filled || saving}>
            <Check className="size-4" aria-hidden /> Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{action.description}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {action.columns.map((c, i) => {
            const date = isDateColumn(c)
            const suggest = !date && i === action.columns.findIndex((x) => !isDateColumn(x)) && suggestions.length > 0
            return (
              <Input
                key={c}
                label={c}
                type={date ? 'date' : 'text'}
                inputMode={/sets|reps|load|kg|séries|repetições|carga|peso|\(/i.test(c) ? 'decimal' : undefined}
                list={suggest ? listId : undefined}
                value={values[c]}
                onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
              />
            )
          })}
        </div>
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    </Modal>
  )
}

const KIND_ICON = { tasks: <ListChecks className="size-4" aria-hidden />, row: <TableRowsSplit className="size-4" aria-hidden />, skill: <Wand2 className="size-4" aria-hidden /> }

/** The item's buttons, each with what it does and where its result goes. */
function ItemActions({ slug, config, item, running }: { slug: string; config: SpaceConfig; item: SpaceItem; running: string | null }) {
  const run = useSpaceAction(slug)
  const toast = useToast()
  const [form, setForm] = useState<number | null>(null)
  const actions = config.actions.map((a, index) => ({ ...a, index })).filter((a) => a.scope === 'item')
  if (!actions.length) return null

  function go(index: number, values?: Record<string, string>, close = true) {
    const a = config.actions[index]
    run.mutate(
      { index, item: item.id, values },
      {
        onSuccess: (r) => {
          if (r.kind === 'tasks') toast('success', r.created.length ? `${r.created.length} task(s) created` : 'Everything is already in your tasks')
          if (r.kind === 'row') toast('success', 'Saved')
          if (r.kind === 'skill') toast('info', `${a.label}: the assistant is on it. “${a.section}” updates by itself.`)
          if (close) setForm(null)
        },
        onError: (e) => toast('error', e.message),
      },
    )
  }

  return (
    <section aria-label="Actions" className="grid gap-3 sm:grid-cols-2">
      {actions.map((a) => {
        const busy = running !== null && a.kind === 'skill' && a.section === running
        return (
          <div key={a.index} className="flex items-start gap-3 rounded-control p-3 shadow-raised-sm">
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled={busy || run.isPending}
              onClick={() => (a.kind === 'row' ? setForm(a.index) : go(a.index))}
            >
              {busy ? <span aria-hidden className="size-2 animate-pulse rounded-pill bg-primary" /> : KIND_ICON[a.kind]} {a.label}
            </Button>
            <p className="pt-1.5 text-xs text-ink-muted">{busy ? 'The assistant is working on it…' : a.description}</p>
          </div>
        )
      })}
      {form !== null && (
        <RowModal action={config.actions[form]} config={config} item={item} saving={run.isPending} onClose={() => setForm(null)} onSave={(values, again) => go(form, values, !again)} />
      )}
    </section>
  )
}

/** One item: its blocks, editable in place, and its buttons. */
export function SpaceItemScreen() {
  const { slug = '', item: id = '' } = useParams()
  const page = useSpace(slug)
  const { data: item, isPending, error, refetch } = useSpaceItem(slug, id)
  const update = useUpdateItem(slug, id)
  const del = useDeleteItem(slug)
  const { data: sessions = [] } = useSessions()
  const navigate = useNavigate()
  const toast = useToast()
  const config = page.data?.config

  // A `skill` button running on this item: which section it is writing (it refreshes when the session ends).
  const session = item?.path ? sessions.find((s) => s.target === item.path && isSessionActive(s)) : undefined
  const running = session && config ? (config.actions.find((a) => a.kind === 'skill' && session.request.endsWith(`: ${a.label}`))?.section ?? null) : null
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !session) refetch()
    wasRunning.current = Boolean(session)
  }, [session, refetch])

  if (isPending || page.isPending) return <p className="text-ink-muted">loading…</p>
  if (error || !item || !config) return <EmptyState icon={<FileText />} color="ember" title="Not found" description={error?.message} />

  const fail = (e: Error) => toast('error', e.message)
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Back to={`/p/${slug}`} label={config.name} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">{item.title}</h1>
        <Dropdown
          label={<Settings2 className="size-4" aria-label="Item options" />}
          align="right"
          items={[
            { id: 'note', label: 'Open the note', icon: <FileText />, onSelect: () => navigate(`/memory?note=${encodeURIComponent(item.path ?? '')}`) },
            {
              id: 'delete',
              label: `Delete ${config.item_name}`,
              icon: <Trash2 />,
              danger: true,
              onSelect: () => confirm(`Delete “${item.title}”? It goes to the memory's trash.`) && del.mutate(id, { onSuccess: () => navigate(`/p/${slug}`), onError: fail }),
            },
          ]}
        />
      </header>
      <ItemActions slug={slug} config={config} item={item} running={running} />
      <ItemBody
        config={config}
        item={item}
        writing={running}
        onField={(key, value) => update.mutate({ fields: { [key]: value } }, { onError: fail })}
        onCheck={(sec, index, done) => update.mutate({ check: { section: sec, index, done } }, { onError: fail })}
      />
      {session && (
        <Link to={`/terminals?session=${session.id}`} className={cn('inline-flex items-center gap-1.5 self-start text-xs font-semibold text-ink-muted hover:text-ink', focusRing)}>
          <Play className="size-3" aria-hidden /> view the assistant's session
        </Link>
      )}
    </div>
  )
}
