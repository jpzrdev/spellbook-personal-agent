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
  type VaultNote,
} from './api'
import { chat } from './chatStore'

// Periodic refetch + on window focus: edits made in Obsidian show up by themselves.
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
  return useMutation({ mutationFn: (text: string) => post<{ file: string }>('/raw', { text }) })
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

// ---------- Receipts, costs and vault ----------

export function useReceipts(filters: { days: number; tier?: number | null; source?: string | null }) {
  const q = new URLSearchParams({ days: String(filters.days), limit: '500' })
  if (filters.tier) q.set('tier', String(filters.tier))
  if (filters.source) q.set('source', filters.source)
  return useQuery({ queryKey: ['receipts', filters], queryFn: () => api<Receipt[]>(`/receipts?${q}`) })
}

export function useReceipt(id: string | null) {
  return useQuery({ queryKey: ['receipt', id], queryFn: () => api<Receipt & VaultNote>(`/receipts/${id}`), enabled: !!id })
}

export function useCosts(days: number) {
  return useQuery({ queryKey: ['costs', days], queryFn: () => api<Costs>(`/costs?days=${days}`), refetchInterval: 60_000 })
}

export function useTree() {
  return useQuery({ queryKey: ['tree'], queryFn: () => api<TreeNode[]>('/vault/tree') })
}

export function useNote(path: string | null) {
  return useQuery({
    queryKey: ['note', path],
    queryFn: () => api<VaultNote>(`/vault/note?path=${encodeURIComponent(path ?? '')}`),
    enabled: !!path,
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
