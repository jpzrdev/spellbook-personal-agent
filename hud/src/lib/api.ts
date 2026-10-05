// Cliente do Bridge. As chamadas passam pelo proxy /api do Vite.
export const TOKEN = import.meta.env.BRIDGE_TOKEN as string | undefined

export class BridgeError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
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
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    const detalhe = typeof body.detail === 'string' ? body.detail : resp.statusText
    throw new BridgeError(resp.status, detalhe)
  }
  if (resp.status === 204) return null as T
  return resp.json() as Promise<T>
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
/** Envia arquivo (multipart). Sem Content-Type: o navegador põe o boundary. */
export async function postArquivo<T>(path: string, campo: string, arquivo: Blob, nome: string): Promise<T> {
  const form = new FormData()
  form.append(campo, arquivo, nome)
  const resp = await fetch(`/api${path}`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${TOKEN ?? ''}` } })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new BridgeError(resp.status, typeof body.detail === 'string' ? body.detail : resp.statusText)
  }
  return resp.json() as Promise<T>
}

/** Formulário multipart com vários campos/arquivos. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const resp = await fetch(`/api${path}`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${TOKEN ?? ''}` } })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new BridgeError(resp.status, typeof body.detail === 'string' ? body.detail : resp.statusText)
  }
  return resp.json() as Promise<T>
}

/** Pede um áudio (WAV) da fala do Gandalf. */
export async function buscarFala(texto: string): Promise<Blob> {
  const resp = await fetch('/api/voz/falar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN ?? ''}` },
    body: JSON.stringify({ texto }),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new BridgeError(resp.status, typeof body.detail === 'string' ? body.detail : resp.statusText)
  }
  return resp.blob()
}

export type VozStatus = { stt: boolean; tts: boolean; whisper_modelo: string; voz: string }

export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

export type Health = {
  status: string
  versao: string
  vault: string
  vault_existe: boolean
  claude?: { instalado: boolean; logado: boolean; metodo: string | null }
}

export type Prioridade = 'maxima' | 'alta' | 'media' | 'baixa' | 'minima'

export type Tarefa = {
  id: string
  texto: string
  concluida: boolean
  vence: string | null
  concluida_em: string | null
  prioridade: Prioridade | null
  tags: string[]
}

export type Evento = {
  inicio: string | null
  fim: string | null
  titulo: string
  local: string | null
}

export type RotinaDoDia = {
  slug: string
  nome: string
  horario: string
  quando: string
  status: 'pendente' | 'passou' | 'fila' | 'rodando' | 'ok' | 'erro' | 'cancelada' | 'tempo_esgotado'
  recibo_id?: string
  sessao_id?: string
}

export type Hoje = {
  data: string
  data_extenso: string
  agora: string
  agenda: Evento[]
  prioridades: Tarefa[]
  tarefas: { abertas: number; hoje: number; atrasadas: number; concluidas_hoje: number }
  rotinas: RotinaDoDia[]
}

export type RespostaGandalf = {
  id: string | null
  /** 0 = não executou (precisa confirmar o limite diário) */
  tier: 0 | 1 | 2 | 3
  intent: string | null
  entendeu: boolean
  resposta: string
  duracao_ms: number
  dados: Record<string, unknown>
  sessao_id: string | null
  precisa_confirmar: boolean
}

export type StatusSessao = 'fila' | 'rodando' | 'ok' | 'erro' | 'cancelada' | 'tempo_esgotado'

export type Sessao = {
  id: string
  tarefa: string
  pedido: string
  origem: string
  skill: string | null
  rotina: string | null
  saida: 'vault' | 'efemera'
  efemero_id: string | null
  status: StatusSessao
  claude_session_id: string | null
  retomada_de: string | null
  criada: string
  iniciada: string | null
  terminada: string | null
  resultado: string
  erro: string | null
  arquivos: string[]
  modelo: string | null
  tokens_entrada: number
  tokens_saida: number
  custo_usd: number
  recibo_id: string | null
  num_eventos: number
}

/** Evento do stream de uma sessão: eventos do Claude Code (stream-json) ou do Gandalf (lifeos_*). */
export type EventoSessao = { type: string; [k: string]: unknown }

export const sessaoAtiva = (s: Pick<Sessao, 'status'>) => s.status === 'fila' || s.status === 'rodando'

export type Execucao = {
  quando: string
  status: string
  tier?: number
  recibo_id?: string
  sessao_id?: string
}

export type Rotina = {
  slug: string
  nome: string
  cron: string
  quando: string
  ativa: boolean
  tier: 1 | 3
  skill: string | null
  acao: string | null
  descricao: string
  saida: 'vault' | 'efemera'
  /** Push no celular quando terminar bem (falhas sempre avisam). */
  notificar: boolean
  proxima: string | null
  historico: Execucao[]
}

export type AcaoInterna = { nome: string; descricao: string }

export type Skill = {
  nome: string
  descricao: string
  pasta: string
  ultima_execucao: (Execucao & { id: string; arquivo: string }) | null
}

