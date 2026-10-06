import { Archive, ListPlus, MailOpen, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Ephemeral } from '../lib/api'
import { cn } from '../lib/cn'
import { useDiscardEphemeral, useEphemeral, useSaveEphemeral } from '../lib/queries'
import { relativeTime } from '../lib/time'
import { GandalfText } from './GandalfText'
import { ResearchActions } from './ResearchResult'
import { Badge, Button, Card, useToast } from './ui'
import { sunken } from './ui/styles'

function SummaryItem({ e }: { e: Ephemeral }) {
  const save = useSaveEphemeral()
  const discard = useDiscardEphemeral()
  const toast = useToast()
  const [task, setTask] = useState<string | null>(null)

  function createTask(ev: FormEvent) {
    ev.preventDefault()
    if (!task?.trim()) return
    save.mutate(
      { id: e.id, target: 'task', text: task.trim() },
      {
        onSuccess: () => {
          setTask(null)
          toast('success', 'Task created in life/tasks.md')
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  return (
    <article className="flex flex-col gap-3 rounded-control p-4 shadow-raised-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{e.title}</h4>
        <span className="text-xs text-ink-muted">
          {relativeTime(e.created)} · expires {relativeTime(e.expires)}
        </span>
      </header>
      <GandalfText text={e.text} />
      {task !== null && (
        <form onSubmit={createTask} className={cn(sunken, 'flex items-center gap-2 rounded-pill py-1 pr-1 pl-4')}>
          <input
            autoFocus
            aria-label="New task text"
            value={task}
            onChange={(ev) => setTask(ev.target.value)}
            placeholder="What to do…"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-muted/70 focus-visible:outline-none"
          />
          <Button type="submit" size="sm" disabled={!task.trim() || save.isPending}>
            Create
          </Button>
        </form>
      )}
      {e.research ? (
        <ResearchActions e={e} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setTask((t) => (t === null ? '' : null))}>
            <ListPlus className="size-3.5" aria-hidden /> Make it a task
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { id: e.id, target: 'raw' },
                { onSuccess: (r) => toast('success', `Saved to ${r.file}`), onError: (err) => toast('error', err.message) },
              )
            }
          >
            <Archive className="size-3.5" aria-hidden /> Save to vault
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={discard.isPending}
            onClick={() => discard.mutate(e.id, { onError: (err) => toast('error', err.message) })}
          >
            <Trash2 className="size-3.5" aria-hidden /> Discard
          </Button>
        </div>
      )}
    </article>
  )
}

/** The "Today's summaries" card: ephemeral outputs (they don't stay in the vault). Hidden when there's nothing. */
export function Summaries() {
  const { data: items = [] } = useEphemeral()
  if (items.length === 0) return null
  return (
    <Card
      title="Today's summaries"
      subtitle="they only live here (summaries 48 h, research 7 days); save what matters"
      icon={<MailOpen />}
      color="silver"
      actions={<Badge color="silver">{items.length}</Badge>}
    >
      <div className="flex flex-col gap-4">
        {items.map((e) => (
          <SummaryItem key={e.id} e={e} />
        ))}
      </div>
    </Card>
  )
}
