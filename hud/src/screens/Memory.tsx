import { Activity, ChevronRight, Eye, FilePlus, FileText, Folder, FolderOpen, Library, Link2, MoreHorizontal, Pencil, Save, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Markdown } from '../components/Markdown'
import { Badge, Button, Card, Dropdown, EmptyState, Input, Modal, Pill, SearchInput, useToast } from '../components/ui'
import { focusRing, sunken } from '../components/ui/styles'
import { BridgeError, fetchMemoryFile, type MemoryHealth, type MemoryNote, type TreeNode } from '../lib/api'
import { cn } from '../lib/cn'
import {
  useBacklinks,
  useCreateNote,
  useDeleteNote,
  useMemoryHealth,
  useMemorySearch,
  useMoveNote,
  useNote,
  useRunSkill,
  useSaveNote,
  useTree,
} from '../lib/queries'

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i

function Branch({ nodes, open, onOpen, level }: { nodes: TreeNode[]; open: string | null; onOpen: (p: string) => void; level: number }) {
  return (
    <ul className={cn('flex flex-col', level > 0 && 'ml-3 border-l border-shade/40 pl-2')}>
      {nodes.map((n) => (n.type === 'folder' ? <FolderItem key={n.path} node={n} open={open} onOpen={onOpen} level={level} /> : (
        <li key={n.path}>
          <button
            type="button"
            onClick={() => onOpen(n.path)}
            aria-current={open === n.path ? 'page' : undefined}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-sm',
              focusRing,
              open === n.path ? 'font-semibold text-primary-text shadow-sunken-sm' : 'text-ink hover:bg-ink/5',
            )}
          >
            <FileText className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            <span className="truncate">{n.name.replace(/\.md$/, '')}</span>
          </button>
        </li>
      )))}
    </ul>
  )
}

function FolderItem({ node, open, onOpen, level }: { node: TreeNode; open: string | null; onOpen: (p: string) => void; level: number }) {
  const containsOpen = open?.startsWith(node.path + '/') ?? false
  const [expanded, setExpanded] = useState(containsOpen || level === 0 && ['life', 'wiki'].includes(node.name))
  const show = expanded || containsOpen
  return (
    <li>
      <button
        type="button"
        aria-expanded={show}
        onClick={() => setExpanded(!show)}
        className={cn('flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm font-semibold hover:bg-ink/5', focusRing)}
      >
        <ChevronRight className={cn('size-3.5 shrink-0 text-ink-muted transition-transform', show && 'rotate-90')} aria-hidden />
        {show ? <FolderOpen className="size-4 text-gold" aria-hidden /> : <Folder className="size-4 text-gold" aria-hidden />}
        <span className="truncate">{node.name}</span>
      </button>
      {show && node.children && <Branch nodes={node.children} open={open} onOpen={onOpen} level={level + 1} />}
    </li>
  )
}

