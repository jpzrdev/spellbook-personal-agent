import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  del,
  patch,
  post,
  postForm,
  put,
  type Annotation,
  type Costs,
  type Ephemeral,
  type GandalfReply,
  type InternalAction,
  type LibraryTopic,
  type LibraryTopicDetail,
  type ProposalSummary,
  type ProposedEvent,
  type PushDevice,
  type Quiz,
  type QuizGrade,
  type QuizType,
  type Receipt,
  type Reminder,
  type Routine,
  type Session,
  type Skill,
  type Subject,
  type SubjectDetail,
  type Task,
  type Today,
  type TreeNode,
  type MemoryNote,
  type Backlink,
  type MemoryHealth,
  type SearchResult,
  type Agent,
  type SetupStatus,
} from './api'
import { DEFAULT_AGENT } from './avatar'
import type { FieldValue, Module, SpaceConfig, SpaceDetail, SpaceItem, SpaceSummary, SpaceTemplate } from './spaces'
import { chat } from './chatStore'

// Periodic refetch + on window focus: what Gandalf or another device wrote shows up by itself.
export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api<Today>('/today'), refetchInterval: 30_000 })
}

export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => api<Task[]>('/tasks?include_done=true'), refetchInterval: 30_000 })
}

function useInvalidateTasks() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['tasks'] }), qc.invalidateQueries({ queryKey: ['today'] })])
}

export function useCompleteTask() {
  const qc = useQueryClient()
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => patch<Task>(`/tasks/${id}`, { done }),
    // Optimistic update: the check shows up right away; if it fails, it rolls back.
    onMutate: async ({ id, done }) => {
      await Promise.all([qc.cancelQueries({ queryKey: ['tasks'] }), qc.cancelQueries({ queryKey: ['today'] })])
      const previous = { tasks: qc.getQueryData<Task[]>(['tasks']), today: qc.getQueryData<Today>(['today']) }
      const mark = (x: Task) => (x.id === id ? { ...x, done } : x)
      qc.setQueryData<Task[]>(['tasks'], (items) => items?.map(mark))
      qc.setQueryData<Today>(['today'], (t) => t && { ...t, priorities: t.priorities.map(mark) })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(['tasks'], ctx?.previous.tasks)
      qc.setQueryData(['today'], ctx?.previous.today)
    },
    onSettled: invalidate,
  })
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: (task: { text: string; due?: string | null }) => post<Task>('/tasks', task),
    onSuccess: invalidate,
  })
}

export function useCapture() {
  return useMutation({ mutationFn: (c: string | { text: string; title?: string; kind?: 'capture' | 'answer' }) => post<{ file: string }>('/raw', typeof c === 'string' ? { text: c } : c) })
}

/** Web clipper: the page's main text goes to raw/ as Markdown. */
export function useClip() {
  return useMutation({ mutationFn: (c: { url: string; note?: string }) => post<{ file: string }>('/raw/url', c) })
}

export function useAsk() {
  const qc = useQueryClient()
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationKey: ['ask'],
    mutationFn: ({
      text,
      confirm = false,
      forceTier,
      source = 'hud',
      note,
    }: {
      text: string
      confirm?: boolean
      forceTier?: 1 | 2 | 3
      source?: 'hud' | 'voice'
      /** Open study note: goes as context ("ask about this topic"). */
      note?: string
    }) => post<GandalfReply>('/ask', { text, source, confirm, force_tier: forceTier ?? null, previous: chat.previous(), note: note ?? null }),
    // A request may have created a task, a note or a session.
    onSuccess: () => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['sessions'] })]),
  })
}

export function useSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/sessions'), refetchInterval: 15_000 })
}

