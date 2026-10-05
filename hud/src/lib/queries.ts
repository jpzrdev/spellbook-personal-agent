import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, del, patch, post, postForm, put, type Anotacao, type TemaBiblioteca, type TemaBibliotecaDetalhe, type AcaoInterna, type AparelhoPush, type Custos, type Efemero, type EventoProposto, type Lembrete, type PropostaResumo, type Materia, type MateriaDetalhe, type Quiz, type CorrecaoQuiz, type TipoQuiz, type NoArvore, type Nota, type Recibo, type Hoje, type RespostaGandalf, type Rotina, type Sessao, type Skill, type Tarefa } from './api'
import { chat } from './chatStore'

// Releitura periódica + ao focar a janela: edições feitas no Obsidian aparecem sozinhas.
export function useHoje() {
  return useQuery({ queryKey: ['hoje'], queryFn: () => api<Hoje>('/hoje'), refetchInterval: 30_000 })
}

export function useTarefas() {
  return useQuery({ queryKey: ['tarefas'], queryFn: () => api<Tarefa[]>('/tarefas?incluir_concluidas=true'), refetchInterval: 30_000 })
}

function useInvalidarTarefas() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['tarefas'] }), qc.invalidateQueries({ queryKey: ['hoje'] })])
}

export function useConcluirTarefa() {
  const qc = useQueryClient()
  const invalidar = useInvalidarTarefas()
  return useMutation({
    mutationFn: ({ id, concluida }: { id: string; concluida: boolean }) =>
      patch<Tarefa>(`/tarefas/${id}`, { concluida }),
    // Atualização otimista: o check aparece na hora; se falhar, volta.
    onMutate: async ({ id, concluida }) => {
      await Promise.all([qc.cancelQueries({ queryKey: ['tarefas'] }), qc.cancelQueries({ queryKey: ['hoje'] })])
      const anterior = { tarefas: qc.getQueryData<Tarefa[]>(['tarefas']), hoje: qc.getQueryData<Hoje>(['hoje']) }
      const marcar = (t: Tarefa) => (t.id === id ? { ...t, concluida } : t)
      qc.setQueryData<Tarefa[]>(['tarefas'], (lista) => lista?.map(marcar))
      qc.setQueryData<Hoje>(['hoje'], (h) => h && { ...h, prioridades: h.prioridades.map(marcar) })
      return { anterior }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(['tarefas'], ctx?.anterior.tarefas)
      qc.setQueryData(['hoje'], ctx?.anterior.hoje)
    },
    onSettled: invalidar,
  })
}

export function useCriarTarefa() {
  const invalidar = useInvalidarTarefas()
  return useMutation({
    mutationFn: (nova: { texto: string; vence?: string | null }) => post<Tarefa>('/tarefas', nova),
    onSuccess: invalidar,
  })
}

export function useCapturar() {
  return useMutation({ mutationFn: (texto: string) => post<{ arquivo: string }>('/raw', { texto }) })
}

export function usePerguntar() {
  const qc = useQueryClient()
  const invalidar = useInvalidarTarefas()
  return useMutation({
    mutationKey: ['perguntar'],
    mutationFn: ({
      texto,
      confirmar = false,
      forcarTier,
      origem = 'hud',
      nota,
    }: {
      texto: string
      confirmar?: boolean
      forcarTier?: 1 | 2 | 3
      origem?: 'hud' | 'voz'
      /** Nota de estudo aberta: vai como contexto ("pergunte sobre este tópico"). */
      nota?: string
    }) => post<RespostaGandalf>('/ask', { texto, origem, confirmar, forcar_tier: forcarTier ?? null, anterior: chat.anteriores(), nota: nota ?? null }),
    // Um pedido pode ter criado tarefa, anotação ou sessão.
    onSuccess: () => Promise.all([invalidar(), qc.invalidateQueries({ queryKey: ['sessoes'] })]),
  })
}