/** Full-text search results (names and contents). */
function Results({ term, open, onOpen }: { term: string; open: string | null; onOpen: (p: string) => void }) {
  const { data = [], isFetching } = useMemorySearch(term)
  if (!data.length) return <p className="px-2 text-sm text-ink-muted">{isFetching ? 'searching…' : 'Nothing found.'}</p>
  return (
    <ul className="flex flex-col gap-1">
      {data.map((r) => (
        <li key={r.path}>
          <button
            type="button"
            onClick={() => onOpen(r.path)}
            aria-current={open === r.path ? 'page' : undefined}
            className={cn('flex w-full cursor-pointer flex-col rounded-lg px-2 py-1.5 text-left', focusRing, open === r.path ? 'shadow-sunken-sm' : 'hover:bg-ink/5')}
          >
            <span className="truncate text-sm font-semibold">{r.title}</span>
            <span className="truncate font-mono text-[0.7rem] text-ink-muted">{r.path}</span>
            {r.snippets[0] && <span className="line-clamp-2 text-xs text-ink-muted">{r.snippets[0]}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** PDFs and images inline; anything else as a download. */
function BinaryFile({ note }: { note: MemoryNote }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pdf = note.path.toLowerCase().endsWith('.pdf')
  const image = IMAGE.test(note.path)
  useEffect(() => {
    let current: string | null = null
    fetchMemoryFile(note.path)
      .then((u) => setUrl((current = u)))
      .catch((e: Error) => setError(e.message))
    return () => {
      if (current) URL.revokeObjectURL(current)
    }
  }, [note.path])
  if (error) return <p role="alert" className="font-semibold text-danger">{error}</p>
  if (!url) return <p className="text-ink-muted">loading…</p>
  if (image) return <img src={url} alt={note.path.split('/').pop()} className="max-h-[70dvh] max-w-full rounded-control" />
  if (pdf) return <iframe src={url} title={note.path} className="h-[70dvh] w-full rounded-control" />
  return (
    <a href={url} download={note.path.split('/').pop()} className={cn('font-semibold text-primary-text underline', focusRing)}>
      Download ({Math.round(note.size / 1024)} KB)
    </a>
  )
}

function Backlinks({ path }: { path: string }) {
  const { data = [] } = useBacklinks(path)
  return (
    <section aria-label="Backlinks" className="flex flex-col gap-2 border-t border-shade/40 pt-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
        <Link2 className="size-4" aria-hidden /> Linked from {data.length ? `(${data.length})` : ''}
      </h2>
      {data.length === 0 ? (
        <p className="text-sm text-ink-muted">No note links here yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((b) => (
            <li key={b.path}>
              <Link to={`/memory?note=${encodeURIComponent(b.path)}`} className={cn('block rounded-lg px-2 py-1 hover:bg-ink/5', focusRing)}>
                <span className="text-sm font-semibold">{b.title}</span>
                <span className="block truncate text-xs text-ink-muted">{b.context}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Editor({ note, onDone, onReload }: { note: MemoryNote; onDone: () => void; onReload: () => void }) {
  const [text, setText] = useState(note.raw ?? '')
  const [conflict, setConflict] = useState(false)
  const save = useSaveNote()
  const toast = useToast()
  const dirty = text !== (note.raw ?? '')

  function submit(force = false) {
    save.mutate(
      { path: note.path, content: text, base: force ? null : note.version },
      {
        onSuccess: () => {
          toast('success', 'Saved')
          onDone()
        },
        onError: (e) => (e instanceof BridgeError && e.status === 409 ? setConflict(true) : toast('error', `Not saved: ${e.message}`)),
      },
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    submit()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {note.path.startsWith('wiki/') && (
        <p className="text-sm text-ink-muted">Gandalf maintains wiki/; your corrections are kept.</p>
      )}
      <label htmlFor="note-editor" className="sr-only">
        Note content
      </label>
      <textarea
        id="note-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault()
            if (dirty) submit()
          }
        }}
        spellCheck
        className={cn(sunken, 'min-h-[55dvh] w-full resize-y rounded-control px-4 py-3 font-mono text-sm leading-relaxed', focusRing)}
      />
      {conflict && (
        <div role="alert" className="flex flex-col gap-2 rounded-control p-3 shadow-sunken-sm">
          <p className="text-sm font-semibold">This note changed since you opened it (Gandalf or another device saved it).</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => (onReload(), onDone())}>
              Discard mine and reload
            </Button>
            <Button size="sm" variant="accent" onClick={() => submit(true)}>
              Overwrite with mine
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
          <Save className="size-4" aria-hidden /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (!dirty || window.confirm('Discard your changes?')) && onDone()}>
          Cancel
        </Button>
        <span className="text-xs text-ink-muted">Ctrl+S saves · Markdown with [[path/note]] links</span>
      </div>
    </form>
  )
}

function Reader({ note }: { note: MemoryNote }) {
  if (note.binary) return <BinaryFile note={note} />
  const meta = Object.entries(note.metadata)
  return (
    <article className="flex flex-col gap-4">
      {meta.length > 0 && (
        <dl className="flex flex-wrap gap-2" aria-label="Properties">
          {meta.map(([k, v]) => (
            <Pill key={k}>
              <dt className="font-semibold">{k}:</dt>
              <dd className="max-w-64 truncate">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</dd>
            </Pill>
          ))}
        </dl>
      )}
      <Markdown text={note.text ?? ''} />
      <Backlinks path={note.path} />
    </article>
  )
}

type Dialog = { kind: 'new' } | { kind: 'move'; path: string } | { kind: 'delete'; path: string } | null

function PathDialog({ dialog, onClose, onOpen, folder }: { dialog: Dialog; onClose: () => void; onOpen: (p: string | null) => void; folder: string }) {
  const create = useCreateNote()
  const move = useMoveNote()
  const remove = useDeleteNote()
  const toast = useToast()
  // The parent remounts this per dialog (key), so the starting path is just the initial state.
  const [path, setPath] = useState(dialog?.kind === 'move' ? dialog.path : `${folder}/`)
  if (!dialog) return null

  const fail = (e: Error) => toast('error', e.message)
  function submit(e: FormEvent) {
    e.preventDefault()
    const p = path.trim().replace(/^\/+/, '')
    if (dialog?.kind === 'new') {
      const title = (p.split('/').pop() ?? p).replace(/\.md$/, '').replace(/-/g, ' ')
      create.mutate({ path: p, content: `# ${title.charAt(0).toUpperCase()}${title.slice(1)}\n\n` }, { onSuccess: (r) => (onClose(), onOpen(r.path)), onError: fail })
    } else if (dialog?.kind === 'move') {
      move.mutate(
        { src: dialog.path, dst: p },
        {
          onSuccess: (r) => {
            toast('success', r.updated_links.length ? `Moved; links updated in ${r.updated_links.length} note(s)` : 'Moved')
            onClose()
            onOpen(r.path)
          },
          onError: fail,
        },
      )
    }
  }

  if (dialog.kind === 'delete')
    return (
      <Modal
        open
        onClose={onClose}
        title="Delete this file?"
        icon={<Trash2 />}
        color="ember"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={remove.isPending}
              onClick={() => remove.mutate(dialog.path, { onSuccess: () => (onClose(), onOpen(null), toast('success', 'Moved to .trash/')), onError: fail })}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          <code className="font-mono text-sm">{dialog.path}</code> goes to the memory's <code className="font-mono text-sm">.trash/</code> folder (and stays in the memory's git history).
        </p>
      </Modal>
    )

  const isNew = dialog.kind === 'new'
  return (
    <Modal open onClose={onClose} title={isNew ? 'New note' : 'Rename or move'} icon={isNew ? <FilePlus /> : <Pencil />}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label="Path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          hint={isNew ? 'Folder and name, e.g. raw/idea or wiki/personal/books (.md is added).' : 'Links to it in other notes are updated.'}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!path.trim() || create.isPending || move.isPending}>
            {isNew ? 'Create' : 'Move'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const HEALTH: Array<{ key: keyof MemoryHealth['counts']; label: string }> = [
  { key: 'broken_links', label: 'Broken links' },
  { key: 'orphans', label: 'Orphan notes' },
  { key: 'unindexed', label: 'Missing from an index' },
  { key: 'no_frontmatter', label: 'Without properties' },
  { key: 'raw_pending', label: 'raw/ not compiled' },
]

/** The wiki's health: the mechanical check (no AI) and a button for the lint-wiki skill. */
function Health({ onOpen }: { onOpen: (p: string) => void }) {
  const { data } = useMemoryHealth()
  const run = useRunSkill()
  const toast = useToast()
  const [open, setOpen] = useState<keyof MemoryHealth['counts'] | null>(null)
  if (!data) return null
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0)
  const items = (key: keyof MemoryHealth['counts']): string[] =>
    key === 'broken_links' ? data.broken_links.map((b) => b.source) : (data[key] as string[])

  return (
    <Card title="Wiki health" subtitle={`${data.notes} notes · ${total ? `${total} to fix` : 'all good'}`} icon={<Activity />} color={total ? 'gold' : 'primary'}>
      <ul className="flex flex-col gap-1">
        {HEALTH.map(({ key, label }) => (
          <li key={key}>
            <button
              type="button"
              aria-expanded={open === key}
              disabled={!data.counts[key]}
              onClick={() => setOpen(open === key ? null : key)}
              className={cn('flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-sm disabled:cursor-default', focusRing, data.counts[key] > 0 && 'hover:bg-ink/5')}
            >
              <span>{label}</span>
              <Badge color={data.counts[key] ? 'gold' : 'primary'}>{data.counts[key]}</Badge>
            </button>
            {open === key && (
              <ul className="mt-1 mb-2 ml-2 flex flex-col gap-0.5 border-l border-shade/40 pl-2">
                {[...new Set(items(key))].slice(0, 30).map((p) => (
                  <li key={p}>
                    <button type="button" onClick={() => onOpen(p)} className={cn('w-full cursor-pointer truncate rounded px-1 text-left font-mono text-xs text-ink-muted hover:text-ink', focusRing)}>
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="secondary"
        disabled={run.isPending}
        onClick={() =>
          run.mutate(
            { name: 'lint-wiki', instruction: '' },
            { onSuccess: () => toast('success', 'Health check started (follow it in Terminals)'), onError: (e) => toast('error', e.message) },
          )
        }
      >
        Check with Gandalf
      </Button>
      <p className="text-xs text-ink-muted">Gandalf fixes links and indexes and reports contradictions, stale facts and gaps (uses your Claude quota).</p>
    </Card>
  )
}

function NoteCard({ path, onDialog, onOpen }: { path: string; onDialog: (d: Dialog) => void; onOpen: (p: string) => void }) {
  const { data, isPending, error, refetch } = useNote(path)
  const [editing, setEditing] = useState(false) // the parent remounts this card per note (key)
  // A link by name opens the note wherever it is: keep the real path in the address.
  useEffect(() => {
    if (data && data.path !== path) onOpen(data.path)
  }, [data, path, onOpen])

  let body: ReactNode
  if (isPending) body = <p className="text-ink-muted">loading…</p>
  else if (error) body = <p role="alert" className="font-semibold text-danger">{error.message}</p>
  else body = editing ? <Editor note={data} onDone={() => setEditing(false)} onReload={() => void refetch()} /> : <Reader note={data} />

  const actions = data && (
    <div className="flex items-center gap-2">
      {data.editable && (
        <Button size="sm" variant="secondary" onClick={() => setEditing(!editing)}>
          {editing ? <Eye className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
          {editing ? 'Preview' : 'Edit'}
        </Button>
      )}
      {!data.path.startsWith('receipts/') && (
        <Dropdown
          label={<MoreHorizontal className="size-4" aria-label="More actions" />}
          variant="ghost"
          align="right"
          items={[
            { id: 'move', label: 'Rename or move', icon: <Pencil />, onSelect: () => onDialog({ kind: 'move', path: data.path }) },
            { id: 'delete', label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => onDialog({ kind: 'delete', path: data.path }) },
          ]}
        />
      )}
    </div>
  )

  return (
    <Card title={path.split('/').pop()?.replace(/\.md$/, '')} subtitle={path} icon={<FileText />} color="primary" actions={actions}>
      {body}
    </Card>
  )
}

export function Memory() {
  const { data: tree = [], isPending } = useTree()
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const note = params.get('note')
  const open = (path: string | null) => setParams(path ? { note: path } : {})
  const searching = term.trim().length >= 2
  const folder = note?.includes('/') ? note.slice(0, note.lastIndexOf('/')) : 'raw'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Memory</h1>
          <p className="mt-1 text-ink-muted">Your notes and the wiki Gandalf keeps from them. Read, edit and search everything here.</p>
        </div>
        <Button onClick={() => setDialog({ kind: 'new' })}>
          <FilePlus className="size-4" aria-hidden /> New note
        </Button>
      </header>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
          <Card title="Files" icon={<Library />} color="gold">
            <div className="relative">
              <SearchInput label="Search the memory" placeholder="Search names and text…" value={term} onChange={(e) => setTerm(e.target.value)} />
              {term && (
                <button type="button" aria-label="Clear the search" onClick={() => setTerm('')} className={cn('absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer rounded-pill p-1 text-ink-muted', focusRing)}>
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <nav aria-label="Memory files" className="max-h-72 overflow-y-auto lg:max-h-[45dvh]">
              {searching ? (
                <Results term={term.trim()} open={note} onOpen={open} />
              ) : isPending ? (
                <p className="text-sm text-ink-muted">loading…</p>
              ) : (
                <Branch nodes={tree} open={note} onOpen={open} level={0} />
              )}
            </nav>
          </Card>
          <Health onOpen={open} />
        </div>
        {note ? (
          <NoteCard key={note} path={note} onDialog={setDialog} onOpen={open} />
        ) : (
          <Card title="No note open" icon={<FileText />} color="primary">
            <EmptyState icon={<Search />} title="Pick or search a note" description="Open a file in the tree, search, or create a new note." className="py-8" />
          </Card>
        )}
      </div>
      <PathDialog key={dialog ? `${dialog.kind}:${'path' in dialog ? dialog.path : ''}` : 'none'} dialog={dialog} onClose={() => setDialog(null)} onOpen={open} folder={folder} />
    </div>
  )
}
