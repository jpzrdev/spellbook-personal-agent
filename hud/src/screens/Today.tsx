import {
  CalendarDays,
  CircleAlert,
  Inbox,
  ListChecks,
  Plus,
  Repeat,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Reminders } from '../components/Reminders'
import { Summaries } from '../components/Summaries'
import {
  Badge,
  BentoGrid,
  BentoItem,
  Button,
  Card,
  Checkbox,
  EmptyState,
  IconChip,
  useToast,
  type Color,
} from '../components/ui'
import { focusRing, solid, sunken } from '../components/ui/styles'
import type { AgendaEvent, RoutineToday, Task, Today as TodayData } from '../lib/api'
import { cn } from '../lib/cn'
import { dueStatus, shortDate } from '../lib/dates'
import { useCapture, useClip, useCompleteTask, useCreateTask, useTasks, useToday } from '../lib/queries'

function DueBadge({ due, today }: { due: string | null; today: string }) {
  const d = dueStatus(due, today)
  if (!d || !due) return null
  if (d === 'overdue') return <Badge color="ember">overdue · {shortDate(due)}</Badge>
  if (d === 'today') return <Badge color="gold">today</Badge>
  return <Badge color="silver">{shortDate(due)}</Badge>
}

function TaskRow({ t, today }: { t: Task; today: string }) {
  const complete = useCompleteTask()
  const toast = useToast()
  return (
    <li className="flex items-center justify-between gap-3">
      <Checkbox
        label={t.text}
        strikethrough
        checked={t.done}
        onChange={(e) =>
          complete.mutate(
            { id: t.id, done: e.target.checked },
            { onError: (err) => toast('error', `Not saved: ${err.message}`) },
          )
        }
      />
      {!t.done && <DueBadge due={t.due} today={today} />}
    </li>
  )
}

const eventColor: Color[] = ['violet', 'silver', 'primary-light', 'gold']

