import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  CircleHelp,
  GraduationCap,
  Layers,
  ListOrdered,
  MessageCircleQuestion,
  NotebookPen,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChatThread } from '../components/ChatThread'
import { Annotations, SendMaterial } from '../components/StudyAnnotations'
import { Markdown } from '../components/Markdown'
import { Badge, BentoGrid, BentoItem, Button, Card, EmptyState, Input, Modal, Pill, ProgressBar, Textarea, useToast, type Color } from '../components/ui'
import { focusRing, sunken } from '../components/ui/styles'
import { MAX_QUIZ_QUESTIONS, type QuizGrade, type QuizQuestion, type QuizType, type Subject, type SubjectDetail, type Topic, type Verdict } from '../lib/api'
import { cn } from '../lib/cn'
import { pomodoro } from '../lib/pomodoro'
import { useAnnotations, useGenerateStudy, useGradeQuiz, useNote, useQuiz, useRemoveSubject, useSaveAnnotation, useStudies, useSubject } from '../lib/queries'

const subjectUrl = (s: string) => `/studies/${encodeURIComponent(s)}`
const topicUrl = (s: string, note: string) => `${subjectUrl(s)}/topic?note=${encodeURIComponent(note)}`
const quizUrl = (s: string, q: { count: number; type: QuizType; topic?: string | null }) => {
  const p = new URLSearchParams({ n: String(q.count), type: q.type })
  if (q.topic) p.set('topic', q.topic)
  return `${subjectUrl(s)}/quiz?${p}`
}

const words = (n: number) => (n >= 1000 ? `~${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k words` : `${n} words`)

function Back({ to, text }: { to: string; text: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-1.5 self-start rounded-pill text-sm font-semibold text-ink-muted hover:text-ink', focusRing)}>
      <ArrowLeft className="size-4" aria-hidden /> {text}
    </Link>
  )
}

/** Asks Claude Code (prepare-studies skill) to generate material; shows the session in Terminals. */
function useGenerate() {
  const generate = useGenerateStudy()
  const toast = useToast()
  const navigate = useNavigate()
  return {
    pending: generate.isPending,
    generate: (p: { request: string; kind: 'subject' | 'topic' | 'deepen'; note?: string }, onDone?: () => void) =>
      generate.mutate(p, {
        onSuccess: (s) => {
          toast('success', 'Gandalf started preparing the material (follow along in Terminals)')
          onDone?.()
          navigate(`/terminals?session=${s.id}`)
        },
        onError: (e) => toast('error', e.message),
      }),
  }
}

// ---------- subject list ----------

function NewSubject({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { generate, pending } = useGenerate()
  const [text, setText] = useState('')

  function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    generate({ request: text.trim(), kind: 'subject' }, onClose)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New subject"
      icon={<GraduationCap />}
      color="violet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => send()} disabled={!text.trim() || pending}>
            <Wand2 className="size-4" aria-hidden /> Prepare material
          </Button>
        </>
      }
    >
      <form onSubmit={send} className="flex flex-col gap-4">
        <Textarea
          label="What do you want to study?"
          placeholder="E.g.: certification X from company Y; calculus II; English for job interviews…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-ink-muted">
          Gandalf researches the official content and writes a few long, in-depth topics for you to study at your own pace, ask questions about and generate quizzes from. It takes a few minutes and uses your Claude quota.
        </p>
      </form>
    </Modal>
  )
}

function SubjectCard({ s }: { s: Subject }) {
  return (
    <Card
      className="h-full justify-between"
      title={<Link to={subjectUrl(s.subject)} className={cn('rounded hover:underline', focusRing)}>{s.title}</Link>}
      subtitle={[`${s.topic_count} topic(s)`, s.annotation_count && `${s.annotation_count} annotation(s)`, s.source_count && `${s.source_count} material(s)`].filter(Boolean).join(' · ')}
      icon={<BookOpen />}
      color="violet"
    >
      {s.titles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.titles.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
          {s.topic_count > s.titles.length && <span className="self-center text-xs text-ink-muted">+{s.topic_count - s.titles.length}</span>}
        </div>
      )}
      <Link to={subjectUrl(s.subject)} className={cn('self-end rounded-pill text-sm font-semibold text-primary-text hover:underline', focusRing)}>
        Open collection →
      </Link>
    </Card>
  )
}

