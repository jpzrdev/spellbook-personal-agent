import { ChevronRight, FileText, Folder, FolderOpen, Library } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Markdown } from '../components/Markdown'
import { Card, EmptyState, Pill, SearchInput } from '../components/ui'
import { focusRing } from '../components/ui/styles'
import type { TreeNode } from '../lib/api'
import { cn } from '../lib/cn'
import { useNote, useTree } from '../lib/queries'

function filter(nodes: TreeNode[], term: string): TreeNode[] {
  if (!term) return nodes
  const t = term.toLowerCase()
  return nodes.flatMap((n) => {
    if (n.type === 'file') return n.path.toLowerCase().includes(t) ? [n] : []
    const children = filter(n.children ?? [], term)
    return children.length ? [{ ...n, children }] : []
  })
}

function Branch({ nodes, open, onOpen, level, expand }: { nodes: TreeNode[]; open: string | null; onOpen: (p: string) => void; level: number; expand: boolean }) {
  return (
    <ul className={cn('flex flex-col', level > 0 && 'ml-3 border-l border-shade/40 pl-2')}>
      {nodes.map((n) => (n.type === 'folder' ? <FolderItem key={n.path} node={n} open={open} onOpen={onOpen} level={level} expand={expand} /> : (
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

function FolderItem({ node, open, onOpen, level, expand }: { node: TreeNode; open: string | null; onOpen: (p: string) => void; level: number; expand: boolean }) {
  const containsOpen = open?.startsWith(node.path + '/') ?? false
  const [expanded, setExpanded] = useState(containsOpen || level === 0 && ['life', 'wiki'].includes(node.name))
  const show = expand || expanded || containsOpen
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
      {show && node.children && <Branch nodes={node.children} open={open} onOpen={onOpen} level={level + 1} expand={expand} />}
    </li>
  )
}

function Reader({ path }: { path: string }) {
  const { data, isPending, error } = useNote(path)
  if (isPending) return <p className="text-ink-muted">loading…</p>
  if (error) return <p role="alert" className="font-semibold text-danger">{error.message}</p>
  if (data.binary) return <p className="text-ink-muted">Binary file ({Math.round(data.size / 1024)} KB): open it in Obsidian.</p>
  const meta = Object.entries(data.metadata)
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
      <Markdown text={data.text ?? ''} />
    </article>
  )
}

export function Vault() {
  const { data: tree = [], isPending } = useTree()
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState('')
  const note = params.get('note')
  const open = (path: string) => setParams({ note: path })
  const visible = filter(tree, term.trim())

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Vault</h1>
        <p className="mt-1 text-ink-muted">Your notes, read-only. To edit, use Obsidian.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:self-start" title="Folders" icon={<Library />} color="gold">
          <SearchInput label="Filter files" placeholder="Filter…" value={term} onChange={(e) => setTerm(e.target.value)} />
          <nav aria-label="Vault files" className="max-h-72 overflow-y-auto lg:max-h-none">
            {isPending ? <p className="text-sm text-ink-muted">loading…</p> : <Branch nodes={visible} open={note} onOpen={open} level={0} expand={term.trim() !== ''} />}
          </nav>
        </Card>
        <Card title={note ? note.split('/').pop()?.replace(/\.md$/, '') : 'No note open'} subtitle={note ?? undefined} icon={<FileText />} color="primary">
          {note ? <Reader path={note} /> : <EmptyState icon={<FileText />} title="Pick a note" description="Open a file in the tree next to this." className="py-8" />}
        </Card>
      </div>
    </div>
  )
}
