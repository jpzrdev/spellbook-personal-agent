import {
  ArrowLeft,
  BookOpen,
  BookOpenCheck,
  Brain,
  CircleCheck,
  GraduationCap,
  ListChecks,
  NotebookPen,
  MessageCircleQuestion,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Timer,
  Upload,
  Wand2,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChatThread } from '../components/ChatThread'
import { Anotacoes, EnviarMaterial } from '../components/EstudoAnotacoes'
import { Markdown } from '../components/Markdown'
import { Badge, BentoGrid, BentoItem, Button, Card, Checkbox, EmptyState, Input, Modal, ProgressBar, Textarea, useToast, type Cor } from '../components/ui'
import { foco } from '../components/ui/styles'
import type { Carta, EstadoTopico, Materia, NivelRevisao, Topico } from '../lib/api'
import { cn } from '../lib/cn'
import { dataPorExtenso, ddmm } from '../lib/datas'
import { pomodoro } from '../lib/pomodoro'
import {
  useCartas,
  useConcluirTarefa,
  useEstudos,
  useGerarEstudo,
  useMarcarEstudado,
  useMateria,
  useNota,
  useAnotacoes,
  useRegistrarRevisao,
} from '../lib/queries'

const ESTADO: Record<EstadoTopico, { cor: Cor; texto: string }> = {
  novo: { cor: 'ardosia', texto: 'novo' },
  estudado: { cor: 'ocre', texto: 'estudado' },
  dominado: { cor: 'musgo', texto: 'dominado' },
}

const urlMateria = (m: string) => `/estudos/${encodeURIComponent(m)}`
const urlTopico = (m: string, nota: string) => `${urlMateria(m)}/topico?nota=${encodeURIComponent(nota)}`
const urlRevisar = (m: string, filtro: { nota?: string; todas?: boolean } = {}) =>
  `${urlMateria(m)}/revisar${filtro.nota ? `?nota=${encodeURIComponent(filtro.nota)}` : filtro.todas ? '?todas=1' : ''}`

function Voltar({ para, texto }: { para: string; texto: string }) {
  return (
    <Link to={para} className={cn('inline-flex items-center gap-1.5 self-start rounded-pilula text-sm font-semibold text-tinta-suave hover:text-tinta', foco)}>
      <ArrowLeft className="size-4" aria-hidden /> {texto}
    </Link>
  )
}

/** Pede ao Claude Code (skill preparar-estudos) para gerar material; mostra a sessão em Terminais. */
function useGerar() {
  const gerar = useGerarEstudo()
  const toast = useToast()
  const navigate = useNavigate()
  return {
    pendente: gerar.isPending,
    gerar: (p: { pedido: string; tipo: 'materia' | 'nota' | 'perguntas'; nota?: string }, aoTerminar?: () => void) =>
      gerar.mutate(p, {
        onSuccess: (s) => {
          toast('sucesso', 'O Gandalf começou a preparar o material (acompanhe em Terminais)')
          aoTerminar?.()
          navigate(`/terminais?sessao=${s.id}`)
        },
        onError: (e) => toast('erro', e.message),
      }),
  }
}

// ---------- lista de matérias ----------

function NovaMateria({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { gerar, pendente } = useGerar()
  const [texto, setTexto] = useState('')
  const [prazo, setPrazo] = useState('')

  function enviar(e?: FormEvent) {
    e?.preventDefault()
    if (!texto.trim()) return
    gerar({ pedido: texto.trim() + (prazo ? ` (prazo: ${prazo})` : ''), tipo: 'materia' }, onClose)
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo="Nova matéria"
      icone={<GraduationCap />}
      cor="sakura"
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => enviar()} disabled={!texto.trim() || pendente}>
            <Wand2 className="size-4" aria-hidden /> Preparar material
          </Button>
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Textarea
          rotulo="O que você quer estudar?"
          placeholder="Ex.: certificação X da empresa Y; cálculo II para a prova; inglês para entrevistas…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Input rotulo="Até quando? (opcional)" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="max-w-48" />
        <p className="text-xs text-tinta-suave">
          O Gandalf pesquisa a ementa oficial, cria as notas de cada tópico com perguntas, o cronograma e as tarefas da primeira semana. Leva alguns minutos e usa a sua cota do Claude.
        </p>
      </form>
    </Modal>
  )
}