export function useCancelSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<Session>(`/sessions/${id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useContinueSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => post<Session>(`/sessions/${id}/continue`, { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

// ---------- Skills and routines ----------

export function useSkills() {
  return useQuery({ queryKey: ['skills'], queryFn: () => api<Skill[]>('/skills') })
}

export function useRunSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, instruction }: { name: string; instruction: string }) =>
      post<Session>(`/skills/${encodeURIComponent(name)}/run`, { instruction }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['sessions'] }), qc.invalidateQueries({ queryKey: ['skills'] })]),
  })
}

export function useRoutines() {
  return useQuery({ queryKey: ['routines'], queryFn: () => api<Routine[]>('/routines'), refetchInterval: 30_000 })
}

export function useInternalActions() {
  return useQuery({ queryKey: ['actions'], queryFn: () => api<InternalAction[]>('/routines/actions'), staleTime: Infinity })
}

function useInvalidateRoutines() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['routines'] }), qc.invalidateQueries({ queryKey: ['today'] })])
}

export type NewRoutine = Pick<Routine, 'name' | 'cron' | 'tier' | 'active' | 'skill' | 'action' | 'description' | 'output' | 'notify'>

export function useCreateRoutine() {
  const invalidate = useInvalidateRoutines()
  return useMutation({ mutationFn: (r: NewRoutine) => post<Routine>('/routines', r), onSuccess: invalidate })
}

export function useEditRoutine() {
  const qc = useQueryClient()
  const invalidate = useInvalidateRoutines()
  return useMutation({
    mutationFn: ({ slug, ...changes }: Partial<NewRoutine> & { slug: string }) => patch<Routine>(`/routines/${slug}`, changes),
    onMutate: async ({ slug, ...changes }) => {
      await qc.cancelQueries({ queryKey: ['routines'] })
      const previous = qc.getQueryData<Routine[]>(['routines'])
      qc.setQueryData<Routine[]>(['routines'], (l) => l?.map((r) => (r.slug === slug ? { ...r, ...changes } : r)))
      return { previous }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['routines'], ctx?.previous),
    onSettled: invalidate,
  })
}

export function useRemoveRoutine() {
  const invalidate = useInvalidateRoutines()
  return useMutation({ mutationFn: (slug: string) => del<null>(`/routines/${slug}`), onSuccess: invalidate })
}

export function useRunRoutine() {
  const qc = useQueryClient()
  const invalidate = useInvalidateRoutines()
  return useMutation({
    mutationFn: (slug: string) =>
      post<{ slug: string; tier: number; status: string; session_id?: string; receipt_id?: string; response?: string }>(
        `/routines/${slug}/run`,
        {},
      ),
    onSuccess: () => Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['sessions'] })]),
  })
}

// ---------- Ephemeral outputs and studies ----------

export function useEphemeral() {
  return useQuery({ queryKey: ['ephemeral'], queryFn: () => api<Ephemeral[]>('/ephemeral'), refetchInterval: 60_000 })
}

export function useDiscardEphemeral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<null>(`/ephemeral/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ephemeral'] }),
  })
}

export function useSaveEphemeral() {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: ({ id, target, text }: { id: string; target: 'raw' | 'task'; text?: string }) =>
      post<{ file?: string; task?: Task }>(`/ephemeral/${id}/save`, { target, text }),
    onSuccess: invalidate,
  })
}

export function useStudies() {
  return useQuery({ queryKey: ['studies'], queryFn: () => api<Subject[]>('/studies') })
}

export function useSubject(subject: string) {
  return useQuery({ queryKey: ['studies', subject], queryFn: () => api<SubjectDetail>(`/studies/${encodeURIComponent(subject)}`) })
}

/** Ephemeral quiz: generated when the screen opens and thrown away on leaving (gcTime 0, never refetched by itself). */
export function useQuiz(subject: string, request: { count: number; type: QuizType; topic: string | null }, key: string) {
  return useQuery({
    queryKey: ['quiz', subject, request, key],
    queryFn: () => post<Quiz>(`/studies/${encodeURIComponent(subject)}/quiz`, request),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useGradeQuiz(subject: string) {
  return useMutation({
    mutationFn: (r: { question: string; model_answer: string; answer: string; topic: string | null }) =>
      post<QuizGrade>(`/studies/${encodeURIComponent(subject)}/quiz/grade`, r),
  })
}

/** Deletes the whole subject (topics, annotations and material). */
export function useRemoveSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subject: string) =>
      del<{ title: string; topics: number; annotations: number; sources: number }>(`/studies/${encodeURIComponent(subject)}`),
    onSuccess: (_, subject) => {
      qc.removeQueries({ queryKey: ['studies', subject] })
      qc.removeQueries({ queryKey: ['annotations', subject] })
      return qc.invalidateQueries({ queryKey: ['studies'] })
    },
  })
}

