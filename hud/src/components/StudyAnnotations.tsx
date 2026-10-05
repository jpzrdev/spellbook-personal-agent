import { FileText, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Annotation } from '../lib/api'
import { cn } from '../lib/cn'
import { useRemoveAnnotation, useSaveAnnotation, useSendMaterial } from '../lib/queries'
import { relativeTime } from '../lib/time'
import { Markdown } from './Markdown'
import { Badge, Button, Input, Modal, Textarea, Toggle, useToast } from './ui'
import { focusRing, sunken } from './ui/styles'

// ---------- the user's annotations ----------

function AnnotationItem({ subject, a }: { subject: string; a: Annotation }) {
  const save = useSaveAnnotation(subject)
  const remove = useRemoveAnnotation(subject)
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(a.text)
  const [title, setTitle] = useState(a.title ?? '')
  const [confirm, setConfirm] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    save.mutate(
      { file: a.file, text, title: a.topic && a.source !== 'quiz' ? null : title },
      { onSuccess: () => setEditing(false), onError: (err) => toast('error', err.message) },
    )
  }

  if (editing)
    return (
      <form onSubmit={submit} className="anim-pop flex flex-col gap-2 rounded-control p-3 shadow-raised-sm">
        {(!a.topic || a.source === 'quiz') && <Input aria-label="Title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />}
        <Textarea label="Annotation" value={text} onChange={(e) => setText(e.target.value)} className="[&_label]:sr-only" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!text.trim() || save.isPending}>
            Save
          </Button>
        </div>
      </form>
    )

  return (
    <article className="group flex flex-col gap-2 rounded-control p-3 shadow-raised-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {a.title && <h4 className="font-semibold">{a.title}</h4>}
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            {a.source === 'quiz' && <Badge color="violet">from the quiz</Badge>}
            {relativeTime(a.updated || a.created)}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Edit annotation" onClick={() => setEditing(true)} className={cn('rounded-pill p-1.5 text-ink-muted hover:text-ink hover:shadow-raised-sm', focusRing)}>
            <Pencil className="size-3.5" />
          </button>
          {confirm ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-danger" onClick={() => remove.mutate(a.file, { onError: (err) => toast('error', err.message) })}>
              Delete?
            </Button>
          ) : (
            <button type="button" aria-label="Delete annotation" onClick={() => setConfirm(true)} onBlur={() => setTimeout(() => setConfirm(false), 200)} className={cn('rounded-pill p-1.5 text-ink-muted hover:text-danger hover:shadow-raised-sm', focusRing)}>
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </header>
      <Markdown text={a.text} className="text-sm" />
    </article>
  )
}

/** The user's annotations: on a topic (`topic`) or general ones for the subject. Simple Markdown. */
export function Annotations({ subject, items, topic }: { subject: string; items: Annotation[]; topic?: string }) {
  const save = useSaveAnnotation(subject)
  const toast = useToast()
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [open, setOpen] = useState(false)

  function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    save.mutate(
      { text, title: topic ? null : title || null, topic: topic ?? null },
      {
        onSuccess: () => {
          setText('')
          setTitle('')
          setOpen(false)
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {open ? (
        <form onSubmit={add} className="anim-pop flex flex-col gap-2">
          {!topic && <Input aria-label="Title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />}
          <textarea
            autoFocus
            aria-label="New annotation"
            placeholder={topic ? 'What do you want to remember about this topic? (Markdown)' : 'A free annotation about the subject (Markdown)'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={cn(sunken, 'min-h-28 w-full resize-y rounded-control px-4 py-3 text-sm placeholder:text-ink-muted/70', focusRing)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!text.trim() || save.isPending}>
              Save annotation
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" aria-hidden /> New annotation
        </Button>
      )}
      {items.length === 0 && !open && <p className="text-sm text-ink-muted">No annotations yet.</p>}
      <div className="flex flex-col gap-2">
        {items.map((a) => (
          <AnnotationItem key={a.file} subject={subject} a={a} />
        ))}
      </div>
    </div>
  )
}

// ---------- sending material ----------

const ACCEPTED = '.pdf,.md,.txt,.docx,.png,.jpg,.jpeg,.webp,.csv,.html'

/** A modal to send documents and/or text: stored in _sources/ and Gandalf structures it into topics. */
export function SendMaterial({
  subject,
  topic,
  topicTitle,
  open,
  onClose,
}: {
  subject: string
  topic?: string
  topicTitle?: string
  open: boolean
  onClose: () => void
}) {
  const send = useSendMaterial(subject)
  const toast = useToast()
  const navigate = useNavigate()
  const picker = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState('')
  const [structure, setStructure] = useState(true)
  const empty = files.length === 0 && !text.trim()

  function submit() {
    if (empty) return
    send.mutate(
      { files, text, topic, structure },
      {
        onSuccess: (r) => {
          setFiles([])
          setText('')
          onClose()
          if (r.session) {
            toast('success', 'Material received. Gandalf is structuring it (follow along in Terminals).')
            navigate(`/terminals?session=${r.session.id}`)
          } else toast('success', `Material saved (${r.sources.length} file[s])`)
        },
        onError: (err) => toast('error', err.message),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={topicTitle ? `Material for: ${topicTitle}` : 'Send material'}
      icon={<Upload />}
      color="violet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={empty || send.isPending}>
            <Upload className="size-4" aria-hidden /> {structure ? 'Send and structure' : 'Just save'}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Documents</span>
          <input
            ref={picker}
            type="file"
            multiple
            accept={ACCEPTED}
            className="sr-only"
            onChange={(e) => {
              setFiles((current) => [...current, ...Array.from(e.target.files ?? [])].slice(0, 10))
              e.target.value = ''
            }}
          />
          <Button variant="secondary" size="sm" className="self-start" onClick={() => picker.current?.click()}>
            <Paperclip className="size-3.5" aria-hidden /> Choose files
          </Button>
          <p className="text-xs text-ink-muted">PDF, Word, text, Markdown or image (up to 10 files, 25 MB each).</p>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-control px-3 py-1.5 text-sm shadow-sunken-sm">
                  <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-ink-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className={cn('rounded-pill p-1 text-ink-muted hover:text-danger', focusRing)}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Textarea label="Or paste some text" placeholder="Lecture notes, a book excerpt, a transcript…" value={text} onChange={(e) => setText(e.target.value)} />
        <Toggle on={structure} onChange={setStructure} showLabel label="Structure with Gandalf" />
        <p className="text-xs text-ink-muted">
          {structure
            ? `Gandalf reads the material and ${topic ? 'adds it to the topic (or creates new topics if it covers something else)' : 'adds it to the existing topics or creates new ones'}, explaining the new content. Uses your Claude quota.`
            : 'The material is only stored in the subject (the _sources/ folder), without AI.'}
        </p>
      </div>
    </Modal>
  )
}
