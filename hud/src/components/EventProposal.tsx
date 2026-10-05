import { CalendarPlus, Check, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { ProposalSummary, ProposedEvent, Repeat } from '../lib/api'
import { useConfirmProposal, useDiscardProposal, useSessions } from '../lib/queries'
import { longDate } from '../lib/dates'
import { SESSION_STATUS } from '../lib/sessions'
import { Badge, Button, Input, Select, Toggle, useToast } from './ui'

const REPEAT: Array<{ value: string; text: string }> = [
  { value: '', text: "Doesn't repeat" },
  { value: 'yearly', text: 'Every year' },
  { value: 'monthly', text: 'Every month' },
  { value: 'weekly', text: 'Every week' },
  { value: 'daily', text: 'Every day' },
]

const ALL_DAY_ALERTS = [
  { min: 900, text: 'day before 9:00' },
  { min: 9540, text: '1 week before 9:00' },
  { min: 0, text: 'midnight of the day' },
]
const TIMED_ALERTS = [
  { min: 10, text: '10 min' },
  { min: 30, text: '30 min' },
  { min: 60, text: '1 h' },
  { min: 1440, text: '1 day' },
]

type Props = {
  proposal: ProposalSummary
  /** Stores the new state in the conversation (so "Add" isn't offered again after a reload). */
  onChange?: (p: ProposalSummary) => void
}

/** The "Add to calendar?" card: Gandalf proposes, the user checks/edits, and only then is the event created. */
export function EventProposal({ proposal, onChange }: Props) {
  const [e, setE] = useState<ProposedEvent>(proposal.event)
  const [state, setState] = useState<'pending' | 'confirmed' | 'discarded'>(proposal.status)
  const [sessionId, setSessionId] = useState<string | null>(proposal.session_id ?? null)
  const confirm = useConfirmProposal()
  const discard = useDiscardProposal()
  const { data: sessions } = useSessions()
  const toast = useToast()
  const session = sessionId ? sessions?.find((s) => s.id === sessionId) : undefined
  const change = (m: Partial<ProposedEvent>) => setE((current) => ({ ...current, ...m }))
  const alerts = e.all_day ? ALL_DAY_ALERTS : TIMED_ALERTS

  function create(ev: FormEvent) {
    ev.preventDefault()
    confirm.mutate(
      { id: proposal.id, event: e },
      {
        onSuccess: (r) => {
          setState('confirmed')
          setSessionId(r.session.id)
          onChange?.({ ...proposal, event: e, status: 'confirmed', session_id: r.session.id })
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  if (state === 'discarded') return <p className="text-sm text-ink-muted">Proposal discarded: nothing was added to the calendar.</p>

  if (state === 'confirmed')
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-control p-3 shadow-sunken-sm">
        <CalendarPlus className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-semibold">{e.title}</span>
        <span className="text-sm text-ink-muted">{longDate(e.date)}</span>
        {session ? (
          <Badge color={SESSION_STATUS[session.status].color}>
            {session.status === 'ok' ? 'on the calendar' : SESSION_STATUS[session.status].text}
          </Badge>
        ) : (
          <Badge color="silver">{sessionId ? 'adding…' : 'confirmed'}</Badge>
        )}
        {session?.result && <p className="w-full text-sm text-ink-muted">{session.result}</p>}
        {sessionId && (
          <Link to={`/terminals?session=${sessionId}`} className="text-xs font-semibold text-primary-text">
            view session
          </Link>
        )}
      </div>
    )

  return (
    <form onSubmit={create} className="flex flex-col gap-3 rounded-control p-4 shadow-sunken-sm">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus className="size-4 text-primary" aria-hidden /> Add to Google Calendar?
      </p>
      <Input label="Title" value={e.title} onChange={(ev) => change({ title: ev.target.value })} maxLength={200} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Date" type="date" value={e.date} onChange={(ev) => change({ date: ev.target.value })} required
          hint={longDate(e.date)} />
        <Select label="Repeat" value={e.repeat ?? ''} options={REPEAT}
          onChange={(ev) => change({ repeat: (ev.target.value || null) as Repeat | null })} />
      </div>
      <Toggle
        on={e.all_day}
        showLabel
        label="All day"
        onChange={(allDay) =>
          change(allDay ? { all_day: true, start_time: null, end_time: null, reminders_min: [900] } : { all_day: false, start_time: '09:00', end_time: '10:00', reminders_min: [30] })
        }
      />
      {!e.all_day && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start" type="time" value={e.start_time ?? ''} onChange={(ev) => change({ start_time: ev.target.value })} required />
          <Input label="End" type="time" value={e.end_time ?? ''} onChange={(ev) => change({ end_time: ev.target.value })} />
        </div>
      )}
      <Input label="Location (optional)" value={e.location ?? ''} onChange={(ev) => change({ location: ev.target.value || null })} maxLength={200} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Google alerts</legend>
        <div className="flex flex-wrap gap-2">
          {alerts.map((a) => {
            const on = e.reminders_min.includes(a.min)
            return (
              <button
                key={a.min}
                type="button"
                aria-pressed={on}
                onClick={() => change({ reminders_min: on ? e.reminders_min.filter((m) => m !== a.min) : [...e.reminders_min, a.min] })}
                className={
                  'cursor-pointer rounded-pill px-3 py-1 text-xs font-semibold ' +
                  (on ? 'text-primary-text shadow-sunken-sm' : 'text-ink-muted shadow-raised-sm')
                }
              >
                {a.text}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={confirm.isPending || !e.title.trim() || !e.date}>
          <Check className="size-3.5" aria-hidden /> Add to calendar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={discard.isPending}
          onClick={() => discard.mutate(proposal.id, { onSettled: () => {
              setState('discarded')
              onChange?.({ ...proposal, status: 'discarded' })
            } })}
        >
          <X className="size-3.5" aria-hidden /> Discard
        </Button>
      </div>
    </form>
  )
}