export function useSessoes() {
  return useQuery({ queryKey: ['sessoes'], queryFn: () => api<Sessao[]>('/sessoes'), refetchInterval: 15_000 })
}

export function useCancelarSessao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<Sessao>(`/sessoes/${id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['sessoes'] }),
  })
}

export function useContinuarSessao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, texto }: { id: string; texto: string }) => post<Sessao>(`/sessoes/${id}/continuar`, { texto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessoes'] }),
  })
}

// ---------- Skills e rotinas ----------

export function useSkills() {
  return useQuery({ queryKey: ['skills'], queryFn: () => api<Skill[]>('/skills') })
}

export function useExecutarSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nome, instrucao }: { nome: string; instrucao: string }) =>
      post<Sessao>(`/skills/${encodeURIComponent(nome)}/executar`, { instrucao }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['sessoes'] }), qc.invalidateQueries({ queryKey: ['skills'] })]),
  })
}

export function useRotinas() {
  return useQuery({ queryKey: ['rotinas'], queryFn: () => api<Rotina[]>('/rotinas'), refetchInterval: 30_000 })
}

export function useAcoesInternas() {
  return useQuery({ queryKey: ['acoes'], queryFn: () => api<AcaoInterna[]>('/rotinas/acoes'), staleTime: Infinity })
}

function useInvalidarRotinas() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['rotinas'] }), qc.invalidateQueries({ queryKey: ['hoje'] })])
}

export type NovaRotina = Pick<Rotina, 'nome' | 'cron' | 'tier' | 'ativa' | 'skill' | 'acao' | 'descricao' | 'saida' | 'notificar'>

export function useCriarRotina() {
  const invalidar = useInvalidarRotinas()
  return useMutation({ mutationFn: (r: NovaRotina) => post<Rotina>('/rotinas', r), onSuccess: invalidar })
}

export function useEditarRotina() {
  const qc = useQueryClient()
  const invalidar = useInvalidarRotinas()
  return useMutation({
    mutationFn: ({ slug, ...mudancas }: Partial<NovaRotina> & { slug: string }) => patch<Rotina>(`/rotinas/${slug}`, mudancas),
    onMutate: async ({ slug, ...mudancas }) => {
      await qc.cancelQueries({ queryKey: ['rotinas'] })
      const anterior = qc.getQueryData<Rotina[]>(['rotinas'])
      qc.setQueryData<Rotina[]>(['rotinas'], (l) => l?.map((r) => (r.slug === slug ? { ...r, ...mudancas } : r)))
      return { anterior }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['rotinas'], ctx?.anterior),
    onSettled: invalidar,
  })
}

export function useRemoverRotina() {
  const invalidar = useInvalidarRotinas()
  return useMutation({ mutationFn: (slug: string) => del<null>(`/rotinas/${slug}`), onSuccess: invalidar })
}

export function useRodarRotina() {
  const qc = useQueryClient()
  const invalidar = useInvalidarRotinas()
  return useMutation({
    mutationFn: (slug: string) =>
      post<{ slug: string; tier: number; status: string; sessao_id?: string; recibo_id?: string; resposta?: string }>(
        `/rotinas/${slug}/executar`,
        {},
      ),
    onSuccess: () => Promise.all([invalidar(), qc.invalidateQueries({ queryKey: ['sessoes'] })]),
  })
}

// ---------- Saídas efêmeras e estudos ----------

export function useEfemeros() {
  return useQuery({ queryKey: ['efemeros'], queryFn: () => api<Efemero[]>('/efemeros'), refetchInterval: 60_000 })
}

export function useDescartarEfemero() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<null>(`/efemeros/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['efemeros'] }),
  })
}

export function useGuardarEfemero() {
  const invalidar = useInvalidarTarefas()
  return useMutation({
    mutationFn: ({ id, destino, texto }: { id: string; destino: 'raw' | 'tarefa'; texto?: string }) =>
      post<{ arquivo?: string; tarefa?: Tarefa }>(`/efemeros/${id}/guardar`, { destino, texto }),
    onSuccess: invalidar,
  })
}

