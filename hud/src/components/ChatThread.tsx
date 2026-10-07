import { BookmarkPlus, ChevronDown, Send, Terminal } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { ProposalSummary } from '../lib/api'
import { chat, useChat, type Turn } from '../lib/chatStore'
import { mascot, reactToReply } from '../lib/mascot'
import { cn } from '../lib/cn'
import { useAsk, useCapture, useSessions } from '../lib/queries'
import { SESSION_STATUS } from '../lib/sessions'
import { EventProposal } from './EventProposal'
import { GandalfText } from './GandalfText'
import { ResearchResult } from './ResearchResult'
import { SessionTerminal } from './SessionTerminal'
import { Badge, Button, TierBadge, useToast } from './ui'
import { focusRing } from './ui/styles'

const SUGGESTIONS = ['what do I have today?', 'my priorities', 'remind me to … in 30 min', 'add task …', 'organize my raw/']

function useSend(note?: string) {
  const ask = useAsk()
  function send(question: string, confirm = false) {
    const id = chat.add(question)
    mascot.feed(15)
    ask.mutate(
      { text: question, confirm, note },
      {
        onSuccess: (reply) => {
          chat.update(id, { reply })
          reactToReply(reply)
        },
        onError: (err) => {
          chat.update(id, { error: err.message })
          mascot.react('confused', 3000)
        },
      },
    )
  }
  return { send, pending: ask.isPending }
}

/** Files a chat answer back into the memory: it goes to raw/ and compile-raw folds it into the wiki. */
function KeepAnswer({ question, answer }: { question: string; answer: string }) {
  const capture = useCapture()
  const toast = useToast()
  const saved = capture.isSuccess
  return (
    <button
      type="button"
      disabled={saved || capture.isPending}
      onClick={() =>
        capture.mutate(
          { kind: 'answer', title: question.slice(0, 60), text: `## Question

${question}

## Answer

${answer}` },
          { onSuccess: () => toast('success', 'Saved: it goes into the wiki on the next compile'), onError: (e) => toast('error', e.message) },
        )
      }
      className={cn('flex w-fit cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold text-ink-muted shadow-raised-sm hover:text-ink active:shadow-sunken-sm disabled:cursor-default disabled:opacity-60', focusRing)}
    >
      <BookmarkPlus className="size-3.5" aria-hidden /> {saved ? 'Saved to memory' : 'Save to memory'}
    </button>
  )
}

function Reply({ t, last, send }: { t: Turn; last: boolean; send: (q: string, c?: boolean) => void }) {
  const r = t.reply!
  const [open, setOpen] = useState(last)
  const { data: sessions } = useSessions()
  const session = r.session_id ? sessions?.find((s) => s.id === r.session_id) : undefined
  const proposals = (r.data?.proposals as ProposalSummary[] | undefined) ?? []

  if (r.needs_confirmation)
    return (
      <div className="flex flex-col items-start gap-3 rounded-control p-3 shadow-raised-sm">
        <Badge color="gold">daily limit</Badge>
        <GandalfText text={r.reply} />
        <Button size="sm" onClick={() => send(t.question, true)}>
          Use it anyway
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-2 rounded-control p-3 shadow-raised-sm">
      <div className="flex flex-wrap items-center gap-2">
        {r.tier > 0 && <TierBadge tier={r.tier as 1 | 2 | 3} />}
        {r.tier !== 3 && <span className="text-xs text-ink-muted tabular-nums">{(r.duration_ms / 1000).toFixed(r.duration_ms < 1000 ? 2 : 1)} s</span>}
        {session && <Badge color={SESSION_STATUS[session.status].color}>{SESSION_STATUS[session.status].text}</Badge>}
        {r.tier === 1 && !r.understood && <Badge color="gold">not recognized</Badge>}
      </div>
      <GandalfText text={r.reply} />
      {r.tier === 2 && r.intent === 'answer' && <KeepAnswer question={t.question} answer={r.reply} />}
      {proposals.map((p) => (
        <EventProposal
          key={p.id}
          proposal={p}
          onChange={(next) =>
            chat.update(t.id, { reply: { ...r, data: { ...r.data, proposals: proposals.map((x) => (x.id === next.id ? next : x)) } } })
          }
        />
      ))}
      {r.session_id && r.intent === 'research' && <ResearchResult sessionId={r.session_id} />}
      {r.session_id && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((a) => !a)}
              className={cn('flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold shadow-raised-sm active:shadow-sunken-sm', focusRing)}
            >
              <Terminal className="size-3.5" aria-hidden /> {open ? 'Hide terminal' : 'Show terminal'}
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            <Link to={`/terminals?session=${r.session_id}`} className={cn('rounded-pill px-2 py-1 text-xs font-semibold text-primary-text', focusRing)}>
              open in Terminals
            </Link>
          </div>
          {open && <SessionTerminal sessionId={r.session_id} initial={session} height="h-56" />}
        </div>
      )}
    </div>
  )
}

type Props = {
  className?: string
  height?: string
  /** A conversation about a study note: the questions go with it as context. */
  note?: string
  placeholder?: string
  /** Shows only the turns made here (not the whole chat history). */
  newOnly?: boolean
}

/** The conversation with Gandalf: a tier badge on each reply and a mini terminal on Tier 3 replies. */
export function ChatThread({ className, height = 'max-h-[60vh]', note, placeholder = 'Ask or request something…', newOnly = false }: Props) {
  const all = useChat()
  const [since] = useState(() => (newOnly ? all.length : 0))
  const turns = newOnly ? all.slice(since) : all
  const { send, pending } = useSend(note)
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Block body: scrollIntoView may return a Promise, which can't become the "cleanup".
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [turns.length])

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = text.trim()
    if (!q || pending) return
    setText('')
    send(q)
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className={cn('flex flex-col gap-5 overflow-y-auto p-1', height)}>
        {turns.length === 0 && !newOnly && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              Ask anything. Simple rules answer right away (T1); the rest goes to Claude Code (T2 fast or
              T3 with access to the memory).
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setText(s.replace(' …', ' '))
                    field.current?.focus()
                  }}
                  className={cn('cursor-pointer rounded-pill px-3 py-1 text-sm text-ink-muted shadow-raised-sm hover:text-ink active:shadow-sunken-sm', focusRing)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={t.id} className="anim-message flex flex-col gap-2">
            <p className="max-w-[85%] self-end rounded-control px-3 py-2 text-sm font-semibold shadow-sunken-sm">{t.question}</p>
            {t.reply && <Reply t={t} last={i === turns.length - 1} send={send} />}
            {t.error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {t.error}
              </p>
            )}
            {!t.reply && !t.error && <p className="text-sm text-ink-muted">thinking… (Tier 2 takes a few seconds)</p>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-3">
        <input
          ref={field}
          aria-label="Question for Gandalf"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="h-11 min-w-0 flex-1 rounded-pill bg-surface px-4 shadow-sunken placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary"
        />
        <Button type="submit" variant="icon" aria-label="Send" disabled={!text.trim() || pending}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  )
}