export function Studies() {
  const { data: subjects = [], isPending, error } = useStudies()
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Studies</h1>
          <p className="mt-1 text-ink-muted">Your study collection: read, take notes, ask questions and test yourself with Gandalf's quizzes.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> New subject
        </Button>
      </header>
      {isPending ? (
        <p className="text-ink-muted">loading…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-danger">{error.message}</p>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          color="violet"
          title="No subjects yet"
          description="Tap “New subject” and say what you want to study: Gandalf researches the content and writes the topics."
          action={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> New subject</Button>}
        />
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {subjects.map((s) => (
            <BentoItem key={s.subject}>
              <SubjectCard s={s} />
            </BentoItem>
          ))}
        </BentoGrid>
      )}
      <NewSubject open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

// ---------- generating a quiz ----------

const TYPES: Array<{ type: QuizType; text: string; hint: string }> = [
  { type: 'multiple', text: 'Multiple choice', hint: '4 options; graded right away' },
  { type: 'text', text: 'Free text', hint: 'you write; Gandalf grades it' },
]

function GenerateQuiz({ subject, topic, topicTitle, open, onClose }: { subject: string; topic?: string; topicTitle?: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [count, setCount] = useState(5)
  const [type, setType] = useState<QuizType>('multiple')
  const valid = Number.isInteger(count) && count >= 1 && count <= MAX_QUIZ_QUESTIONS

  function start(e?: FormEvent) {
    e?.preventDefault()
    if (!valid) return
    onClose()
    navigate(quizUrl(subject, { count, type, topic }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={topicTitle ? `Quiz: ${topicTitle}` : 'Subject quiz'}
      icon={<CircleHelp />}
      color="violet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => start()} disabled={!valid}>
            <Sparkles className="size-4" aria-hidden /> Generate quiz
          </Button>
        </>
      }
    >
      <form onSubmit={start} className="flex flex-col gap-5">
        <Input
          label="How many questions?"
          hint={`from 1 to ${MAX_QUIZ_QUESTIONS}`}
          type="number"
          min={1}
          max={MAX_QUIZ_QUESTIONS}
          value={Number.isNaN(count) ? '' : count}
          onChange={(e) => setCount(e.target.valueAsNumber)}
          error={valid ? undefined : `Choose from 1 to ${MAX_QUIZ_QUESTIONS}`}
          className="max-w-40"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                aria-pressed={type === t.type}
                onClick={() => setType(t.type)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-control px-4 py-3 text-left transition-shadow',
                  type === t.type ? 'shadow-sunken-sm' : 'shadow-raised-sm hover:shadow-raised',
                  focusRing,
                )}
              >
                <span className={cn('font-semibold', type === t.type && 'text-primary-text')}>{t.text}</span>
                <span className="text-xs text-ink-muted">{t.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-ink-muted">
          {topic ? 'The questions come from this topic and your annotations on it.' : 'The questions come from various topics of the subject.'} The quiz isn't saved: keep the questions you want as annotations. Uses your Claude quota.
        </p>
      </form>
    </Modal>
  )
}

// ---------- subject ----------

function DeleteSubject({ s, open, onClose }: { s: SubjectDetail; open: boolean; onClose: () => void }) {
  const remove = useRemoveSubject()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmation, setConfirmation] = useState('')
  const matches = confirmation.trim().toLowerCase() === s.title.trim().toLowerCase()

  function close() {
    setConfirmation('')
    onClose()
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!matches) return
    remove.mutate(s.subject, {
      onSuccess: () => {
        toast('success', `Subject “${s.title}” deleted`)
        navigate('/studies', { replace: true })
      },
      onError: (err) => toast('error', err.message),
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Delete subject"
      icon={<Trash2 />}
      color="ember"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button className="text-danger" onClick={() => submit()} disabled={!matches || remove.isPending}>
            <Trash2 className="size-4" aria-hidden /> Delete everything
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm">
          This deletes <strong>{s.title}</strong> completely: {s.topic_count} topic(s), {s.annotation_count} of your annotation(s) and {s.source_count} uploaded material(s).
          It can't be undone from the HUD.
        </p>
        <Input label="To confirm, type the subject's name" placeholder={s.title} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoFocus />
      </form>
    </Modal>
  )
}

function TopicRow({ subject, t }: { subject: string; t: Topic }) {
  return (
    <li>
      <Link
        to={topicUrl(subject, t.note)}
        className={cn('flex flex-col gap-1 rounded-control px-4 py-3 shadow-raised-sm transition-shadow hover:shadow-raised active:shadow-sunken-sm', focusRing)}
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 font-semibold">{t.title}</span>
          <span className="flex items-center gap-3 text-xs text-ink-muted">
            {(t.annotation_count ?? 0) > 0 && (
              <span className="flex items-center gap-1" title="your annotations">
                <NotebookPen className="size-3.5" aria-hidden /> {t.annotation_count}
              </span>
            )}
            <span>{words(t.words)}</span>
          </span>
        </span>
        {t.summary && <span className="line-clamp-2 text-sm text-ink-muted">{t.summary}</span>}
      </Link>
    </li>
  )
}

export function SubjectScreen() {
  const { subject = '' } = useParams()
  const { data: s, isPending, error } = useSubject(subject)
  const { generate, pending } = useGenerate()
  const [newTopic, setNewTopic] = useState<string | null>(null)
  const [material, setMaterial] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (isPending) return <p className="text-ink-muted">loading…</p>
  if (error || !s) return <EmptyState icon={<BookOpen />} color="ember" title="Subject not found" description={error?.message} action={<Back to="/studies" text="Studies" />} />

  return (
    <div className="flex flex-col gap-6">
      <Back to="/studies" text="Studies" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{s.title}</h1>
          <p className="mt-1 text-ink-muted">
            {s.topic_count} topic(s) · {words(s.topics.reduce((n, t) => n + t.words, 0))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="hover:text-danger" onClick={() => setDeleting(true)} title="Delete the subject with all its topics, annotations and material">
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
          <Button variant="ghost" onClick={() => setMaterial(true)} title="Send documents or text for Gandalf to structure">
            <Upload className="size-4" aria-hidden /> Send material
          </Button>
          {s.topics.length > 0 && (
            <Button onClick={() => setQuiz(true)} title="Questions from various topics of the subject">
              <CircleHelp className="size-4" aria-hidden /> Generate quiz
            </Button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          title="Topics"
          icon={<Layers />}
          color="violet"
          actions={
            <Button variant="ghost" size="sm" onClick={() => setNewTopic('')}>
              <Plus className="size-3.5" aria-hidden /> Topic
            </Button>
          }
        >
          {s.topics.length === 0 ? (
            <p className="text-sm text-ink-muted">No topics yet. Ask for a new topic or send material.</p>
          ) : (
            <ol className="anim-stagger flex flex-col gap-2">
              {s.topics.map((t) => (
                <TopicRow key={t.note} subject={subject} t={t} />
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="My annotations" subtitle="general ones for the subject" icon={<NotebookPen />} color="silver">
            <Annotations subject={subject} items={s.annotations} />
          </Card>
          {s.sources.length > 0 && (
            <Card title="Uploaded material" subtitle={`${s.sources.length} file(s) in _sources/`} icon={<Upload />} color="wood">
              <ul className="flex flex-col gap-1 text-sm">
                {s.sources.slice(0, 8).map((f) => (
                  <li key={f.file}>
                    <Link to={`/vault?note=${encodeURIComponent(f.file)}`} className={cn('block truncate rounded text-primary-text hover:underline', focusRing)}>
                      {f.name.replace(/^\d{4}-\d{2}-\d{2}-\d{6}-/, '')}
                    </Link>
                  </li>
                ))}
                {s.sources.length > 8 && <li className="text-xs text-ink-muted">…and {s.sources.length - 8} more</li>}
              </ul>
            </Card>
          )}
          {s.index && (
            <Card title="Subject map" subtitle="_index.md" icon={<Sparkles />} color="gold">
              <details className="group">
                <summary className={cn('cursor-pointer text-sm font-semibold text-primary-text', focusRing)}>See the goal and content</summary>
                <Markdown text={s.index} className="mt-3 text-sm" />
              </details>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={newTopic !== null}
        onClose={() => setNewTopic(null)}
        title="New topic"
        icon={<Plus />}
        color="violet"
        footer={
          <Button
            disabled={!newTopic?.trim() || pending}
            onClick={() => generate({ request: `subject "${s.title}" (wiki/studies/${subject}/): ${newTopic}`, kind: 'topic' }, () => setNewTopic(null))}
          >
            <Wand2 className="size-4" aria-hidden /> Generate topic
          </Button>
        }
      >
        <Textarea label="What is the topic about?" placeholder="E.g.: prompt caching and when to use it" value={newTopic ?? ''} onChange={(e) => setNewTopic(e.target.value)} />
      </Modal>
      <SendMaterial subject={subject} open={material} onClose={() => setMaterial(false)} />
      <GenerateQuiz subject={subject} open={quiz} onClose={() => setQuiz(false)} />
      <DeleteSubject s={s} open={deleting} onClose={() => setDeleting(false)} />
    </div>
  )
}

// ---------- topic ----------

export function TopicScreen() {
  const { subject = '' } = useParams()
  const [params] = useSearchParams()
  const note = params.get('note') ?? ''
  const { data: s } = useSubject(subject)
  const { data: content, isPending, error } = useNote(note || null)
  const { data: annotations = [] } = useAnnotations(subject, note)
  const { generate, pending } = useGenerate()
  const navigate = useNavigate()
  const [material, setMaterial] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [deepen, setDeepen] = useState<string | null>(null)
  const t = s?.topics.find((x) => x.note === note)
  const title = t?.title ?? note.split('/').pop()?.replace('.md', '') ?? ''
  const index = s?.topics.findIndex((x) => x.note === note) ?? -1
  const previous = index > 0 ? s?.topics[index - 1] : undefined
  const next = index >= 0 ? s?.topics[index + 1] : undefined

  return (
    <div className="flex flex-col gap-6">
      <Back to={subjectUrl(subject)} text={s?.title ?? 'Subject'} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          {t && (
            <p className="mt-2 text-sm text-ink-muted">
              {words(t.words)}
              {annotations.length > 0 && ` · ${annotations.length} of your annotation(s)`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setMaterial(true)} title="Send documents or text about this topic">
            <Upload className="size-4" aria-hidden /> Material
          </Button>
          <Button variant="ghost" onClick={() => pomodoro.focus(`${title}${s ? ` (${s.title})` : ''}`)} title="Start a pomodoro focus block on this topic">
            <Timer className="size-4" aria-hidden /> Focus
          </Button>
          <Button variant="secondary" onClick={() => setDeepen('')} title="Ask Gandalf to expand this topic">
            <Wand2 className="size-4" aria-hidden /> Deepen
          </Button>
          <Button onClick={() => setQuiz(true)} title="Questions about this topic">
            <CircleHelp className="size-4" aria-hidden /> Generate quiz
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          {isPending ? (
            <p className="text-ink-muted">loading…</p>
          ) : error ? (
            <p role="alert" className="text-danger">{error.message}</p>
          ) : (
            <Markdown text={content?.text ?? ''} />
          )}
          {(previous || next) && (
            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-shade/40 pt-4">
              {previous ? (
                <Button variant="ghost" size="sm" onClick={() => navigate(topicUrl(subject, previous.note))}>
                  ← {previous.title}
                </Button>
              ) : (
                <span />
              )}
              {next && (
                <Button variant="secondary" size="sm" onClick={() => navigate(topicUrl(subject, next.note))}>
                  {next.title} →
                </Button>
              )}
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Questions" subtitle="Gandalf answers based on this note and your annotations" icon={<MessageCircleQuestion />} color="primary">
            <ChatThread key={note} note={note} newOnly height="max-h-[40vh]" placeholder="Ask about this topic…" />
          </Card>
          <Card title="My annotations" subtitle="about this topic" icon={<NotebookPen />} color="silver">
            <Annotations subject={subject} items={annotations} topic={note} />
          </Card>
        </div>
      </div>
      <SendMaterial subject={subject} topic={note} topicTitle={title} open={material} onClose={() => setMaterial(false)} />
      <GenerateQuiz subject={subject} topic={note} topicTitle={title} open={quiz} onClose={() => setQuiz(false)} />
      <Modal
        open={deepen !== null}
        onClose={() => setDeepen(null)}
        title={`Deepen: ${title}`}
        icon={<Wand2 />}
        color="violet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeepen(null)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => generate({ request: deepen ?? '', kind: 'deepen', note }, () => setDeepen(null))}>
              <Wand2 className="size-4" aria-hidden /> Deepen topic
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea
            label="Any focus? (optional)"
            placeholder="E.g.: more practical examples; explain the X part better; compare with Y…"
            value={deepen ?? ''}
            onChange={(e) => setDeepen(e.target.value)}
          />
          <p className="text-xs text-ink-muted">
            Gandalf expands the note with explanations, examples and pitfalls, using your annotations and the uploaded material, without losing what's already there. It takes a few minutes and uses your Claude quota.
          </p>
        </div>
      </Modal>
    </div>
  )
}

// ---------- quiz (ephemeral) ----------

const VERDICT: Record<Verdict, { color: Color; text: string; points: number }> = {
  correct: { color: 'primary', text: 'Correct', points: 1 },
  partial: { color: 'gold', text: 'Almost', points: 0.5 },
  wrong: { color: 'ember', text: 'Wrong', points: 0 },
}
const LETTERS = 'ABCDEF'

type Result = { answer: string; verdict: Verdict; grade?: QuizGrade; saved?: boolean }

/** The text of the annotation created by "Save as annotation". */
function questionAnnotation(q: QuizQuestion, r: Result): string {
  const parts = [`**Question:** ${q.question}`]
  if (q.options) parts.push(q.options.map((o, i) => `- ${LETTERS[i]}) ${i === q.correct ? `**${o}** ✓` : o}`).join('\n'))
  parts.push(`**My answer:** ${r.answer || '(blank)'} (${VERDICT[r.verdict].text.toLowerCase()})`)
  parts.push(`**Correct answer:** ${q.options && q.correct !== null ? `${LETTERS[q.correct]}) ${q.options[q.correct]}` : q.answer}`)
  if (r.grade?.comment) parts.push(r.grade.comment)
  const extra = r.grade?.detail || q.explanation
  if (extra) parts.push(extra)
  return parts.join('\n\n')
}

function CurrentQuestion({
  q,
  subject,
  result,
  onResult,
}: {
  q: QuizQuestion
  subject: string
  result: Result | undefined
  onResult: (r: Result) => void
}) {
  const grade = useGradeQuiz(subject)
  const toast = useToast()
  const [choice, setChoice] = useState<number | null>(null)
  const [text, setText] = useState('')

  function answer(e?: FormEvent) {
    e?.preventDefault()
    if (result) return
    if (q.options) {
      if (choice === null) return
      onResult({ answer: `${LETTERS[choice]}) ${q.options[choice]}`, verdict: choice === q.correct ? 'correct' : 'wrong' })
      return
    }
    if (!text.trim()) return
    grade.mutate(
      { question: q.question, model_answer: q.answer, answer: text, topic: q.topic },
      { onSuccess: (g) => onResult({ answer: text.trim(), verdict: g.verdict, grade: g }), onError: (err) => toast('error', err.message) },
    )
  }

  return (
    <form onSubmit={answer} className="flex flex-col gap-5">
      <p className="font-display text-2xl leading-snug">{q.question}</p>
      {q.options ? (
        <div role="radiogroup" aria-label="Options" className="flex flex-col gap-2">
          {q.options.map((o, i) => {
            const right = result && i === q.correct
            const wrong = result && i === choice && i !== q.correct
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={choice === i}
                disabled={!!result}
                onClick={() => setChoice(i)}
                className={cn(
                  'flex items-start gap-3 rounded-control px-4 py-3 text-left transition-shadow disabled:cursor-default',
                  choice === i || right ? 'shadow-sunken-sm' : 'shadow-raised-sm hover:shadow-raised',
                  right && 'text-primary-text',
                  wrong && 'text-danger',
                  focusRing,
                )}
              >
                <span className="w-5 shrink-0 font-semibold">{LETTERS[i]})</span>
                <span className="min-w-0 flex-1">{o}</span>
                {right && <Check className="size-4 shrink-0" aria-label="correct" />}
                {wrong && <X className="size-4 shrink-0" aria-label="your answer" />}
              </button>
            )
          })}
        </div>
      ) : (
        <textarea
          aria-label="Your answer"
          placeholder="Write your answer in your own words… (Ctrl+Enter sends)"
          value={text}
          disabled={!!result || grade.isPending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) answer()
          }}
          className={cn(sunken, 'min-h-32 w-full resize-y rounded-control px-4 py-3 placeholder:text-ink-muted/70 disabled:opacity-80', focusRing)}
        />
      )}
      {!result && (
        <Button type="submit" className="self-end" disabled={q.options ? choice === null : !text.trim() || grade.isPending}>
          {grade.isPending ? 'Gandalf is grading…' : 'Answer'}
        </Button>
      )}
    </form>
  )
}

function Feedback({ q, r }: { q: QuizQuestion; r: Result }) {
  const v = VERDICT[r.verdict]
  const extra = r.grade?.detail || q.explanation
  return (
    <div className="anim-enter flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={v.color}>{v.text}</Badge>
        {r.grade?.comment && <span className="text-sm">{r.grade.comment}</span>}
      </div>
      <div className="flex flex-col gap-2 rounded-control p-4 shadow-sunken-sm">
        <p className="text-sm">
          <span className="font-semibold">Correct answer: </span>
          {q.options && q.correct !== null ? `${LETTERS[q.correct]}) ${q.options[q.correct]}` : q.answer}
        </p>
        {extra && <Markdown text={extra} className="text-sm" />}
      </div>
    </div>
  )
}

/** Every navigation (including "New quiz" on the same URL) starts a quiz from scratch. */
export function QuizScreen() {
  return <QuizSession key={useLocation().key} />
}

function QuizSession() {
  const { subject = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const topic = params.get('topic')
  const type: QuizType = params.get('type') === 'text' ? 'text' : 'multiple'
  const count = Math.min(MAX_QUIZ_QUESTIONS, Math.max(1, Number(params.get('n')) || 5))
  // location.key changes on every navigation: "New quiz" generates another one instead of reusing the previous
  const { data: quiz, isPending, error, refetch, isFetching } = useQuiz(subject, { count, type, topic }, location.key)
  const { data: s } = useSubject(subject)
  const save = useSaveAnnotation(subject)
  const [i, setI] = useState(0)
  const [results, setResults] = useState<Record<number, Result>>({})

  const questions = quiz?.questions ?? []
  const current = questions[i]
  const r = results[i]
  const done = questions.length > 0 && i >= questions.length
  const topicTitle = topic ? (s?.topics.find((t) => t.note === topic)?.title ?? quiz?.questions[0]?.topic_title) : null
  const points = Object.values(results).reduce((n, x) => n + VERDICT[x.verdict].points, 0)
  const back = topic ? topicUrl(subject, topic) : subjectUrl(subject)

  function saveAsAnnotation() {
    if (!current || !r || r.saved) return
    save.mutate(
      { title: `Quiz: ${current.question.length > 110 ? current.question.slice(0, 109) + '…' : current.question}`, text: questionAnnotation(current, r), topic: current.topic, source: 'quiz' },
      {
        onSuccess: () => {
          setResults((x) => ({ ...x, [i]: { ...r, saved: true } }))
          toast('success', current.topic ? "Question saved to the topic's annotations" : "Question saved to the subject's annotations")
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Back to={back} text={topicTitle ?? s?.title ?? 'Subject'} />
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Quiz{topicTitle ? `: ${topicTitle}` : s ? `: ${s.title}` : ''}</h1>
        <p className="mt-1 text-ink-muted">
          {TYPES.find((t) => t.type === type)?.text}
          {questions.length > 0 && !done && ` · question ${i + 1} of ${questions.length}`}
          {current && !topic && current.topic_title && ` · ${current.topic_title}`}
        </p>
      </header>
      {questions.length > 0 && <ProgressBar label="Quiz progress" value={Math.min(i + (r ? 1 : 0), questions.length)} max={questions.length} color="violet" showValue={false} />}

      {isPending || (isFetching && !quiz) ? (
        <Card className="min-h-48 items-center justify-center">
          <Sparkles className="size-6 animate-pulse text-violet" aria-hidden />
          <p className="text-ink-muted">Gandalf is preparing {count} question(s)…</p>
        </Card>
      ) : error ? (
        <EmptyState
          icon={<CircleHelp />}
          color="ember"
          title="The quiz couldn't be generated"
          description={error.message}
          action={<Button onClick={() => refetch()}><RotateCcw className="size-4" aria-hidden /> Try again</Button>}
        />
      ) : done ? (
        <Card title="Quiz finished" subtitle={`${points.toLocaleString('en-US')} of ${questions.length} point(s)`} icon={<Sparkles />} color="gold" className="anim-pop">
          <ol className="flex flex-col gap-2 text-sm">
            {questions.map((q, k) => {
              const x = results[k]
              return (
                <li key={k} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">{k + 1}. {q.question}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {x?.saved && <BookmarkCheck className="size-4 text-ink-muted" aria-label="saved as an annotation" />}
                    {x && <Badge color={VERDICT[x.verdict].color}>{VERDICT[x.verdict].text}</Badge>}
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-ink-muted">This quiz isn't saved. The questions you saved are in your annotations.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate(back)}>
              Back
            </Button>
            <Button onClick={() => navigate(quizUrl(subject, { count, type, topic }), { replace: true })}>
              <RotateCcw className="size-4" aria-hidden /> New quiz
            </Button>
          </div>
        </Card>
      ) : (
        current && (
          <Card key={i} className="anim-pop gap-5">
            <CurrentQuestion q={current} subject={subject} result={r} onResult={(x) => setResults((y) => ({ ...y, [i]: x }))} />
            {r && (
              <>
                <Feedback q={current} r={r} />
                <div className="flex flex-wrap justify-between gap-2 border-t border-shade/40 pt-4">
                  <Button variant="ghost" size="sm" onClick={saveAsAnnotation} disabled={r.saved || save.isPending}>
                    {r.saved ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
                    {r.saved ? 'Saved to annotations' : 'Save question as an annotation'}
                  </Button>
                  <Button size="sm" onClick={() => setI((x) => x + 1)} autoFocus>
                    {i + 1 < questions.length ? (
                      <>
                        Next <ArrowRight className="size-3.5" aria-hidden />
                      </>
                    ) : (
                      <>
                        <ListOrdered className="size-3.5" aria-hidden /> See the result
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </Card>
        )
      )}
    </div>
  )
}