export function useEstudos() {
  return useQuery({ queryKey: ['estudos'], queryFn: () => api<Materia[]>('/estudos') })
}

export function useMateria(materia: string) {
  return useQuery({ queryKey: ['estudos', materia], queryFn: () => api<MateriaDetalhe>(`/estudos/${encodeURIComponent(materia)}`) })
}

/** Quiz efêmero: gerado ao abrir a tela e descartado ao sair (gcTime 0, sem refazer sozinho). */
export function useQuiz(materia: string, pedido: { quantidade: number; tipo: TipoQuiz; topico: string | null }, chave: string) {
  return useQuery({
    queryKey: ['quiz', materia, pedido, chave],
    queryFn: () => post<Quiz>(`/estudos/${encodeURIComponent(materia)}/quiz`, pedido),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useCorrigirQuiz(materia: string) {
  return useMutation({
    mutationFn: (r: { pergunta: string; resposta_modelo: string; resposta: string; topico: string | null }) =>
      post<CorrecaoQuiz>(`/estudos/${encodeURIComponent(materia)}/quiz/corrigir`, r),
  })
}

/** Apaga a matéria inteira (tópicos, anotações e material). */
export function useRemoverMateria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (materia: string) =>
      del<{ titulo: string; topicos: number; anotacoes: number; fontes: number }>(`/estudos/${encodeURIComponent(materia)}`),
    onSuccess: (_, materia) => {
      qc.removeQueries({ queryKey: ['estudos', materia] })
      qc.removeQueries({ queryKey: ['anotacoes', materia] })
      return qc.invalidateQueries({ queryKey: ['estudos'] })
    },
  })
}

export function useGerarEstudo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { pedido: string; tipo: 'materia' | 'nota' | 'aprofundar'; nota?: string }) => post<Sessao>('/estudos/gerar', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessoes'] }),
  })
}

// ---------- Recibos, custos e vault ----------

export function useRecibos(filtros: { dias: number; tier?: number | null; origem?: string | null }) {
  const q = new URLSearchParams({ dias: String(filtros.dias), limite: '500' })
  if (filtros.tier) q.set('tier', String(filtros.tier))
  if (filtros.origem) q.set('origem', filtros.origem)
  return useQuery({ queryKey: ['recibos', filtros], queryFn: () => api<Recibo[]>(`/recibos?${q}`) })
}

export function useRecibo(id: string | null) {
  return useQuery({ queryKey: ['recibo', id], queryFn: () => api<Recibo & Nota>(`/recibos/${id}`), enabled: !!id })
}

export function useCustos(dias: number) {
  return useQuery({ queryKey: ['custos', dias], queryFn: () => api<Custos>(`/custos?dias=${dias}`), refetchInterval: 60_000 })
}

export function useArvore() {
  return useQuery({ queryKey: ['arvore'], queryFn: () => api<NoArvore[]>('/vault/arvore') })
}

export function useNota(caminho: string | null) {
  return useQuery({
    queryKey: ['nota', caminho],
    queryFn: () => api<Nota>(`/vault/nota?caminho=${encodeURIComponent(caminho ?? '')}`),
    enabled: !!caminho,
  })
}

// ---------- Lembretes, notificações e propostas de evento ----------

export function useLembretes() {
  return useQuery({ queryKey: ['lembretes'], queryFn: () => api<Lembrete[]>('/lembretes'), refetchInterval: 60_000 })
}

export function useEditarLembrete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...mudancas }: { id: string; concluido?: boolean; adiar_min?: number; texto?: string }) =>
      patch<Lembrete>(`/lembretes/${id}`, mudancas),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lembretes'] }),
  })
}