function Agenda({ events, dateLong }: { events: AgendaEvent[]; dateLong: string }) {
  return (
    <Card className="h-full" title="Today's agenda" subtitle={dateLong} icon={<CalendarDays />} color="gold">
      {events.length === 0 ? (
        <EmptyState icon={<Sun />} color="gold" title="A free day" description="Nothing on today's agenda." className="py-8" />
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e, i) => (
            <li key={i} className="flex items-center gap-4 rounded-control p-3 shadow-raised-sm">
              <span className="w-12 text-sm font-semibold tabular-nums">{e.start ?? 'day'}</span>
              <span aria-hidden className={cn('h-9 w-1 shrink-0 rounded-pill', solid[eventColor[i % eventColor.length]])} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.title}</p>
                <p className="text-xs text-ink-muted">
                  {e.start ? (e.end ? `until ${e.end}` : 'scheduled time') : 'all day'}
                  {e.location && ` · ${e.location}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function Priorities({ data }: { data: TodayData }) {
  return (
    <Card className="h-full" title="3 priorities" icon={<Sparkles />} color="primary">
      {data.priorities.length === 0 ? (
        <p className="text-ink-muted">No open tasks. 🌱</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.priorities.map((t) => (
            <TaskRow key={t.id} t={t} today={data.date} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Counter({ title, subtitle, value, icon, color, footer }: {
  title: string
  subtitle: string
  value: number
  icon: ReactNode
  color: Color
  footer?: ReactNode
}) {
  return (
    <Card className="h-full justify-between" title={title} subtitle={subtitle} icon={icon} color={color}>
      <p className="font-display text-5xl font-normal tabular-nums">{value}</p>
      {footer}
    </Card>
  )
}

function TaskList({ today }: { today: string }) {
  const { data: tasks = [], isPending } = useTasks()
  const create = useCreateTask()
  const toast = useToast()
  const [text, setText] = useState('')
  const visible = tasks.filter((t) => !t.done || t.done_on === today)

  function add(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    create.mutate(
      { text: t },
      {
        onSuccess: () => setText(''),
        onError: (err) => toast('error', `Not saved: ${err.message}`),
      },
    )
  }

  return (
    <Card className="h-full" title="Tasks" subtitle="life/tasks.md" icon={<ListChecks />} color="primary">
      <form onSubmit={add} className={cn(sunken, 'flex items-center gap-2 rounded-pill py-1 pr-1 pl-4')}>
        <input
          aria-label="New task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="New task…"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-muted/70 focus-visible:outline-none"
        />
        <Button type="submit" variant="icon" size="sm" aria-label="Add task" disabled={!text.trim() || create.isPending}>
          <Plus className="size-4" />
        </Button>
      </form>
      {isPending ? (
        <p className="text-sm text-ink-muted">loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-ink-muted">All done here. 🌱</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto p-1">
          {visible.map((t) => (
            <TaskRow key={t.id} t={t} today={today} />
          ))}
        </ul>
      )}
    </Card>
  )
}

const routineStatus: Record<RoutineToday['status'], { color: Color; text: string }> = {
  pending: { color: 'silver', text: 'pending' },
  missed: { color: 'wood', text: "didn't run" },
  queued: { color: 'silver', text: 'queued' },
  running: { color: 'gold', text: 'running' },
  ok: { color: 'primary', text: 'ok' },
  error: { color: 'ember', text: 'error' },
  cancelled: { color: 'wood', text: 'cancelled' },
  timed_out: { color: 'ember', text: 'timed out' },
}

function Routines({ routines }: { routines: RoutineToday[] }) {
  return (
    <Card className="h-full" title="Today's routines" icon={<Repeat />} color="wood">
      {routines.length === 0 ? (
        <p className="text-sm text-ink-muted">No active routine runs today.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((r) => (
            <li key={`${r.slug}-${r.time}`} className="flex items-center gap-3 rounded-control px-3 py-2 shadow-raised-sm">
              <span className="w-12 text-sm font-semibold tabular-nums">{r.time}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
              <Badge color={routineStatus[r.status].color}>{routineStatus[r.status].text}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// A link on its own (optionally followed by a comment) is clipped: the page's text goes to raw/.
const LINK = /^(https?:\/\/\S+)(?:\s+(.*))?$/s

function QuickCapture() {
  const capture = useCapture()
  const clip = useClip()
  const toast = useToast()
  const [text, setText] = useState('')
  const link = LINK.exec(text.trim())
  const pending = capture.isPending || clip.isPending

  function save(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    const done = {
      onSuccess: (r: { file: string }) => {
        setText('')
        toast('success', `Saved to ${r.file}`)
      },
      onError: (err: Error) => toast('error', `Not saved: ${err.message}`),
    }
    if (link) clip.mutate({ url: link[1], note: link[2] ?? '' }, done)
    else capture.mutate(t, done)
  }

  return (
    <form
      onSubmit={save}
      className={cn(
        sunken,
        'flex h-full items-center gap-3 rounded-card p-3',
        'focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-primary',
      )}
    >
      <IconChip color="primary">
        <Inbox />
      </IconChip>
      <input
        aria-label="Quick capture to raw/"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jot down anything or paste a link… it goes to raw/"
        className="h-11 min-w-0 flex-1 bg-transparent px-2 placeholder:text-ink-muted/70 focus-visible:outline-none"
      />
      <Button type="submit" size="sm" disabled={!text.trim() || pending}>
        {link ? (clip.isPending ? 'Clipping…' : 'Clip page') : 'Save'}
      </Button>
    </form>
  )
}

export function Today() {
  const { data, error, isPending, refetch } = useToday()

  if (isPending) return <p className="text-ink-muted">loading the day…</p>
  if (error)
    return (
      <EmptyState
        icon={<CircleAlert />}
        color="ember"
        title="I couldn't reach the Bridge"
        description={error.message}
        action={
          <button type="button" onClick={() => refetch()} className={cn('rounded-pill px-4 py-2 font-semibold shadow-raised-sm', focusRing)}>
            Try again
          </button>
        }
      />
    )

  const t = data.tasks
  return (
    <div className="flex flex-col gap-8 pb-24">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-ink-muted">{data.date_long}</p>
      </header>
      <Summaries />
      <BentoGrid>
        <BentoItem col={2} row={2}>
          <Agenda events={data.agenda} dateLong={data.date_long} />
        </BentoItem>
        <BentoItem col={2}>
          <Priorities data={data} />
        </BentoItem>
        <BentoItem>
          <Counter
            title="Open"
            subtitle="tasks"
            value={t.open}
            icon={<ListChecks />}
            color="primary"
            footer={t.done_today > 0 ? <Badge color="primary">{t.done_today} done today</Badge> : undefined}
          />
        </BentoItem>
        <BentoItem>
          <Counter
            title="For today"
            subtitle="due today"
            value={t.today}
            icon={<Sun />}
            color="gold"
            footer={t.overdue > 0 ? <Badge color="ember">{t.overdue} overdue</Badge> : undefined}
          />
        </BentoItem>
        <BentoItem col={2} row={2}>
          <TaskList today={data.date} />
        </BentoItem>
        <BentoItem col={2}>
          <Reminders />
        </BentoItem>
        <BentoItem col={2}>
          <Routines routines={data.routines} />
        </BentoItem>
        <BentoItem col={2}>
          <QuickCapture />
        </BentoItem>
      </BentoGrid>
    </div>
  )
}
