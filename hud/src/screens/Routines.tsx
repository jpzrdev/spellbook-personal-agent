import { BellRing, Clock, Cog, History, MoreHorizontal, Pencil, Play, Plus, Repeat, Trash2, Wand2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  Badge,
  Button,
  Card,
  Dropdown,
  EmptyState,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toggle,
  useToast,
  type Color,
} from '../components/ui'
import { focusRing } from '../components/ui/styles'
import type { Routine, Run } from '../lib/api'
import { cn } from '../lib/cn'
import {
  useCreateRoutine,
  useEditRoutine,
  useInternalActions,
  useRemoveRoutine,
  useRoutines,
  useRunRoutine,
  useSkills,
} from '../lib/queries'
import { buildCron, readCron, relativeTime, type Days } from '../lib/time'

const STATUS: Record<string, { color: Color; text: string }> = {
  ok: { color: 'primary', text: 'ok' },
  error: { color: 'ember', text: 'error' },
  running: { color: 'gold', text: 'running' },
  queued: { color: 'silver', text: 'queued' },
  cancelled: { color: 'wood', text: 'cancelled' },
  timed_out: { color: 'ember', text: 'timed out' },
}

function RunHistory({ items }: { items: Run[] }) {
  if (items.length === 0) return <p className="text-xs text-ink-muted">Hasn't run yet.</p>
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Latest runs">
      {items.slice(0, 5).map((e, i) => {
        const st = STATUS[e.status] ?? { color: 'silver' as Color, text: e.status }
        return (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-muted tabular-nums">{relativeTime(e.at)}</span>
            <Badge color={st.color}>{st.text}</Badge>
          </li>
        )
      })}
    </ul>
  )
}