export function useGenerateStudy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { request: string; kind: 'subject' | 'topic' | 'deepen'; note?: string }) => post<Session>('/studies/generate', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

// ---------- Receipts, costs and memory ----------

export function useReceipts(filters: { days: number; tier?: number | null; source?: string | null }) {
  const q = new URLSearchParams({ days: String(filters.days), limit: '500' })
  if (filters.tier) q.set('tier', String(filters.tier))
  if (filters.source) q.set('source', filters.source)
  return useQuery({ queryKey: ['receipts', filters], queryFn: () => api<Receipt[]>(`/receipts?${q}`) })
}

export function useReceipt(id: string | null) {
  return useQuery({ queryKey: ['receipt', id], queryFn: () => api<Receipt & MemoryNote>(`/receipts/${id}`), enabled: !!id })
}

export function useCosts(days: number) {
  return useQuery({ queryKey: ['costs', days], queryFn: () => api<Costs>(`/costs?days=${days}`), refetchInterval: 60_000 })
}

export function useTree() {
  return useQuery({ queryKey: ['tree'], queryFn: () => api<TreeNode[]>('/memory/tree') })
}

export function useNote(path: string | null) {
  return useQuery({
    queryKey: ['note', path],
    queryFn: () => api<MemoryNote>(`/memory/note?path=${encodeURIComponent(path ?? '')}`),
    enabled: !!path,
  })
}

export function useBacklinks(path: string | null) {
  return useQuery({
    queryKey: ['backlinks', path],
    queryFn: () => api<Backlink[]>(`/memory/backlinks?path=${encodeURIComponent(path ?? '')}`),
    enabled: !!path,
  })
}

export function useMemorySearch(q: string) {
  return useQuery({
    queryKey: ['memory-search', q],
    queryFn: () => api<SearchResult[]>(`/memory/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    placeholderData: (previous) => previous,
  })
}

export function useMemoryHealth() {
  return useQuery({ queryKey: ['memory-health'], queryFn: () => api<MemoryHealth>('/memory/health') })
}

/** After any change to the memory's files: the tree, the open notes, backlinks and health. */
function useInvalidateMemory() {
  const qc = useQueryClient()
  return () =>
    Promise.all(['tree', 'note', 'backlinks', 'memory-health', 'memory-search'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

export function useSaveNote() {
  const invalidate = useInvalidateMemory()
  return useMutation({
    mutationFn: (n: { path: string; content: string; base: string | null }) => put<{ path: string; version: string }>('/memory/note', n),
    onSuccess: invalidate,
  })
}

export function useCreateNote() {
  const invalidate = useInvalidateMemory()
  return useMutation({ mutationFn: (n: { path: string; content: string }) => post<{ path: string }>('/memory/note', n), onSuccess: invalidate })
}

export function useDeleteNote() {
  const invalidate = useInvalidateMemory()
  return useMutation({ mutationFn: (path: string) => del<{ trash: string }>(`/memory/note?path=${encodeURIComponent(path)}`), onSuccess: invalidate })
}

export function useMoveNote() {
  const invalidate = useInvalidateMemory()
  return useMutation({
    mutationFn: (m: { src: string; dst: string }) => post<{ path: string; updated_links: string[] }>('/memory/move', m),
    onSuccess: invalidate,
  })
}

// ---------- Reminders, notifications and proposed events ----------

export function useReminders() {
  return useQuery({ queryKey: ['reminders'], queryFn: () => api<Reminder[]>('/reminders'), refetchInterval: 60_000 })
}

export function useEditReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; done?: boolean; snooze_min?: number; text?: string }) =>
      patch<Reminder>(`/reminders/${id}`, changes),
    onSettled: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function useRemoveReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<null>(`/reminders/${id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })
}

export function usePushDevices() {
  return useQuery({ queryKey: ['push'], queryFn: () => api<PushDevice[]>('/push/subscriptions') })
}

export function useConfirmProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, event }: { id: string; event: ProposedEvent }) =>
      post<{ proposal: ProposalSummary; session: Session }>(`/proposals/${id}/confirm`, { event }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useDiscardProposal() {
  return useMutation({ mutationFn: (id: string) => del<null>(`/proposals/${id}`) })
}

// ---------- Study annotations and material ----------

const subjectPath = (s: string) => `/studies/${encodeURIComponent(s)}`

export function useAnnotations(subject: string, topic: string) {
  return useQuery({
    queryKey: ['annotations', subject, topic],
    queryFn: () => api<Annotation[]>(`${subjectPath(subject)}/annotations?topic=${encodeURIComponent(topic)}`),
  })
}

function useInvalidateAnnotations(subject: string) {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['annotations', subject] }), qc.invalidateQueries({ queryKey: ['studies', subject] })])
}