export function useRemoverLembrete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => del<null>(`/lembretes/${id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lembretes'] }),
  })
}

export function useAparelhosPush() {
  return useQuery({ queryKey: ['push'], queryFn: () => api<AparelhoPush[]>('/push/inscricoes') })
}

export function useConfirmarProposta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, evento }: { id: string; evento: EventoProposto }) =>
      post<{ proposta: PropostaResumo; sessao: Sessao }>(`/propostas/${id}/confirmar`, { evento }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessoes'] }),
  })
}

export function useDescartarProposta() {
  return useMutation({ mutationFn: (id: string) => del<null>(`/propostas/${id}`) })
}

// ---------- Anotações e material de estudo ----------

const qMateria = (m: string) => `/estudos/${encodeURIComponent(m)}`

export function useAnotacoes(materia: string, topico: string) {
  return useQuery({
    queryKey: ['anotacoes', materia, topico],
    queryFn: () => api<Anotacao[]>(`${qMateria(materia)}/anotacoes?topico=${encodeURIComponent(topico)}`),
  })
}

function useInvalidarAnotacoes(materia: string) {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['anotacoes', materia] }), qc.invalidateQueries({ queryKey: ['estudos', materia] })])
}

export function useSalvarAnotacao(materia: string) {
  const invalidar = useInvalidarAnotacoes(materia)
  return useMutation({
    mutationFn: (a: { arquivo?: string; texto: string; titulo?: string | null; topico?: string | null; origem?: 'quiz' }) =>
      a.arquivo
        ? put<Anotacao>(`${qMateria(materia)}/anotacoes`, { arquivo: a.arquivo, texto: a.texto, titulo: a.titulo ?? null })
        : post<Anotacao>(`${qMateria(materia)}/anotacoes`, { texto: a.texto, titulo: a.titulo ?? null, topico: a.topico ?? null, origem: a.origem ?? null }),
    onSuccess: invalidar,
  })
}

export function useRemoverAnotacao(materia: string) {
  const invalidar = useInvalidarAnotacoes(materia)
  return useMutation({
    mutationFn: (arquivo: string) => del<null>(`${qMateria(materia)}/anotacoes?arquivo=${encodeURIComponent(arquivo)}`),
    onSuccess: invalidar,
  })
}

export function useEnviarMaterial(materia: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: { arquivos: File[]; texto: string; topico?: string; estruturar: boolean }) => {
      const form = new FormData()
      m.arquivos.forEach((a) => form.append('arquivos', a, a.name))
      form.append('texto', m.texto)
      form.append('topico', m.topico ?? '')
      form.append('estruturar', String(m.estruturar))
      return postForm<{ fontes: string[]; sessao: Sessao | null }>(`${qMateria(materia)}/material`, form)
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['estudos', materia] }), qc.invalidateQueries({ queryKey: ['sessoes'] })]),
  })
}


// ---------- Pesquisas (web) e Biblioteca ----------

export function useEfemero(id: string | null | undefined) {
  return useQuery({ queryKey: ['efemero', id], queryFn: () => api<Efemero>(`/efemeros/${id}`), enabled: !!id, retry: false })
}

export function useGuardarPesquisa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (efemeroId: string) => post<Sessao>(`/pesquisas/${efemeroId}/guardar`, {}),
    onSuccess: () => Promise.all(['sessoes', 'efemeros'].map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  })
}

export function useNovaPesquisa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { pedido: string; tema?: string; tipo?: 'pesquisa' | 'plano'; atualizar?: string }) => post<Sessao>('/pesquisas', p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessoes'] }),
  })
}

export function useBiblioteca() {
  return useQuery({ queryKey: ['biblioteca'], queryFn: () => api<TemaBiblioteca[]>('/biblioteca') })
}

export function useTemaBiblioteca(slug: string) {
  return useQuery({ queryKey: ['biblioteca', slug], queryFn: () => api<TemaBibliotecaDetalhe>(`/biblioteca/${encodeURIComponent(slug)}`) })
}

export function useTarefasDoChecklist(slug: string) {
  const invalidar = useInvalidarTarefas()
  return useMutation({
    mutationFn: () => post<{ criadas: string[] }>(`/biblioteca/${encodeURIComponent(slug)}/tarefas`, {}),
    onSuccess: invalidar,
  })
}