function RoutineCard({ r, onDelete, onEdit }: { r: Routine; onDelete: () => void; onEdit: () => void }) {
  const edit = useEditRoutine()
  const run = useRunRoutine()
  const toast = useToast()
  const navigate = useNavigate()
  const [showHistory, setShowHistory] = useState(false)
  const last = r.history[0]

  function runNow() {
    run.mutate(r.slug, {
      onSuccess: (res) => {
        if (res.session_id) {
          toast('success', `${r.name}: session started`)
          navigate(`/terminals?session=${res.session_id}`)
        } else toast(res.status === 'ok' ? 'success' : 'error', `${r.name}: ${res.response?.split('\n')[0] ?? res.status}`)
      },
      onError: (err) => toast('error', err.message),
    })
  }

  return (
    <Card
      className={cn('h-full', !r.active && 'opacity-80')}
      title={r.name}
      subtitle={r.schedule}
      icon={r.tier === 3 ? <Wand2 /> : <Cog />}
      color={r.tier === 3 ? 'wood' : 'primary'}
      actions={
        <Toggle
          on={r.active}
          label={`Routine ${r.name} ${r.active ? 'active' : 'paused'}`}
          onChange={(active) =>
            edit.mutate({ slug: r.slug, active }, { onError: (err) => toast('error', `Not saved: ${err.message}`) })
          }
        />
      }
    >
      {r.description && <p className="line-clamp-3 text-sm text-ink-muted">{r.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={r.tier === 3 ? 'wood' : 'primary-light'}>
          {r.tier === 3 ? (r.skill ? `Claude Code · /${r.skill}` : 'Claude Code') : `internal · ${r.action}`}
        </Badge>
        {r.output === 'ephemeral' && <Badge color="silver">ephemeral</Badge>}
        {r.notify && (
          <Badge color="violet">
            <BellRing className="size-3" aria-hidden /> notifies
          </Badge>
        )}
        {r.next && (
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            <Clock className="size-3.5" aria-hidden /> next: {relativeTime(r.next)}
          </span>
        )}
        {last && (
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            last: <Badge color={(STATUS[last.status] ?? STATUS.ok).color}>{(STATUS[last.status] ?? { text: last.status }).text}</Badge>
          </span>
        )}
      </div>
      {showHistory && <RunHistory items={r.history} />}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((v) => !v)}
          className={cn('flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold text-ink-muted shadow-raised-sm hover:text-ink active:shadow-sunken-sm', focusRing)}
        >
          <History className="size-3.5" aria-hidden /> History
        </button>
        <div className="flex items-center gap-2">
          <Dropdown
            label={
              <>
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">More actions for {r.name}</span>
              </>
            }
            variant="ghost"
            align="right"
            items={[
              { id: 'edit', label: 'Edit', icon: <Pencil className="size-4" />, onSelect: onEdit },
              { id: 'delete', label: 'Delete', icon: <Trash2 className="size-4" />, danger: true, onSelect: onDelete },
            ]}
          />
          <Button size="sm" onClick={runNow} disabled={run.isPending}>
            <Play className="size-3.5" aria-hidden /> Run now
          </Button>
        </div>
      </div>
    </Card>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Creates (without `routine`) or edits an existing routine. */
function RoutineForm({ open, onClose, routine }: { open: boolean; onClose: () => void; routine?: Routine }) {
  const create = useCreateRoutine()
  const edit = useEditRoutine()
  const simple = routine ? readCron(routine.cron) : null
  const { data: skills = [] } = useSkills()
  const { data: actions = [] } = useInternalActions()
  const toast = useToast()
  const [name, setName] = useState(routine?.name ?? '')
  const [kind, setKind] = useState<'3' | '1'>(routine?.tier === 1 ? '1' : '3')
  const [skill, setSkill] = useState(routine?.skill ?? '')
  const [action, setAction] = useState(routine?.action ?? '')
  const [time, setTime] = useState(simple?.time ?? '07:00')
  const [days, setDays] = useState<Days>(simple?.days ?? 'every')
  const [custom, setCustom] = useState<number[]>(simple?.custom ?? [1, 3, 5])
  const [advanced, setAdvanced] = useState(!!routine && !simple)
  const [manualCron, setManualCron] = useState(routine?.cron ?? '')
  const [description, setDescription] = useState(routine?.description ?? '')
  const [output, setOutput] = useState<'memory' | 'ephemeral'>(routine?.output ?? 'memory')
  const [notify, setNotify] = useState(routine?.notify ?? false)
  const [error, setError] = useState<string | null>(null)

  const cron = advanced ? manualCron : buildCron(time, days, custom)
  const chosenAction = action || actions[0]?.name || ''

  function reset() {
    setName('')
    setDescription('')
    setError(null)
    setAdvanced(false)
  }

  function save(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    const fields = {
      name: name.trim(),
      cron,
      skill: kind === '3' ? skill || null : null,
      action: kind === '1' ? chosenAction : null,
      description,
      output,
      notify,
    }
    if (routine) {
      edit.mutate(
        { slug: routine.slug, ...fields },
        {
          onSuccess: (r) => {
            toast('success', `Routine saved: ${r.name} (${r.schedule})`)
            onClose()
          },
          onError: (err) => setError(err.message),
        },
      )
      return
    }
    create.mutate(
      { ...fields, tier: kind === '3' ? 3 : 1, active: true },
      {
        onSuccess: (r) => {
          toast('success', `Routine created: ${r.name} (${r.schedule})`)
          reset()
          onClose()
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={routine ? `Edit: ${routine.name}` : 'New routine'}
      icon={<Repeat />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save()} disabled={!name.trim() || !cron.trim() || create.isPending || edit.isPending}>
            {routine ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
        <Input label="Name" placeholder="E.g.: Calculus review" value={name} onChange={(e) => setName(e.target.value)} />
        <div className={cn('flex flex-col gap-2', routine && 'hidden')}>
          <span className="text-sm font-semibold">Type</span>
          <Tabs
            label="Routine type"
            value={kind}
            onChange={(v) => setKind(v as '3' | '1')}
            items={[
              { id: '3', label: 'Claude Code (AI)' },
              { id: '1', label: 'Internal (no AI)' },
            ]}
          />
        </div>
        {kind === '3' ? (
          <Select
            label="Skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            options={[{ value: '', text: 'None: the description becomes the task' }, ...skills.map((s) => ({ value: s.name, text: `/${s.name}` }))]}
          />
        ) : (
          <Select
            label="Action"
            value={chosenAction}
            onChange={(e) => setAction(e.target.value)}
            options={actions.map((a) => ({ value: a.name, text: `${a.name}: ${a.description}` }))}
          />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">When</span>
          {!advanced ? (
            <>
              <Tabs
                label="Days"
                value={days}
                onChange={(v) => setDays(v as Days)}
                items={[
                  { id: 'every', label: 'Every day' },
                  { id: 'weekdays', label: 'Mon–Fri' },
                  { id: 'weekend', label: 'Weekends' },
                  { id: 'custom', label: 'Choose' },
                ]}
              />
              {days === 'custom' && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Weekdays">
                  {WEEKDAYS.map((d, i) => {
                    const checked = custom.includes(i)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => setCustom((c) => (checked ? c.filter((x) => x !== i) : [...c, i]))}
                        className={cn(
                          'w-12 cursor-pointer rounded-pill py-1 text-sm font-semibold',
                          focusRing,
                          checked ? 'text-primary-text shadow-sunken-sm' : 'text-ink-muted shadow-raised-sm',
                        )}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              )}
              <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="max-w-40" />
            </>
          ) : (
            <Input
              label="Cron expression"
              placeholder="minute hour day month day-of-week"
              value={manualCron}
              onChange={(e) => setManualCron(e.target.value)}
              hint="E.g.: 0 7-22/2 * * * (every 2h, from 7:00 to 22:00). 0 = Sunday."
            />
          )}
          <button
            type="button"
            onClick={() => {
              if (!advanced) setManualCron(cron)
              setAdvanced((a) => !a)
            }}
            className={cn('self-start rounded-pill px-2 py-1 text-xs font-semibold text-primary-text', focusRing)}
          >
            {advanced ? 'back to simple mode' : `advanced mode (cron: ${cron})`}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Output</span>
          <Tabs
            label="Where the result goes"
            value={output}
            onChange={(v) => setOutput(v as 'memory' | 'ephemeral')}
            items={[
              { id: 'memory', label: 'Save to the memory' },
              { id: 'ephemeral', label: 'Ephemeral (HUD only)' },
            ]}
          />
          <p className="text-xs text-ink-muted">
            {output === 'ephemeral'
              ? 'The result shows up in "Today\'s summaries" for 48 h and never goes to the memory or git. Claude Code runs read-only.'
              : 'The result and the files created stay in the memory (with a full receipt).'}
          </p>
        </div>
        <Toggle
          on={notify}
          onChange={setNotify}
          showLabel
          label="Notify on the phone when it finishes (failures always notify)"
        />
        <Textarea
          label="Description"
          placeholder={kind === '3' ? 'What Claude Code should do in this routine' : 'What this routine is for'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

export function Routines() {
  const { data: routines = [], isPending, error } = useRoutines()
  const remove = useRemoveRoutine()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)
  const [deleting, setDeleting] = useState<Routine | null>(null)
  const active = routines.filter((r) => r.active).length

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Routines</h1>
          <p className="mt-1 text-ink-muted">
            {active} of {routines.length} active · files in <code className="font-mono text-sm">life/routines/</code> (you can edit them in the Memory tab too)
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> New routine
        </Button>
      </header>

      {isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-danger">{error.message}</p>
      ) : routines.length === 0 ? (
        <EmptyState icon={<Repeat />} title="No routines" description="Create one so Gandalf works on his own at the right time." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {routines.map((r) => (
            <RoutineCard key={r.slug} r={r} onDelete={() => setDeleting(r)} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      <RoutineForm open={creating} onClose={() => setCreating(false)} />
      {editing && <RoutineForm key={editing.slug} open routine={editing} onClose={() => setEditing(null)} />}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete routine?"
        icon={<Trash2 />}
        color="ember"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="text-danger"
              disabled={remove.isPending}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.slug, {
                  onSuccess: () => {
                    toast('success', `Routine deleted: ${deleting.name}`)
                    setDeleting(null)
                  },
                  onError: (err) => toast('error', err.message),
                })
              }
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          The file <code className="font-mono">life/routines/{deleting?.slug}.md</code> will be deleted. It can be recovered from the memory's git.
        </p>
      </Modal>
    </div>
  )
}
