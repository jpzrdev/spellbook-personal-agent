// Bridge client. Calls go through Vite's /api proxy.
export const TOKEN = import.meta.env.BRIDGE_TOKEN as string | undefined

export class BridgeError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function errorFrom(resp: Response): Promise<BridgeError> {
  const body = await resp.json().catch(() => ({}))
  return new BridgeError(resp.status, typeof body.detail === 'string' ? body.detail : resp.statusText)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN ?? ''}`,
      ...init.headers,
    },
  })
  if (!resp.ok) throw await errorFrom(resp)
  if (resp.status === 204) return null as T
  return resp.json() as Promise<T>
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** Uploads a file (multipart). No Content-Type: the browser sets the boundary. */
export async function postFile<T>(path: string, field: string, file: Blob, name: string): Promise<T> {
  const form = new FormData()
  form.append(field, file, name)
  return postForm<T>(path, form)
}

/** Multipart form with several fields/files. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const resp = await fetch(`/api${path}`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${TOKEN ?? ''}` } })
  if (!resp.ok) throw await errorFrom(resp)
  return resp.json() as Promise<T>
}

/** Asks for an audio clip (WAV) of Gandalf speaking. */
export async function fetchSpeech(text: string): Promise<Blob> {
  const resp = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN ?? ''}` },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) throw await errorFrom(resp)
  return resp.blob()
}

export type VoiceStatus = { stt: boolean; tts: boolean; whisper_model: string; voice: string; language: string }

export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

export type Health = {
  status: string
  version: string
  memory: string
  memory_exists: boolean
  /** The assistant's language (what Gandalf speaks and writes). The HUD is always in English. */
  language: string
  claude?: { installed: boolean; logged_in: boolean; method: string | null }
}

export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest'

export type Task = {
  id: string
  text: string
  done: boolean
  due: string | null
  done_on: string | null
  priority: Priority | null
  tags: string[]
}

export type AgendaEvent = {
  start: string | null
  end: string | null
  title: string
  location: string | null
}

export type RoutineToday = {
  slug: string
  name: string
  time: string
  schedule: string
  status: 'pending' | 'missed' | 'queued' | 'running' | 'ok' | 'error' | 'cancelled' | 'timed_out'
  receipt_id?: string
  session_id?: string
}

export type Today = {
  date: string
  date_long: string
  now: string
  agenda: AgendaEvent[]
  priorities: Task[]
  tasks: { open: number; today: number; overdue: number; done_today: number }
  routines: RoutineToday[]
}

export type GandalfReply = {
  id: string | null
  /** 0 = didn't run (needs to confirm the daily limit) */
  tier: 0 | 1 | 2 | 3
  intent: string | null
  understood: boolean
  reply: string
  duration_ms: number
  data: Record<string, unknown>
  session_id: string | null
  needs_confirmation: boolean
}

export type SessionStatus = 'queued' | 'running' | 'ok' | 'error' | 'cancelled' | 'timed_out'

export type Session = {
  id: string
  task: string
  request: string
  source: string
  skill: string | null
  routine: string | null
  output: 'memory' | 'ephemeral' | 'action' | 'research' | 'library'
  ephemeral_id: string | null
  status: SessionStatus
  claude_session_id: string | null
  resumed_from: string | null
  created: string
  started: string | null
  finished: string | null
  result: string
  error: string | null
  files: string[]
  model: string | null
  input_tokens: number
  output_tokens: number
  cost_usd: number
  receipt_id: string | null
  event_count: number
}

/** An event of a session's stream: Claude Code events (stream-json) or Gandalf's own (gandalf_*). */
export type SessionEvent = { type: string; [k: string]: unknown }

export const isSessionActive = (s: Pick<Session, 'status'>) => s.status === 'queued' || s.status === 'running'

export type Run = {
  at: string
  status: string
  tier?: number
  receipt_id?: string
  session_id?: string
}

export type Routine = {
  slug: string
  name: string
  cron: string
  schedule: string
  active: boolean
  tier: 1 | 3
  skill: string | null
  action: string | null
  description: string
  output: 'memory' | 'ephemeral'
  /** Phone push when it finishes fine (failures always notify). */
  notify: boolean
  next: string | null
  history: Run[]
}

export type InternalAction = { name: string; description: string }

export type Skill = {
  name: string
  description: string
  folder: string
  last_run: (Run & { id: string; file: string }) | null
}

/** A passing result (e.g. an email summary): it stays outside the memory and expires. */
export type Ephemeral = {
  id: string
  title: string
  text: string
  created: string
  expires: string
  source: string
  routine: string | null
  session_id: string | null
  /** Web research result (not saved yet): "Save to memory" organizes it in the Library. */
  research?: { topic: string; kind: 'research' | 'plan'; request: string; slug: string | null } | null
}

/** A topic saved in the Library (wiki/library/<slug>/). */
export type LibraryTopic = { slug: string; title: string; kind: 'research' | 'plan'; summary: string; updated: string | null; part_count: number }

export type LibraryTopicDetail = LibraryTopic & {
  index: string | null
  parts: Array<{ note: string; title: string; order: number | null }>
  has_checklist: boolean
}

/** A study subject: the personal collection in wiki/studies/<subject>/ (topics, annotations and material). */
export type Subject = {
  subject: string
  title: string
  topic_count: number
  annotation_count: number
  source_count: number
  /** Titles of the first topics (for the list card). */
  titles: string[]
}

export type Topic = {
  note: string
  title: string
  order: number | null
  /** The note's first paragraph. */
  summary: string
  words: number
  /** How many of the user's annotations this topic has. */
  annotation_count?: number
}

/** The user's annotation (wiki/studies/<subject>/_annotations/): on a topic or general (empty topic). */
export type Annotation = {
  file: string
  title: string | null
  text: string
  topic: string | null
  /** 'quiz' = a question saved from a quiz. */
  source: 'quiz' | null
  created: string
  updated: string
}

/** Material uploaded for the subject (wiki/studies/<subject>/_sources/). */
export type Source = { file: string; name: string; size: number }

export type SubjectDetail = Subject & { index: string; topics: Topic[]; annotations: Annotation[]; sources: Source[] }

export type QuizType = 'multiple' | 'text'
export const MAX_QUIZ_QUESTIONS = 15

/** A question of an ephemeral quiz (not saved anywhere). */
export type QuizQuestion = {
  question: string
  answer: string
  explanation: string
  /** Note of the topic the question came from. */
  topic: string | null
  topic_title: string | null
  /** Multiple choice only. */
  options: string[] | null
  correct: number | null
}

export type Quiz = { type: QuizType; topic: string | null; questions: QuizQuestion[] }

export type Verdict = 'correct' | 'partial' | 'wrong'

export type QuizGrade = { verdict: Verdict; comment: string; detail: string }

export type Receipt = {
  id: string
  at: string | null
  tier: number
  source: string
  intent: string | null
  routine: string | null
  status: string
  model: string | null
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  duration_ms: number
  file: string
  request: string
}

export type MemoryNote = {
  path: string
  /** The body without the frontmatter (null for binary files). */
  text: string | null
  /** The whole file, frontmatter included (what the editor edits). */
  raw?: string
  metadata: Record<string, unknown>
  binary: boolean
  size: number
  /** The version the editor opened (text: too big for a JS number): a save with an older one is refused (409). */
  version: string
  /** False for binary files and receipts/. */
  editable: boolean
}

export type SearchResult = { path: string; title: string; snippets: string[]; matches: number }

export type Backlink = { path: string; title: string; context: string }

/** The wiki's mechanical health check (no AI); the lint-wiki skill handles the rest. */
export type MemoryHealth = {
  notes: number
  counts: Record<'broken_links' | 'orphans' | 'unindexed' | 'no_frontmatter' | 'raw_pending', number>
  broken_links: Array<{ source: string; target: string; line: number }>
  orphans: string[]
  unindexed: string[]
  no_frontmatter: string[]
  raw_pending: string[]
}

/** Fetches a memory file with the token (for <img>/<iframe>, which can't send the header) as an object URL. */
export async function fetchMemoryFile(path: string): Promise<string> {
  const resp = await fetch(`/api/memory/file?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${TOKEN ?? ''}` } })
  if (!resp.ok) throw await errorFrom(resp)
  return URL.createObjectURL(await resp.blob())
}

export type DayCost = {
  day: string
  calls: Record<'1' | '2' | '3', number>
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
}

export type CostTotals = { calls: Record<'1' | '2' | '3', number>; tokens: number; estimated_cost_usd: number }

export type Costs = {
  /** Today in the Bridge's time zone. */
  date: string
  by_day: DayCost[]
  period: CostTotals
  month: CostTotals
  today: CostTotals
  daily_call_limit: number
}

export type TreeNode = { name: string; path: string; type: 'folder' | 'file'; size?: number; children?: TreeNode[] }

/** Gandalf's reminder (life/reminders.md): one-off (`when`) or recurring (`recurrence`, cron). */
export type Reminder = {
  id: string
  text: string
  done: boolean
  when: string | null
  recurrence: string | null
  recurrence_text: string | null
  done_at: string | null
  next: string | null
  /** Fired a moment ago (up to 2 h): the HUD offers to snooze. */
  recently_fired?: boolean
}

export type Repeat = 'yearly' | 'monthly' | 'weekly' | 'daily'

/** An event Gandalf proposes for Google Calendar; it's only created after it's confirmed. */
export type ProposedEvent = {
  title: string
  date: string
  all_day: boolean
  start_time: string | null
  end_time: string | null
  repeat: Repeat | null
  reminders_min: number[]
  location: string | null
  description: string | null
}

export type ProposalSummary = { id: string; event: ProposedEvent; status: 'pending' | 'confirmed' | 'discarded'; session_id?: string | null }

export type PushDevice = { device: string; since: string; endpoint: string }
