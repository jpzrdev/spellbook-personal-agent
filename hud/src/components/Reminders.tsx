import { AlarmClock, BellOff, BellRing, Check, Repeat, Send, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { post, type Reminder } from '../lib/api'
import { usePush } from '../lib/push'
import { useEditReminder, useReminders, useRemoveReminder, useAgent } from '../lib/queries'
import { relativeTime } from '../lib/time'
import { Badge, Button, Card, useToast } from './ui'

/** The button that turns on notifications on this device (with the reason when it can't). */
export function Notifications() {
  const { state, error, enable, disable } = usePush()
  const toast = useToast()

  async function test() {
    try {
      await post('/push/test', {})
      toast('success', 'Test notification sent')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e))
    }
  }

  const notice: Partial<Record<typeof state, string>> = {
    dev: 'Notifications only work in daily-use mode (scripts/serve.ps1).',
    unsupported: "This browser doesn't receive notifications.",
    install: 'On iPhone: Share → Add to Home Screen, then open it from the icon to turn them on.',
    blocked: 'Notifications are blocked: allow them in the browser/device settings.',
  }
  if (state === 'loading') return null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {state === 'on' ? (
          <>
            <Badge color="primary">
              <BellRing className="size-3" aria-hidden /> notifications on
            </Badge>
            <Button variant="ghost" size="sm" onClick={test}>
              <Send className="size-3.5" aria-hidden /> Test
            </Button>
            <Button variant="ghost" size="sm" onClick={disable}>
              <BellOff className="size-3.5" aria-hidden /> Turn off
            </Button>
          </>
        ) : state === 'off' ? (
          <Button size="sm" onClick={enable}>
            <BellRing className="size-3.5" aria-hidden /> Turn on notifications on this device
          </Button>
        ) : (
          <p className="text-xs text-ink-muted">{notice[state]}</p>
        )}
      </div>
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
    </div>
  )
}

function FiredRow({ x }: { x: Reminder }) {
  const edit = useEditReminder()
  const toast = useToast()
  const snooze = (min: number) => edit.mutate({ id: x.id, snooze_min: min }, { onError: (e) => toast('error', e.message) })
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 shadow-sunken-sm">
      <span className="w-28 shrink-0 text-xs font-semibold text-ink-muted">fired {x.done_at ? relativeTime(x.done_at) : ''}</span>
      <span className="min-w-0 flex-1 text-sm text-ink-muted line-through">{x.text}</span>
      <span className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 px-2" disabled={edit.isPending} onClick={() => snooze(10)}>
          +10 min
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-2" disabled={edit.isPending} onClick={() => snooze(60)}>
          +1 h
        </Button>
      </span>
    </li>
  )
}

function ReminderRow({ x }: { x: Reminder }) {
  const edit = useEditReminder()
  const remove = useRemoveReminder()
  const toast = useToast()
  const failed = (e: Error) => toast('error', e.message)
  const when = x.recurrence ? x.recurrence_text : x.next ? relativeTime(x.next) : ''

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 shadow-raised-sm">
      <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-muted tabular-nums">
        {x.recurrence && <Repeat className="size-3.5" aria-label="repeats" />}
        {when}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{x.text}</span>
      <span className="flex items-center gap-1">
        {!x.recurrence && (
          <Button variant="ghost" size="sm" className="h-8 px-2" disabled={edit.isPending}
            onClick={() => edit.mutate({ id: x.id, snooze_min: 60 }, { onError: failed })}>
            +1 h
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 px-2" aria-label={x.recurrence ? 'Pause' : 'Complete'}
          title={x.recurrence ? 'Pause' : 'Complete'} disabled={edit.isPending}
          onClick={() => edit.mutate({ id: x.id, done: true }, { onError: failed })}>
          <Check className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-2" aria-label="Delete" title="Delete" disabled={remove.isPending}
          onClick={() => remove.mutate(x.id, { onError: failed })}>
          <Trash2 className="size-4" />
        </Button>
      </span>
    </li>
  )
}

/** Actions coming from a notification (`/?reminder=<id>&action=snooze10|snooze60|done`). */
function useNotificationAction() {
  const [params, setParams] = useSearchParams()
  const edit = useEditReminder()
  const toast = useToast()
  const id = params.get('reminder')
  const action = params.get('action')

  useEffect(() => {
    if (!id || !action) return
    const change = action === 'snooze10' ? { snooze_min: 10 } : action === 'snooze60' ? { snooze_min: 60 } : null
    setParams({}, { replace: true })
    if (!change) return
    edit.mutate(
      { id, ...change },
      { onSuccess: (x) => toast('success', `Snoozed: ${x.text}`), onError: (e) => toast('error', e.message) },
    )
  }, [id, action]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The Today screen's reminders card: upcoming alerts, snooze/complete and the notifications button. */
export function Reminders() {
  const agentName = useAgent().name
  const { data: items = [] } = useReminders()
  useNotificationAction()
  const pending = items.filter((x) => !x.done)
  const fired = items.filter((x) => x.recently_fired)
  return (
    <Card
      className="h-full"
      title="Reminders"
      subtitle={`ask ${agentName}: “remind me to … in 30 min”`}
      icon={<AlarmClock />}
      color="violet"
      actions={pending.length > 0 ? <Badge color="violet">{pending.length}</Badge> : undefined}
    >
      <Notifications />
      {pending.length === 0 && fired.length === 0 ? (
        <p className="text-sm text-ink-muted">No pending reminders.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto p-1">
          {fired.map((x) => (
            <FiredRow key={x.id} x={x} />
          ))}
          {pending.map((x) => (
            <ReminderRow key={x.id} x={x} />
          ))}
        </ul>
      )}
    </Card>
  )
}
