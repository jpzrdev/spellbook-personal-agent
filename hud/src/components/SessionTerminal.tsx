import { CornerDownRight, FileText, Square } from 'lucide-react'
import { lazy, Suspense, useState, type FormEvent } from 'react'
import { isSessionActive, type Session } from '../lib/api'
import { cn } from '../lib/cn'
import { useCancelSession, useContinueSession } from '../lib/queries'
import { SESSION_STATUS } from '../lib/sessions'
import { useSessionStream } from '../lib/ws'
import { GandalfText } from './GandalfText'
import { Badge, Button, TerminalPane, useToast } from './ui'
import { sunken } from './ui/styles'

type Props = {
  sessionId: string
  /** Initial summary (from the list); the stream updates it. */
  initial?: Session
  height?: string
  onContinued?: (next: Session) => void
  compact?: boolean
}

/** The live terminal of a Claude Code session, with cancel/continue and the final result. */
// xterm.js is big: it loads only when a terminal shows up on screen.
const XTerm = lazy(() => import('./XTerm').then((m) => ({ default: m.XTerm })))

export function SessionTerminal({ sessionId, initial, height = 'h-80', onContinued, compact }: Props) {
  const { events, summary, connected, unavailable } = useSessionStream(sessionId)
  const s = summary ?? initial
  const cancel = useCancelSession()
  const continueSession = useContinueSession()
  const toast = useToast()
  const [text, setText] = useState('')
  const active = unavailable ? false : s ? isSessionActive(s) : true
  const status = s ? SESSION_STATUS[s.status] : SESSION_STATUS.queued

  function sendContinuation(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    continueSession.mutate(
      { id: sessionId, text: t },
      {
        onSuccess: (next) => {
          setText('')
          onContinued?.(next)
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  if (unavailable)
    return (
      <p className="rounded-control p-3 text-sm text-ink-muted shadow-sunken-sm">
        This session is no longer available (the Bridge was restarted). The result stays in the receipt in <code className="font-mono">receipts/</code>.
      </p>
    )

  return (
    <div className="flex flex-col gap-4">
      <TerminalPane
        title={
          <span className="flex items-center gap-2">
            <span className="truncate">{s?.skill ? `/${s.skill} · ` : ''}{s?.task ?? 'session'}</span>
          </span>
        }
        actions={
          <>
            <Badge color={status.color}>{status.text}</Badge>
            {!connected && active && <span className="text-xs text-ink-muted">reconnecting…</span>}
            {active && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => cancel.mutate(sessionId, { onError: (err) => toast('error', err.message) })}
                disabled={cancel.isPending}
              >
                <Square className="size-3.5" aria-hidden /> Cancel
              </Button>
            )}
          </>
        }
      >
        <Suspense fallback={<div className={height} />}>
          <XTerm events={events} className={height} label={`Output of session ${s?.task ?? sessionId}`} />
        </Suspense>
      </TerminalPane>

      {s && !active && !compact && (
        <div className="flex flex-col gap-3">
          {s.result && (
            <div className="rounded-control p-4 shadow-raised-sm">
              <GandalfText text={s.result} />
            </div>
          )}
          {s.error && s.status !== 'cancelled' && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {s.error}
            </p>
          )}
          {s.files.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Files changed">
              {s.files.map((f) => (
                <li key={f} className="flex items-center gap-1.5 rounded-pill px-3 py-1 font-mono text-xs shadow-raised-sm">
                  <FileText className="size-3.5 text-primary-text" aria-hidden /> {f}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-muted tabular-nums">
            {s.model ?? 'default model'} · {(s.input_tokens + s.output_tokens).toLocaleString('en-US')} tokens
            {s.cost_usd > 0 && ` · ≈ US$ ${s.cost_usd.toFixed(3)} in API terms (reference; you use your subscription)`}
          </p>
          {s.claude_session_id && (
            <form onSubmit={sendContinuation} className={cn(sunken, 'flex items-center gap-2 rounded-pill py-1 pr-1 pl-4')}>
              <CornerDownRight className="size-4 text-ink-muted" aria-hidden />
              <input
                aria-label="Continue this session"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Continue the conversation in this session…"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-muted/70 focus-visible:outline-none"
              />
              <Button type="submit" size="sm" disabled={!text.trim() || continueSession.isPending}>
                Continue
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
