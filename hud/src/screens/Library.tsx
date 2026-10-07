import { ArrowLeft, BookMarked, Compass, FileText, Globe, ListChecks, Map as MapIcon, MessageCircleQuestion, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChatThread } from '../components/ChatThread'
import { Markdown } from '../components/Markdown'
import { Badge, BentoGrid, BentoItem, Button, Card, EmptyState, Modal, Tabs, Textarea, useToast } from '../components/ui'
import { focusRing } from '../components/ui/styles'
import type { LibraryTopic } from '../lib/api'
import { cn } from '../lib/cn'
import { shortDate } from '../lib/dates'
import { useChecklistToTasks, useLibrary, useLibraryTopic, useNewResearch, useNote } from '../lib/queries'

const url = (slug: string, note?: string) => `/library/${encodeURIComponent(slug)}${note ? `?part=${encodeURIComponent(note)}` : ''}`

/** The research modal: new (free topic) or an update of a saved topic. Web only, no memory. */
function ResearchModal({ open, onClose, update, title }: { open: boolean; onClose: () => void; update?: string; title?: string }) {
  const research = useNewResearch()
  const toast = useToast()
  const navigate = useNavigate()
  const [request, setRequest] = useState('')
  const [kind, setKind] = useState<'research' | 'plan'>('research')

  function send() {
    if (!request.trim()) return
    research.mutate(
      { request: request.trim(), kind, update },
      {
        onSuccess: (s) => {
          setRequest('')
          onClose()
          toast('info', 'Researching the web… the result shows up in "Today\'s summaries" for you to save.')
          navigate(`/terminals?session=${s.id}`)
        },
        onError: (e) => toast('error', e.message),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={update ? `Update: ${title}` : 'New research'}
      icon={<Globe />}
      color="silver"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!request.trim() || research.isPending}>
            <Globe className="size-4" aria-hidden /> Research
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!update && (
          <Tabs
            label="Kind"
            value={kind}
            onChange={(v) => setKind(v as 'research' | 'plan')}
            items={[
              { id: 'research', label: 'Research' },
              { id: 'plan', label: 'Plan (trip, move…)' },
            ]}
          />
        )}
        <Textarea
          label={update ? 'What should be updated or added?' : 'What do you want to know?'}
          placeholder={update ? 'E.g.: add a day in Nara; check whether the visa fee changed' : 'E.g.: everything I need to know to move to Canada as a developer'}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        <p className="text-xs text-ink-muted">
          The research runs with web access only (it doesn't see your memory). The result comes back for you to decide whether to keep it. Uses your Claude quota.
        </p>
      </div>
    </Modal>
  )
}

function TopicCard({ t }: { t: LibraryTopic }) {
  return (
    <Link to={url(t.slug)} className={cn('block h-full rounded-card', focusRing)}>
      <Card
        className="h-full transition-shadow hover:shadow-raised-lg"
        title={t.title}
        subtitle={`${t.part_count} part(s)${t.updated ? ` · updated ${shortDate(t.updated)}` : ''}`}
        icon={t.kind === 'plan' ? <MapIcon /> : <Compass />}
        color={t.kind === 'plan' ? 'gold' : 'silver'}
        actions={<Badge color={t.kind === 'plan' ? 'gold' : 'silver'}>{t.kind}</Badge>}
      >
        {t.summary && <p className="line-clamp-3 text-sm text-ink-muted">{t.summary}</p>}
      </Card>
    </Link>
  )
}

export function Library() {
  const { data: topics = [], isPending, error } = useLibrary()
  const [researching, setResearching] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-ink-muted">Research and plans you saved, organized by topic.</p>
        </div>
        <Button onClick={() => setResearching(true)}>
          <Plus className="size-4" aria-hidden /> New research
        </Button>
      </header>
      {isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-danger">{error.message}</p>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<BookMarked />}
          color="silver"
          title="Nothing saved yet"
          description="Ask Gandalf something that needs research (“I want to move to Canada, what do I need to know?”, “put together a trip plan for Japan”) and tap “Save to memory”."
          action={<Button onClick={() => setResearching(true)}><Plus className="size-4" aria-hidden /> New research</Button>}
        />
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {topics.map((t) => (
            <BentoItem key={t.slug}>
              <TopicCard t={t} />
            </BentoItem>
          ))}
        </BentoGrid>
      )}
      <ResearchModal open={researching} onClose={() => setResearching(false)} />
    </div>
  )
}

export function LibraryTopicScreen() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: t, isPending, error } = useLibraryTopic(slug)
  const tasks = useChecklistToTasks(slug)
  const toast = useToast()
  const [updating, setUpdating] = useState(false)
  const part = params.get('part') ?? t?.index ?? null
  const { data: note, isPending: loadingNote } = useNote(part)

  if (isPending) return <p className="text-ink-muted">loading…</p>
  if (error || !t)
    return <EmptyState icon={<BookMarked />} color="ember" title="Topic not found" description={error?.message} />

  const parts = [...(t.index ? [{ note: t.index, title: 'Overview' }] : []), ...t.parts]

  return (
    <div className="flex flex-col gap-6">
      <Link to="/library" className={cn('inline-flex items-center gap-1.5 self-start rounded-pill text-sm font-semibold text-ink-muted hover:text-ink', focusRing)}>
        <ArrowLeft className="size-4" aria-hidden /> Library
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-ink-muted">
            {t.kind === 'plan' ? 'Plan' : 'Research'} · {t.part_count} part(s){t.updated && ` · updated ${shortDate(t.updated)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.has_checklist && (
            <Button
              variant="secondary"
              disabled={tasks.isPending}
              onClick={() =>
                tasks.mutate(undefined, {
                  onSuccess: (r) => toast('success', r.created.length ? `${r.created.length} task(s) created from the checklist` : 'The checklist is already in your tasks'),
                  onError: (e) => toast('error', e.message),
                })
              }
            >
              <ListChecks className="size-4" aria-hidden /> Checklist → tasks
            </Button>
          )}
          <Button onClick={() => setUpdating(true)}>
            <RefreshCw className="size-4" aria-hidden /> Update research
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <nav aria-label="Parts" className="flex flex-col gap-1.5">
          {parts.map((p) => {
            const active = p.note === part
            return (
              <button
                key={p.note}
                type="button"
                onClick={() => setParams({ part: p.note }, { replace: true })}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-left text-sm font-semibold transition-shadow',
                  focusRing,
                  active ? 'text-primary-text shadow-sunken-sm' : 'text-ink-muted shadow-raised-sm hover:text-ink',
                )}
              >
                <FileText className="size-4 shrink-0" aria-hidden /> {p.title}
              </button>
            )
          })}
        </nav>
        <Card key={part ?? ''} className="anim-enter">
          {loadingNote ? <p className="text-ink-muted">loading…</p> : <Markdown text={note?.text ?? ''} />}
        </Card>
        <Card title="Questions" subtitle="about the open part" icon={<MessageCircleQuestion />} color="primary">
          {part && <ChatThread key={part} note={part} newOnly height="max-h-[45vh]" placeholder="Ask about this topic…" />}
        </Card>
      </div>
      <ResearchModal open={updating} onClose={() => setUpdating(false)} update={slug} title={t.title} />
    </div>
  )
}
