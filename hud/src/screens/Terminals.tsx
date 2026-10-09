import { Play, TerminalSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ResearchResult } from '../components/ResearchResult'
import { SessionTerminal } from '../components/SessionTerminal'
import { Button, EmptyState, useToast } from '../components/ui'
import { focusRing, solid, sunken } from '../components/ui/styles'
import { cn } from '../lib/cn'
import { useAsk, useSessions } from '../lib/queries'
import { SESSION_STATUS } from '../lib/sessions'

function NewSession({ onCreated }: { onCreated: (id: string) => void }) {
  const ask = useAsk()
  const toast = useToast()
  const [text, setText] = useState('')

  function create(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    ask.mutate(
      { text: t, forceTier: 3 },
      {
        onSuccess: (r) => {
          if (r.needs_confirmation) return toast('info', r.reply)
          setText('')
          if (r.session_id) onCreated(r.session_id)
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  return (
    <form onSubmit={create} className={cn(sunken, 'flex items-center gap-2 rounded-pill py-1 pr-1 pl-4')}>
      <TerminalSquare className="size-4 text-ink-muted" aria-hidden />
      <input
        aria-label="Task for a new Claude Code session"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="New session: describe the task for Claude Code in the memory…"
        className="h-10 min-w-0 flex-1 bg-transparent text-sm placeholder:text-ink-muted/70 focus-visible:outline-none"
      />
      <Button type="submit" size="sm" disabled={!text.trim() || ask.isPending}>
        <Play className="size-3.5" aria-hidden /> Start
      </Button>
    </form>
  )
}

export function Terminals() {
  const { data: sessions = [], isPending } = useSessions()
  const [params, setParams] = useSearchParams()
  const chosen = params.get('session')
  const active = sessions.find((s) => s.id === chosen) ?? sessions[0]
  const select = (id: string) => setParams({ session: id }, { replace: true })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Terminals</h1>
        <p className="mt-1 text-ink-muted">Claude Code sessions running in the memory, live. Up to 2 at a time; the rest wait in the queue.</p>
      </header>
      <NewSession onCreated={select} />

      {isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<TerminalSquare />}
          color="wood"
          title="No sessions yet"
          description="Ask for something that needs work in the memory (in the Chat or up here) and the session shows up on this screen."
        />
      ) : (
        <>
          <div role="tablist" aria-label="Sessions" className={cn(sunken, 'flex gap-1 overflow-x-auto rounded-pill p-1.5')}>
            {sessions.map((s) => {
              const selected = s.id === active?.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => select(s.id)}
                  className={cn(
                    'flex max-w-56 shrink-0 cursor-pointer items-center gap-2 rounded-pill px-4 py-1.5 text-sm font-semibold transition-[box-shadow,color] duration-150',
                    focusRing,
                    selected ? 'bg-surface text-primary-text shadow-raised-sm' : 'text-ink-muted hover:text-ink',
                  )}
                  title={`${s.task} (${SESSION_STATUS[s.status].text})`}
                >
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-pill', solid[SESSION_STATUS[s.status].color])} />
                  <span className="truncate">{s.task}</span>
                  <span className="sr-only">({SESSION_STATUS[s.status].text})</span>
                </button>
              )
            })}
          </div>
          {active && <SessionTerminal key={active.id} sessionId={active.id} initial={active} height="h-[28rem]" onContinued={(next) => select(next.id)} />}
          {/* Web research: the report is ephemeral until you save it (the terminal only shows the run) */}
          {active?.output === 'research' && <ResearchResult key={active.id} sessionId={active.id} defaultOpen={false} />}
        </>
      )}
    </div>
  )
}
