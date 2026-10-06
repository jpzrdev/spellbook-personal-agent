import { useEffect, useRef, useState } from 'react'
import { TOKEN, type Session, type SessionEvent } from './api'

/** WebSocket URL through Vite's /api proxy (the token goes in the query: browsers send no header on WS). */
export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api${path}?token=${encodeURIComponent(TOKEN ?? '')}`
}

/** Connects with simple reconnection (backoff up to 10 s) and delivers each JSON message. */
export function useWebSocket(path: string | null, onMessage: (data: SessionEvent) => void) {
  const callback = useRef(onMessage)
  useEffect(() => {
    callback.current = onMessage
  })
  const [connected, setConnected] = useState(false)
  // Refused by the server (1008: invalid token or missing session), per path.
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    let ws: WebSocket | null = null
    let attempt = 0
    let timer: number | undefined
    let alive = true

    const connect = () => {
      ws = new WebSocket(wsUrl(path))
      ws.onopen = () => {
        attempt = 0
        setConnected(true)
      }
      ws.onmessage = (e) => {
        try {
          callback.current(JSON.parse(e.data))
        } catch {
          // non-JSON message: ignore
        }
      }
      ws.onclose = (e) => {
        setConnected(false)
        // 1008 = invalid token / missing session: retrying is pointless.
        if (e.code === 1008) setRefused(path)
        if (!alive || e.code === 1008) return
        timer = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt++))
      }
    }
    connect()
    return () => {
      alive = false
      window.clearTimeout(timer)
      ws?.close()
    }
  }, [path])

  return { connected, refused: refused !== null && refused === path }
}

type StreamState = { id: string | null; events: SessionEvent[]; summary: Session | null }

/** The stream of a Tier 3 session: accumulated events + the latest summary. */
export function useSessionStream(sessionId: string | null) {
  const [state, setState] = useState<StreamState>({ id: sessionId, events: [], summary: null })
  const seen = useRef<{ id: string | null; seqs: Set<number> }>({ id: sessionId, seqs: new Set() })

  const { connected, refused } = useWebSocket(sessionId ? `/ws/stream/${sessionId}` : null, (ev) => {
    if (seen.current.id !== sessionId) seen.current = { id: sessionId, seqs: new Set() }
    // On reconnect the server resends the buffer: drop what already came (by _seq).
    const seq = ev._seq
    if (typeof seq === 'number') {
      if (seen.current.seqs.has(seq)) return
      seen.current.seqs.add(seq)
    }
    setState((prev) => {
      const base = prev.id === sessionId ? prev : { id: sessionId, events: [], summary: null }
      const summary = ev.type === 'gandalf_status' || ev.type === 'gandalf_end' ? (ev.summary as Session) : base.summary
      const events = ev.type === 'gandalf_status' ? base.events : [...base.events, ev]
      return { id: sessionId, events, summary }
    })
  })

  // Switched sessions and nothing from the new one has arrived yet: show empty (derived, no effect).
  const current = state.id === sessionId ? state : { events: [], summary: null }
  return { events: current.events, summary: current.summary, connected, unavailable: refused && !current.summary }
}
