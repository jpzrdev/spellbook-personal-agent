import type { Color } from '../components/ui'
import type { SessionStatus } from './api'

export const SESSION_STATUS: Record<SessionStatus, { color: Color; text: string }> = {
  queued: { color: 'silver', text: 'queued' },
  running: { color: 'gold', text: 'running' },
  ok: { color: 'primary', text: 'done' },
  error: { color: 'ember', text: 'error' },
  cancelled: { color: 'wood', text: 'cancelled' },
  timed_out: { color: 'ember', text: 'timed out' },
}