export function useSaveAnnotation(subject: string) {
  const invalidate = useInvalidateAnnotations(subject)
  return useMutation({
    mutationFn: (a: { file?: string; text: string; title?: string | null; topic?: string | null; source?: 'quiz' }) =>
      a.file
        ? put<Annotation>(`${subjectPath(subject)}/annotations`, { file: a.file, text: a.text, title: a.title ?? null })
        : post<Annotation>(`${subjectPath(subject)}/annotations`, { text: a.text, title: a.title ?? null, topic: a.topic ?? null, source: a.source ?? null }),
    onSuccess: invalidate,
  })
}

export function useRemoveAnnotation(subject: string) {
  const invalidate = useInvalidateAnnotations(subject)
  return useMutation({
    mutationFn: (file: string) => del<null>(`${subjectPath(subject)}/annotations?file=${encodeURIComponent(file)}`),
    onSuccess: invalidate,
  })
}

export function useSendMaterial(subject: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: { files: File[]; text: string; topic?: string; structure: boolean }) => {
      const form = new FormData()
      m.files.forEach((f) => form.append('files', f, f.name))
      form.append('text', m.text)
      form.append('topic', m.topic ?? '')
      form.append('structure', String(m.structure))
      return postForm<{ sources: string[]; session: Session | null }>(`${subjectPath(subject)}/material`, form)
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['studies', subject] }), qc.invalidateQueries({ queryKey: ['sessions'] })]),
  })
}

// ---------- Research (web) and Library ----------

export function useEphemeralItem(id: string | null | undefined) {
  return useQuery({ queryKey: ['ephemeral', id], queryFn: () => api<Ephemeral>(`/ephemeral/${id}`), enabled: !!id, retry: false })
}

export function useSaveResearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ephemeralId: string) => post<Session>(`/research/${ephemeralId}/save`, {}),
    onSuccess: () => Promise.all(['sessions', 'ephemeral'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  })
}

export function useNewResearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { request: string; topic?: string; kind?: 'research' | 'plan'; update?: string }) => post<Session>('/research', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useLibrary() {
  return useQuery({ queryKey: ['library'], queryFn: () => api<LibraryTopic[]>('/library') })
}

export function useLibraryTopic(slug: string) {
  return useQuery({ queryKey: ['library', slug], queryFn: () => api<LibraryTopicDetail>(`/library/${encodeURIComponent(slug)}`) })
}

export function useChecklistToTasks(slug: string) {
  const invalidate = useInvalidateTasks()
  return useMutation({
    mutationFn: () => post<{ created: string[] }>(`/library/${encodeURIComponent(slug)}/tasks`, {}),
    onSuccess: invalidate,
  })
}

// ---------- First-run setup and the assistant's identity ----------

export function useSetup() {
  return useQuery({ queryKey: ['setup'], queryFn: () => api<SetupStatus>('/setup'), retry: false, staleTime: 30_000 })
}

/** The assistant's identity (name, gender, colors). Until it loads, the default: Gandalf, the grey wizard. */
export function useAgent(): Agent {
  const { data } = useQuery({ queryKey: ['agent'], queryFn: () => api<Agent>('/agent'), staleTime: Infinity, retry: false })
  return data ?? DEFAULT_AGENT
}

export function useSaveAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Pick<Agent, 'name' | 'gender' | 'avatar'>) => put<Agent>('/setup/agent', body),
    onSuccess: (agent) => {
      qc.setQueryData(['agent'], agent)
      return qc.invalidateQueries({ queryKey: ['setup'] })
    },
  })
}