function CartaoMateria({ m }: { m: Materia }) {
  const navigate = useNavigate()
  const pendentes = m.pendentes.length
  const p = m.progresso
  return (
    <Card
      className="h-full justify-between"
      titulo={<Link to={urlMateria(m.materia)} className={cn('rounded hover:underline', foco)}>{m.titulo}</Link>}
      subtitulo={`${p.total} tópico(s)${m.prazo ? ` · até ${ddmm(m.prazo)}` : ''}`}
      icone={<BookOpen />}
      cor="sakura"
      acoes={pendentes > 0 ? <Badge cor="ocre">{pendentes} para revisar</Badge> : p.estudados > 0 ? <Badge cor="musgo">em dia</Badge> : undefined}
    >
      {p.total > 0 && <ProgressBar rotulo={`Estudados ${p.estudados}/${p.total} · dominados ${p.dominados}`} valor={p.estudados} max={p.total} cor="sakura" />}
      {m.proxima_tarefa && (
        <p className="text-sm">
          <span className="text-tinta-suave">Próxima sessão{m.proxima_tarefa.vence ? ` (${ddmm(m.proxima_tarefa.vence)})` : ''}: </span>
          <span className="font-semibold">{m.proxima_tarefa.texto}</span>
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {pendentes > 0 && (
          <Button variante="secundario" tamanho="sm" onClick={() => navigate(urlRevisar(m.materia))}>
            <Repeat className="size-3.5" aria-hidden /> Revisar
          </Button>
        )}
        <Button tamanho="sm" onClick={() => navigate(urlMateria(m.materia))}>
          <BookOpenCheck className="size-3.5" aria-hidden /> Estudar
        </Button>
      </div>
    </Card>
  )
}

export function Estudos() {
  const { data: materias = [], isPending, error } = useEstudos()
  const [criando, setCriando] = useState(false)
  const totalPendentes = materias.reduce((n, m) => n + m.pendentes.length, 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Estudos</h1>
          <p className="mt-1 text-tinta-suave">
            {materias.length === 0
              ? 'Estude, revise com flashcards e tire dúvidas com o Gandalf.'
              : totalPendentes > 0
                ? `${totalPendentes} tópico(s) para revisar hoje.`
                : 'Nenhuma revisão pendente hoje.'}
          </p>
        </div>
        <Button onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden /> Nova matéria
        </Button>
      </header>
      {isPending ? (
        <p className="text-tinta-suave">carregando…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-erro">{error.message}</p>
      ) : materias.length === 0 ? (
        <EmptyState
          icone={<GraduationCap />}
          cor="sakura"
          titulo="Nenhuma matéria ainda"
          descricao="Toque em “Nova matéria” e diga o que quer estudar: o Gandalf pesquisa o conteúdo, monta as notas, o cronograma e os flashcards."
          acao={<Button onClick={() => setCriando(true)}><Plus className="size-4" aria-hidden /> Nova matéria</Button>}
        />
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {materias.map((m) => (
            <BentoItem key={m.materia}>
              <CartaoMateria m={m} />
            </BentoItem>
          ))}
        </BentoGrid>
      )}
      <NovaMateria aberto={criando} onClose={() => setCriando(false)} />
    </div>
  )
}

// ---------- matéria ----------

function LinhaTopico({ materia, t, hoje }: { materia: string; t: Topico; hoje: string }) {
  const vencida = t.revisar && t.revisar <= hoje
  return (
    <li>
      <Link
        to={urlTopico(materia, t.nota)}
        className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-controle px-3 py-2.5 shadow-relevo-sm transition-shadow hover:shadow-relevo active:shadow-cavado-sm', foco)}
      >
        <span className="w-6 text-right text-xs font-semibold text-tinta-suave tabular-nums">{t.ordem ?? '·'}</span>
        <span className="min-w-0 flex-1 font-semibold">{t.titulo}</span>
        <span className="flex items-center gap-2">
          {(t.anotacoes ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs text-tinta-suave" title="suas anotações">
              <NotebookPen className="size-3.5" aria-hidden /> {t.anotacoes}
            </span>
          )}
          {t.perguntas > 0 && <span className="text-xs text-tinta-suave">{t.perguntas} perguntas</span>}
          {vencida ? <Badge cor="terracota">revisar</Badge> : t.revisar ? <span className="text-xs text-tinta-suave">revisão {ddmm(t.revisar)}</span> : null}
          <Badge cor={ESTADO[t.estado].cor}>{ESTADO[t.estado].texto}</Badge>
        </span>
      </Link>
    </li>
  )
}

export function MateriaTela() {
  const { materia = '' } = useParams()
  const { data: m, isPending, error } = useMateria(materia)
  const concluir = useConcluirTarefa()
  const { gerar, pendente } = useGerar()
  const navigate = useNavigate()
  const toast = useToast()
  const [novoTopico, setNovoTopico] = useState<string | null>(null)
  const [material, setMaterial] = useState(false)

  if (isPending) return <p className="text-tinta-suave">carregando…</p>
  if (error || !m) return <EmptyState icone={<BookOpen />} cor="terracota" titulo="Matéria não encontrada" descricao={error?.message} acao={<Voltar para="/estudos" texto="Estudos" />} />

  const hoje = m.hoje
  const proximo = m.topicos.find((t) => t.estado === 'novo') ?? m.topicos.find((t) => t.revisar && t.revisar <= hoje)
  const pendentes = m.pendentes.length

  function estudarAgora() {
    if (!proximo) return
    pomodoro.focar(`${proximo.titulo} (${m!.titulo})`)
    toast('info', `Pomodoro de foco iniciado: ${proximo.titulo}`)
    navigate(urlTopico(materia, proximo.nota))
  }

  return (
    <div className="flex flex-col gap-6">
      <Voltar para="/estudos" texto="Estudos" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{m.titulo}</h1>
          <p className="mt-1 text-tinta-suave">
            {m.progresso.estudados}/{m.progresso.total} estudados · {m.progresso.dominados} dominados
            {m.prazo && ` · prazo ${dataPorExtenso(m.prazo)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="fantasma" onClick={() => setMaterial(true)} title="Mandar documentos ou texto para o Gandalf estruturar">
            <Upload className="size-4" aria-hidden /> Enviar material
          </Button>
          {pendentes > 0 ? (
            <Button variante="secundario" onClick={() => navigate(urlRevisar(materia))}>
              <Repeat className="size-4" aria-hidden /> Revisar ({pendentes})
            </Button>
          ) : (
            m.progresso.estudados > 0 && (
              <Button variante="secundario" onClick={() => navigate(urlRevisar(materia, { todas: true }))}>
                <Brain className="size-4" aria-hidden /> Treinar tudo
              </Button>
            )
          )}
          {proximo && (
            <Button onClick={estudarAgora}>
              <Timer className="size-4" aria-hidden /> Estudar agora
            </Button>
          )}
        </div>
      </header>
      {m.progresso.total > 0 && <ProgressBar rotulo="Progresso" valor={m.progresso.estudados} max={m.progresso.total} cor="sakura" />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          titulo="Tópicos"
          subtitulo={proximo ? `próximo: ${proximo.titulo}` : 'tudo estudado'}
          icone={<ListChecks />}
          cor="sakura"
          acoes={
            <Button variante="fantasma" tamanho="sm" onClick={() => setNovoTopico('')}>
              <Plus className="size-3.5" aria-hidden /> Tópico
            </Button>
          }
        >
          {m.topicos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Ainda sem tópicos. Peça um tópico novo ou rode “Nova matéria”.</p>
          ) : (
            <ol className="animar-cascata flex flex-col gap-2">
              {m.topicos.map((t) => (
                <LinhaTopico key={t.nota} materia={materia} t={t} hoje={hoje} />
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card titulo="Sessões de estudo" subtitulo="tarefas desta matéria" icone={<CircleCheck />} cor="musgo">
            {m.tarefas.length === 0 ? (
              <p className="text-sm text-tinta-suave">Nenhuma sessão agendada. Peça ao Gandalf: “planeje minha semana”.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {m.tarefas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Checkbox
                      rotulo={<span className="text-sm">{t.texto}</span>}
                      riscar
                      checked={t.concluida}
                      onChange={(e) => concluir.mutate({ id: t.id, concluida: e.target.checked }, { onError: (err) => toast('erro', err.message) })}
                    />
                    {t.vence && <span className={cn('shrink-0 text-xs', t.vence < hoje && !t.concluida ? 'font-semibold text-erro' : 'text-tinta-suave')}>{ddmm(t.vence)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card titulo="Minhas anotações" subtitulo="gerais da matéria" icone={<NotebookPen />} cor="ardosia">
            <Anotacoes materia={materia} itens={m.anotacoes} />
          </Card>
          {m.fontes.length > 0 && (
            <Card titulo="Material enviado" subtitulo={`${m.fontes.length} arquivo(s) em _fontes/`} icone={<Upload />} cor="madeira">
              <ul className="flex flex-col gap-1 text-sm">
                {m.fontes.slice(0, 8).map((f) => (
                  <li key={f.arquivo}>
                    <Link to={`/vault?nota=${encodeURIComponent(f.arquivo)}`} className={cn('block truncate rounded text-musgo-texto hover:underline', foco)}>
                      {f.nome.replace(/^\d{4}-\d{2}-\d{2}-\d{6}-/, '')}
                    </Link>
                  </li>
                ))}
                {m.fontes.length > 8 && <li className="text-xs text-tinta-suave">…e mais {m.fontes.length - 8}</li>}
              </ul>
            </Card>
          )}
          {m.indice && (
            <Card titulo="Plano de estudos" subtitulo="_index.md" icone={<Sparkles />} cor="ocre">
              <details className="group">
                <summary className={cn('cursor-pointer text-sm font-semibold text-musgo-texto', foco)}>Ver objetivo, ementa e cronograma</summary>
                <Markdown texto={m.indice} className="mt-3 text-sm" />
              </details>
            </Card>
          )}
        </div>
      </div>

      <Modal
        aberto={novoTopico !== null}
        onClose={() => setNovoTopico(null)}
        titulo="Novo tópico"
        icone={<Plus />}
        cor="sakura"
        rodape={
          <Button
            disabled={!novoTopico?.trim() || pendente}
            onClick={() => gerar({ pedido: `matéria "${m.titulo}" (wiki/estudos/${materia}/): ${novoTopico}`, tipo: 'nota' }, () => setNovoTopico(null))}
          >
            <Wand2 className="size-4" aria-hidden /> Gerar nota
          </Button>
        }
      >
        <Textarea rotulo="Sobre o que é o tópico?" placeholder="Ex.: prompt caching e quando usar" value={novoTopico ?? ''} onChange={(e) => setNovoTopico(e.target.value)} />
      </Modal>
      <EnviarMaterial materia={materia} aberto={material} onClose={() => setMaterial(false)} />
    </div>
  )
}

// ---------- tópico ----------

export function TopicoTela() {
  const { materia = '' } = useParams()
  const [params] = useSearchParams()
  const nota = params.get('nota') ?? ''
  const { data: m } = useMateria(materia)
  const { data: conteudo, isPending, error } = useNota(nota || null)
  const { data: anotacoes = [] } = useAnotacoes(materia, nota)
  const [material, setMaterial] = useState(false)
  const estudado = useMarcarEstudado(materia)
  const { gerar, pendente } = useGerar()
  const navigate = useNavigate()
  const toast = useToast()
  const t = m?.topicos.find((x) => x.nota === nota)
  const titulo = t?.titulo ?? nota.split('/').pop()?.replace('.md', '') ?? ''
  const indice = m?.topicos.findIndex((x) => x.nota === nota) ?? -1
  const seguinte = indice >= 0 ? m?.topicos[indice + 1] : undefined

  function marcar() {
    estudado.mutate(nota, {
      onSuccess: (r) =>
        toast('sucesso', `Estudado! Primeira revisão ${r.topico.revisar ? ddmm(r.topico.revisar) : 'amanhã'}` + (r.tarefas_concluidas.length ? ' · tarefa concluída' : '')),
      onError: (e) => toast('erro', e.message),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Voltar para={urlMateria(materia)} texto={m?.titulo ?? 'Matéria'} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            {t && <Badge cor={ESTADO[t.estado].cor}>{ESTADO[t.estado].texto}</Badge>}
            {t?.revisar && <span>próxima revisão {ddmm(t.revisar)}</span>}
            {t && t.revisoes > 0 && <span>· {t.revisoes} revisão(ões)</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="fantasma" onClick={() => setMaterial(true)} title="Mandar documentos ou texto sobre este tópico">
            <Upload className="size-4" aria-hidden /> Material
          </Button>
          <Button variante="fantasma" onClick={() => pomodoro.focar(`${titulo}${m ? ` (${m.titulo})` : ''}`)} title="Começar um foco de pomodoro neste tópico">
            <Timer className="size-4" aria-hidden /> Foco
          </Button>
          {t && t.perguntas > 0 && (
            <Button variante="secundario" onClick={() => navigate(urlRevisar(materia, { nota }))}>
              <Brain className="size-4" aria-hidden /> Flashcards ({t.perguntas})
            </Button>
          )}
          {t?.estado === 'novo' && (
            <Button onClick={marcar} disabled={estudado.isPending}>
              <CircleCheck className="size-4" aria-hidden /> Marcar como estudado
            </Button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          {isPending ? (
            <p className="text-tinta-suave">carregando…</p>
          ) : error ? (
            <p role="alert" className="text-erro">{error.message}</p>
          ) : (
            <Markdown texto={conteudo?.texto ?? ''} />
          )}
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-sombra/40 pt-4">
            <Button variante="fantasma" tamanho="sm" disabled={pendente} onClick={() => gerar({ pedido: 'mais perguntas de autoavaliação', tipo: 'perguntas', nota })}>
              <Wand2 className="size-3.5" aria-hidden /> Gerar mais perguntas
            </Button>
            {seguinte && (
              <Button variante="secundario" tamanho="sm" onClick={() => navigate(urlTopico(materia, seguinte.nota))}>
                Próximo: {seguinte.titulo} →
              </Button>
            )}
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <Card titulo="Dúvidas" subtitulo="o Gandalf responde com base nesta nota e nas suas anotações" icone={<MessageCircleQuestion />} cor="musgo">
            <ChatThread key={nota} nota={nota} soNovas altura="max-h-[40vh]" placeholder="Pergunte sobre este tópico…" />
          </Card>
          <Card titulo="Minhas anotações" subtitulo="sobre este tópico" icone={<NotebookPen />} cor="ardosia">
            <Anotacoes materia={materia} itens={anotacoes} topico={nota} />
          </Card>
        </div>
      </div>
      <EnviarMaterial materia={materia} topico={nota} tituloTopico={titulo} aberto={material} onClose={() => setMaterial(false)} />
    </div>
  )
}

// ---------- revisão (flashcards) ----------

const NIVEIS: Array<{ nivel: NivelRevisao; texto: string; tecla: string; cor: string }> = [
  { nivel: 'errei', texto: 'Errei', tecla: '1', cor: 'text-erro' },
  { nivel: 'dificil', texto: 'Difícil', tecla: '2', cor: 'text-madeira-texto' },
  { nivel: 'facil', texto: 'Fácil', tecla: '3', cor: 'text-musgo-texto' },
]
const PESO: Record<NivelRevisao, number> = { errei: 0, dificil: 1, facil: 2 }

export function RevisaoTela() {
  const { materia = '' } = useParams()
  const [params] = useSearchParams()
  const nota = params.get('nota')
  const todas = params.get('todas') === '1'
  const { data: cartas = [], isPending } = useCartas(materia, { nota, todas })
  const { data: m } = useMateria(materia)
  const registrar = useRegistrarRevisao(materia)
  const toast = useToast()
  const [i, setI] = useState(0)
  const [mostrar, setMostrar] = useState(false)
  // pior nível por tópico (a repetição espaçada é por nota)
  const [resultados, setResultados] = useState<Record<string, NivelRevisao>>({})
  const [proximas, setProximas] = useState<Record<string, string | null>>({})
  const atual: Carta | undefined = cartas[i]
  const fim = !isPending && cartas.length > 0 && i >= cartas.length

  function responder(nivel: NivelRevisao) {
    if (!atual) return
    const pior = resultados[atual.nota] && PESO[resultados[atual.nota]] < PESO[nivel] ? resultados[atual.nota] : nivel
    const novos = { ...resultados, [atual.nota]: pior }
    setResultados(novos)
    // última carta deste tópico: grava a revisão dele
    if (!cartas.slice(i + 1).some((c) => c.nota === atual.nota)) {
      registrar.mutate(
        { nota: atual.nota, nivel: pior },
        { onSuccess: (t) => setProximas((p) => ({ ...p, [atual.nota]: t.revisar })), onError: (e) => toast('erro', e.message) },
      )
    }
    setMostrar(false)
    setI((x) => x + 1)
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.matches?.('input, textarea')) return
      if (!mostrar && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setMostrar(true)
      } else if (mostrar) {
        const n = NIVEIS.find((x) => x.tecla === e.key)
        if (n) responder(n.nivel)
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  })

  const acertos = Object.values(resultados).filter((n) => n === 'facil').length

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Voltar para={nota ? urlTopico(materia, nota) : urlMateria(materia)} texto={m?.titulo ?? 'Matéria'} />
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Revisão</h1>
        {cartas.length > 0 && !fim && (
          <p className="mt-1 text-tinta-suave">
            Carta {i + 1} de {cartas.length} · {atual?.titulo}
          </p>
        )}
      </header>
      {cartas.length > 0 && <ProgressBar rotulo="Progresso" valor={Math.min(i, cartas.length)} max={cartas.length} cor="sakura" mostrarValor={false} />}

      {isPending ? (
        <p className="text-tinta-suave">embaralhando as cartas…</p>
      ) : cartas.length === 0 ? (
        <EmptyState
          icone={<CircleCheck />}
          cor="musgo"
          titulo={todas || nota ? 'Sem perguntas aqui' : 'Nada para revisar hoje'}
          descricao={todas || nota ? 'Os tópicos ainda não têm perguntas. Abra um tópico e toque em “Gerar mais perguntas”.' : 'Volte amanhã, ou treine tudo mesmo assim.'}
          acao={!todas && !nota ? <Link to={urlRevisar(materia, { todas: true })} className={cn('font-semibold text-musgo-texto', foco)}>Treinar tudo</Link> : undefined}
        />
      ) : fim ? (
        <Card titulo="Revisão concluída" subtitulo={`${acertos} de ${Object.keys(resultados).length} tópico(s) fáceis`} icone={<Sparkles />} cor="ocre" className="animar-surgir">
          <ul className="flex flex-col gap-2 text-sm">
            {Object.entries(resultados).map(([n, nivel]) => (
              <li key={n} className="flex justify-between gap-2">
                <span className="font-semibold">{cartas.find((c) => c.nota === n)?.titulo}</span>
                <span className="text-tinta-suave">
                  {NIVEIS.find((x) => x.nivel === nivel)?.texto} · volta {proximas[n] ? ddmm(proximas[n]!) : '…'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Link to={urlMateria(materia)} className={cn('font-semibold text-musgo-texto', foco)}>
              Voltar à matéria
            </Link>
          </div>
        </Card>
      ) : (
        atual && (
          <Card key={atual.id} className="animar-surgir min-h-64 justify-between">
            <p className="font-titulo text-2xl leading-snug">{atual.pergunta}</p>
            {mostrar ? (
              <div className="animar-entrada flex flex-col gap-4">
                <div className="rounded-controle p-4 shadow-cavado-sm">
                  <Markdown texto={atual.resposta} />
                </div>
                <p className="text-center text-xs text-tinta-suave">Como foi? (teclas 1, 2, 3)</p>
                <div className="grid grid-cols-3 gap-2">
                  {NIVEIS.map((n) => (
                    <Button key={n.nivel} variante="secundario" className={n.cor} onClick={() => responder(n.nivel)}>
                      {n.texto}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <Button className="self-center" onClick={() => setMostrar(true)}>
                <Play className="size-4" aria-hidden /> Mostrar resposta
              </Button>
            )}
          </Card>
        )
      )}
    </div>
  )
}