/** Resultado de passagem (ex.: resumo de e-mails): fica fora do vault e expira. */
export type Efemero = {
  id: string
  titulo: string
  texto: string
  quando: string
  expira: string
  origem: string
  rotina: string | null
  sessao_id: string | null
  /** Resultado de pesquisa web (ainda não guardado): "Guardar no vault" organiza na Biblioteca. */
  pesquisa?: { tema: string; tipo: 'pesquisa' | 'plano'; pedido: string; slug: string | null } | null
}

/** Tema guardado na Biblioteca (wiki/biblioteca/<slug>/). */
export type TemaBiblioteca = { slug: string; titulo: string; tipo: 'pesquisa' | 'plano'; resumo: string; atualizado: string | null; partes: number }

export type TemaBibliotecaDetalhe = TemaBiblioteca & {
  indice: string | null
  lista_partes: Array<{ nota: string; titulo: string; ordem: number | null }>
  tem_checklist: boolean
}

/** Matéria de estudo: o acervo pessoal de wiki/estudos/<materia>/ (tópicos, anotações e material). */
export type Materia = {
  materia: string
  titulo: string
  topicos_total: number
  anotacoes_total: number
  fontes_total: number
  /** Títulos dos primeiros tópicos (para o cartão da lista). */
  titulos: string[]
}

export type Topico = {
  nota: string
  titulo: string
  ordem: number | null
  /** Primeiro parágrafo da nota. */
  resumo: string
  palavras: number
  /** Quantas anotações do usuário este tópico tem. */
  anotacoes?: number
}

/** Anotação do usuário (wiki/estudos/<materia>/_anotacoes/): de um tópico ou geral (topico vazio). */
export type Anotacao = {
  arquivo: string
  titulo: string | null
  texto: string
  topico: string | null
  /** 'quiz' = questão salva de um quiz. */
  origem: 'quiz' | null
  criado: string
  atualizado: string
}

/** Material enviado para a matéria (wiki/estudos/<materia>/_fontes/). */
export type Fonte = { arquivo: string; nome: string; tamanho: number }

export type MateriaDetalhe = Materia & { indice: string; topicos: Topico[]; anotacoes: Anotacao[]; fontes: Fonte[] }

export type TipoQuiz = 'multipla' | 'texto'
export const MAX_PERGUNTAS_QUIZ = 15

/** Pergunta de um quiz efêmero (não fica salvo em lugar nenhum). */
export type PerguntaQuiz = {
  pergunta: string
  resposta: string
  explicacao: string
  /** Nota do tópico de onde a pergunta saiu. */
  topico: string | null
  titulo_topico: string | null
  /** Só na múltipla escolha. */
  opcoes: string[] | null
  correta: number | null
}

export type Quiz = { tipo: TipoQuiz; topico: string | null; perguntas: PerguntaQuiz[] }

export type Veredito = 'certo' | 'parcial' | 'errado'

export type CorrecaoQuiz = { veredito: Veredito; comentario: string; complemento: string }

export type Recibo = {
  id: string
  quando: string | null
  tier: number
  origem: string
  intent: string | null
  rotina: string | null
  status: string
  modelo: string | null
  tokens_entrada: number
  tokens_saida: number
  custo_estimado_usd: number
  duracao_ms: number
  arquivo: string
  pedido: string
}

export type Nota = {
  caminho: string
  texto: string | null
  metadados: Record<string, unknown>
  binario: boolean
  tamanho: number
}

export type CustoDia = {
  dia: string
  chamadas: Record<'1' | '2' | '3', number>
  tokens_entrada: number
  tokens_saida: number
  custo_estimado_usd: number
}

export type TotalCustos = { chamadas: Record<'1' | '2' | '3', number>; tokens: number; custo_estimado_usd: number }

export type Custos = {
  /** Hoje no fuso do Bridge (America/Sao_Paulo). */
  data: string
  por_dia: CustoDia[]
  periodo: TotalCustos
  mes: TotalCustos
  hoje: TotalCustos
  limite_diario_chamadas: number
}

export type NoArvore = { nome: string; caminho: string; tipo: 'pasta' | 'arquivo'; tamanho?: number; filhos?: NoArvore[] }

/** Lembrete do Gandalf (vida/lembretes.md): único (`quando`) ou recorrente (`recorrencia`, cron). */
export type Lembrete = {
  id: string
  texto: string
  concluido: boolean
  quando: string | null
  recorrencia: string | null
  recorrencia_texto: string | null
  concluido_em: string | null
  proximo: string | null
  /** Avisado há pouco (até 2 h): o HUD oferece adiar. */
  avisado_recente?: boolean
}

export type Repetir = 'anual' | 'mensal' | 'semanal' | 'diaria'

/** Evento proposto pelo Gandalf para o Google Agenda; só é criado depois de confirmado. */
export type EventoProposto = {
  titulo: string
  data: string
  dia_inteiro: boolean
  hora_inicio: string | null
  hora_fim: string | null
  repetir: Repetir | null
  avisos_min: number[]
  local: string | null
  descricao: string | null
}

export type PropostaResumo = { id: string; evento: EventoProposto; status: 'pendente' | 'confirmada' | 'descartada'; sessao_id?: string | null }

export type AparelhoPush = { aparelho: string; desde: string; endpoint: string }
