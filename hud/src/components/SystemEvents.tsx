import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '../lib/api'
import { useWebSocket } from '../lib/ws'
import { useToast, type ToastKind } from './ui'

const END: Record<string, { kind: ToastKind; text: string }> = {
  ok: { kind: 'success', text: 'Session finished' },
  error: { kind: 'error', text: 'Session finished with an error' },
  timed_out: { kind: 'error', text: 'Session ended (timed out)' },
  cancelled: { kind: 'info', text: 'Session cancelled' },
}

/** Listens to /ws/events: refreshes lists and lets you know when a Claude Code session ends. */
export function SystemEvents() {
  const qc = useQueryClient()
  const toast = useToast()

  useWebSocket('/ws/events', (ev) => {
    if (ev.type === 'ephemeral') {
      qc.invalidateQueries({ queryKey: ['ephemeral'] })
      toast('info', `New summary: ${String(ev.title ?? '')}`)
    }
    if (ev.type === 'reminders') qc.invalidateQueries({ queryKey: ['reminders'] })
    if (ev.type === 'reminder') {
      qc.invalidateQueries({ queryKey: ['reminders'] })
      toast('info', `⏰ ${String(ev.text ?? '')}`)
    }
    if (ev.type === 'routine' || ev.type === 'receipt' || ev.type === 'routines_reloaded') {
      qc.invalidateQueries({ queryKey: ['routines'] })
      qc.invalidateQueries({ queryKey: ['today'] })
    }
    if (ev.type === 'session') {
      const s = ev.session as Session
      qc.setQueryData<Session[]>(['sessions'], (items) => {
        if (!items) return items
        return items.some((x) => x.id === s.id) ? items.map((x) => (x.id === s.id ? s : x)) : [s, ...items]
      })
      const end = END[s.status]
      if (end) {
        toast(end.kind, `${end.text}: ${s.task.slice(0, 60)}`)
        // A session may have touched tasks, the agenda, etc.
        qc.invalidateQueries({ queryKey: ['today'] })
        qc.invalidateQueries({ queryKey: ['tasks'] })
        if (s.output === 'library') qc.invalidateQueries({ queryKey: ['library'] })
      }
    }
  })
  return null
}