export function useSaveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; about: string }) => put<SetupStatus['user']>('/setup/user', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup'] }),
  })
}

export function useFinishSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => post<Agent>('/setup/finish', {}),
    onSuccess: (agent) => {
      qc.setQueryData(['agent'], agent)
      qc.setQueryData<SetupStatus>(['setup'], (old) => (old ? { ...old, done: true, agent } : old))
    },
  })
}

// ---------- Pages (spaces) ----------

export function useSpaces() {
  return useQuery({ queryKey: ['spaces'], queryFn: () => api<SpaceSummary[]>('/spaces'), refetchInterval: 30_000 })
}

export function useSpace(slug: string) {
  return useQuery({ queryKey: ['spaces', slug], queryFn: () => api<SpaceDetail>(`/spaces/${slug}`), refetchInterval: 30_000 })
}

export function useSpaceItem(slug: string, item: string) {
  return useQuery({ queryKey: ['spaces', slug, 'item', item], queryFn: () => api<SpaceItem>(`/spaces/${slug}/items/${item}`) })
}

export function useModules() {
  return useQuery({ queryKey: ['modules'], queryFn: () => api<Module[]>('/modules'), staleTime: 60_000 })
}

export function useToggleModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { id: string; active: boolean }) => put<Module[]>(`/modules/${p.id}`, { active: p.active }),
    onSuccess: (data) => {
      qc.setQueryData(['modules'], data)
      return qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useModulePreview(id: string) {
  return useQuery({ queryKey: ['modules', id, 'preview'], queryFn: () => api<SpaceTemplate>(`/modules/${id}/preview`), staleTime: Infinity })
}

function useInvalidateSpaces() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['spaces'] })
}

export function useSaveSpace(slug: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({ mutationFn: (config: SpaceConfig) => put<SpaceConfig>(`/spaces/${slug}/config`, { config }), onSuccess: invalidate })
}

export function useRemoveSpace() {
  const invalidate = useInvalidateSpaces()
  return useMutation({ mutationFn: (slug: string) => del(`/spaces/${slug}`), onSuccess: invalidate })
}

export function useCreateItem(slug: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({
    mutationFn: (p: { title: string; fields: Record<string, FieldValue> }) => post<{ id: string }>(`/spaces/${slug}/items`, p),
    onSuccess: invalidate,
  })
}

export function useUpdateItem(slug: string, item: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { fields?: Record<string, FieldValue>; check?: { section: string; index: number; done: boolean } }) =>
      patch<SpaceItem>(`/spaces/${slug}/items/${item}`, p),
    onSuccess: (data) => {
      qc.setQueryData(['spaces', slug, 'item', item], data)
      return qc.invalidateQueries({ queryKey: ['spaces', slug], exact: true })
    },
  })
}

export function useDeleteItem(slug: string) {
  const invalidate = useInvalidateSpaces()
  return useMutation({ mutationFn: (item: string) => del(`/spaces/${slug}/items/${item}`), onSuccess: invalidate })
}

export type ActionResult = { kind: 'tasks'; created: string[] } | { kind: 'row'; item: SpaceItem } | { kind: 'skill'; session: Session }

export function useSpaceAction(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { index: number; item?: string; values?: Record<string, string> }) =>
      post<ActionResult>(`/spaces/${slug}/actions/${p.index}`, { item: p.item ?? null, values: p.values ?? {} }),
    onSuccess: (r, p) => {
      if (r.kind === 'row' && p.item) qc.setQueryData(['spaces', slug, 'item', p.item], r.item)
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['spaces', slug], exact: true }),
        qc.invalidateQueries({ queryKey: [r.kind === 'tasks' ? 'tasks' : 'sessions'] }),
        qc.invalidateQueries({ queryKey: ['today'] }),
      ])
    },
  })
}
