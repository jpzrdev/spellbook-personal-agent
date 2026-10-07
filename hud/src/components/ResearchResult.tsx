import { BookMarked, ChevronDown, Globe, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Ephemeral } from '../lib/api'
import { cn } from '../lib/cn'
import { useDiscardEphemeral, useEphemeralItem, useSaveResearch, useSessions } from '../lib/queries'
import { SESSION_STATUS } from '../lib/sessions'
import { Markdown } from './Markdown'
import { Badge, Button, useToast } from './ui'
import { focusRing } from './ui/styles'

/** The buttons of a research result: save it, organized, in the Library (another session, no web) or discard it. */
export function ResearchActions({ e, onDiscarded }: { e: Ephemeral; onDiscarded?: () => void }) {
  const save = useSaveResearch()
  const discard = useDiscardEphemeral()
  const { data: sessions } = useSessions()
  const toast = useToast()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const session = sessionId ? sessions?.find((s) => s.id === sessionId) : undefined

  if (sessionId)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <BookMarked className="size-4 text-primary" aria-hidden />
        {session?.status === 'ok' ? (
          <>
            <span className="font-semibold">Saved to the Library.</span>
            <Link to="/library" className={cn('font-semibold text-primary-text underline underline-offset-2', focusRing)}>
              open
            </Link>
          </>
        ) : session && session.status !== 'queued' && session.status !== 'running' ? (
          <Badge color={SESSION_STATUS[session.status].color}>{SESSION_STATUS[session.status].text}</Badge>
        ) : (
          <span className="text-ink-muted">organizing in the memory…</span>
        )}
        <Link to={`/terminals?session=${sessionId}`} className={cn('text-xs font-semibold text-ink-muted', focusRing)}>
          view session
        </Link>
      </div>
    )

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={save.isPending}
        onClick={() =>
          save.mutate(e.id, {
            onSuccess: (s) => {
              setSessionId(s.id)
              toast('info', `Organizing "${e.research?.topic}" in the Library…`)
            },
            onError: (err) => toast('error', err.message),
          })
        }
      >
        <Save className="size-3.5" aria-hidden /> {e.research?.slug ? 'Update in the Library' : 'Save to memory'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={discard.isPending}
        onClick={() => discard.mutate(e.id, { onSuccess: onDiscarded, onError: (err) => toast('error', err.message) })}
      >
        <Trash2 className="size-3.5" aria-hidden /> Discard
      </Button>
    </div>
  )
}

/** A research result inside the chat: shows up when the session ends; it can be saved or discarded. */
export function ResearchResult({ sessionId }: { sessionId: string }) {
  const { data: sessions } = useSessions()
  const session = sessions?.find((s) => s.id === sessionId)
  const { data: e, isError } = useEphemeralItem(session?.ephemeral_id)
  const [open, setOpen] = useState(true)
  const [discarded, setDiscarded] = useState(false)

  if (!session || session.status === 'queued' || session.status === 'running')
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Globe className="size-4 animate-pulse" aria-hidden /> researching the web… (it may take a minute or two)
      </p>
    )
  if (discarded) return <p className="text-sm text-ink-muted">Research discarded.</p>
  if (session.status !== 'ok' || isError || !e)
    return <p className="text-sm text-ink-muted">{session.status === 'ok' ? 'The result was already saved or has expired.' : `The research didn't finish (${SESSION_STATUS[session.status].text}).`}</p>

  return (
    <div className="flex flex-col gap-3 rounded-control p-3 shadow-sunken-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((a) => !a)}
        className={cn('flex cursor-pointer items-center gap-2 text-left text-sm font-semibold text-primary-text', focusRing)}
      >
        <Globe className="size-4" aria-hidden /> {e.research?.topic ?? e.title}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <Markdown text={e.text} className="max-h-[50vh] overflow-y-auto pr-1 text-sm" />}
      <ResearchActions e={e} onDiscarded={() => setDiscarded(true)} />
    </div>
  )
}
