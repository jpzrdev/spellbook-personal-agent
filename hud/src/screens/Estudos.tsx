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
import { Anotacoes, EnviarMaterial } from '../components/EstudoAnotacoes'
import { Markdown } from '../components/Markdown'
import { Badge, BentoGrid, BentoItem, Button, Card, EmptyState, Input, Modal, Pill, ProgressBar, Textarea, useToast, type Cor } from '../components/ui'
import { cavado, foco } from '../components/ui/styles'
import { MAX_PERGUNTAS_QUIZ, type CorrecaoQuiz, type Materia, type MateriaDetalhe, type PerguntaQuiz, type TipoQuiz, type Topico, type Veredito } from '../lib/api'
import { cn } from '../lib/cn'
import { pomodoro } from '../lib/pomodoro'
import { useAnotacoes, useCorrigirQuiz, useEstudos, useGerarEstudo, useMateria, useNota, useQuiz, useRemoverMateria, useSalvarAnotacao } from '../lib/queries'

const urlMateria = (m: string) => `/estudos/${encodeURIComponent(m)}`
const urlTopico = (m: string, nota: string) => `${urlMateria(m)}/topico?nota=${encodeURIComponent(nota)}`
const urlQuiz = (m: string, q: { quantidade: number; tipo: TipoQuiz; topico?: string | null }) => {
  const p = new URLSearchParams({ n: String(q.quantidade), tipo: q.tipo })
  if (q.topico) p.set('topico', q.topico)
  return `${urlMateria(m)}/quiz?${p}`
}

const palavras = (n: number) => (n >= 1000 ? `~${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil palavras` : `${n} palavras`)

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
    gerar: (p: { pedido: string; tipo: 'materia' | 'nota' | 'aprofundar'; nota?: string }, aoTerminar?: () => void) =>
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

  function enviar(e?: FormEvent) {
    e?.preventDefault()
    if (!texto.trim()) return
    gerar({ pedido: texto.trim(), tipo: 'materia' }, onClose)
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
          placeholder="Ex.: certificação X da empresa Y; cálculo II; inglês para entrevistas…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p className="text-xs text-tinta-suave">
          O Gandalf pesquisa o conteúdo oficial e escreve poucos tópicos, longos e aprofundados, para você estudar no seu ritmo, tirar dúvidas e gerar quizzes. Leva alguns minutos e usa a sua cota do Claude.
        </p>
      </form>
    </Modal>
  )
}

function CartaoMateria({ m }: { m: Materia }) {
  return (
    <Card
      className="h-full justify-between"
      titulo={<Link to={urlMateria(m.materia)} className={cn('rounded hover:underline', foco)}>{m.titulo}</Link>}
      subtitulo={[`${m.topicos_total} tópico(s)`, m.anotacoes_total && `${m.anotacoes_total} anotação(ões)`, m.fontes_total && `${m.fontes_total} material(is)`].filter(Boolean).join(' · ')}
      icone={<BookOpen />}
      cor="sakura"
    >
      {m.titulos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.titulos.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
          {m.topicos_total > m.titulos.length && <span className="self-center text-xs text-tinta-suave">+{m.topicos_total - m.titulos.length}</span>}
        </div>
      )}
      <Link to={urlMateria(m.materia)} className={cn('self-end rounded-pilula text-sm font-semibold text-musgo-texto hover:underline', foco)}>
        Abrir acervo →
      </Link>
    </Card>
  )
}

export function Estudos() {
  const { data: materias = [], isPending, error } = useEstudos()
  const [criando, setCriando] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Estudos</h1>
          <p className="mt-1 text-tinta-suave">Seu acervo de estudo: leia, anote, tire dúvidas e teste-se com quizzes do Gandalf.</p>
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
          descricao="Toque em “Nova matéria” e diga o que quer estudar: o Gandalf pesquisa o conteúdo e escreve os tópicos."
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

// ---------- gerar quiz ----------

const TIPOS: Array<{ tipo: TipoQuiz; texto: string; dica: string }> = [
  { tipo: 'multipla', texto: 'Múltipla escolha', dica: '4 opções; a correção é na hora' },
  { tipo: 'texto', texto: 'Texto livre', dica: 'você escreve; o Gandalf corrige' },
]

function GerarQuiz({ materia, topico, tituloTopico, aberto, onClose }: { materia: string; topico?: string; tituloTopico?: string; aberto: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [quantidade, setQuantidade] = useState(5)
  const [tipo, setTipo] = useState<TipoQuiz>('multipla')
  const valido = Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= MAX_PERGUNTAS_QUIZ

  function comecar(e?: FormEvent) {
    e?.preventDefault()
    if (!valido) return
    onClose()
    navigate(urlQuiz(materia, { quantidade, tipo, topico }))
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo={tituloTopico ? `Quiz: ${tituloTopico}` : 'Quiz da matéria'}
      icone={<CircleHelp />}
      cor="sakura"
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => comecar()} disabled={!valido}>
            <Sparkles className="size-4" aria-hidden /> Gerar quiz
          </Button>
        </>
      }
    >
      <form onSubmit={comecar} className="flex flex-col gap-5">
        <Input
          rotulo="Quantas perguntas?"
          dica={`de 1 a ${MAX_PERGUNTAS_QUIZ}`}
          type="number"
          min={1}
          max={MAX_PERGUNTAS_QUIZ}
          value={Number.isNaN(quantidade) ? '' : quantidade}
          onChange={(e) => setQuantidade(e.target.valueAsNumber)}
          erro={valido ? undefined : `Escolha de 1 a ${MAX_PERGUNTAS_QUIZ}`}
          className="max-w-40"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Tipo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPOS.map((t) => (
              <button
                key={t.tipo}
                type="button"
                aria-pressed={tipo === t.tipo}
                onClick={() => setTipo(t.tipo)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-controle px-4 py-3 text-left transition-shadow',
                  tipo === t.tipo ? 'shadow-cavado-sm' : 'shadow-relevo-sm hover:shadow-relevo',
                  foco,
                )}
              >
                <span className={cn('font-semibold', tipo === t.tipo && 'text-musgo-texto')}>{t.texto}</span>
                <span className="text-xs text-tinta-suave">{t.dica}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-tinta-suave">
          {topico ? 'As perguntas saem deste tópico e das suas anotações sobre ele.' : 'As perguntas saem de tópicos variados da matéria.'} O quiz não fica salvo: guarde as questões que quiser como anotação. Usa a sua cota do Claude.
        </p>
      </form>
    </Modal>
  )
}

// ---------- matéria ----------

function ExcluirMateria({ m, aberto, onClose }: { m: MateriaDetalhe; aberto: boolean; onClose: () => void }) {
  const remover = useRemoverMateria()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmacao, setConfirmacao] = useState('')
  const confere = confirmacao.trim().toLowerCase() === m.titulo.trim().toLowerCase()

  function fechar() {
    setConfirmacao('')
    onClose()
  }

  function excluir(e?: FormEvent) {
    e?.preventDefault()
    if (!confere) return
    remover.mutate(m.materia, {
      onSuccess: () => {
        toast('sucesso', `Matéria “${m.titulo}” excluída`)
        navigate('/estudos', { replace: true })
      },
      onError: (err) => toast('erro', err.message),
    })
  }

  return (
    <Modal
      aberto={aberto}
      onClose={fechar}
      titulo="Excluir matéria"
      icone={<Trash2 />}
      cor="terracota"
      rodape={
        <>
          <Button variante="fantasma" onClick={fechar}>
            Cancelar
          </Button>
          <Button className="text-erro" onClick={() => excluir()} disabled={!confere || remover.isPending}>
            <Trash2 className="size-4" aria-hidden /> Excluir tudo
          </Button>
        </>
      }
    >
      <form onSubmit={excluir} className="flex flex-col gap-4">
        <p className="text-sm">
          Isto apaga <strong>{m.titulo}</strong> por completo: {m.topicos_total} tópico(s), {m.anotacoes_total} anotação(ões) suas e {m.fontes_total} material(is) enviado(s).
          Não dá para desfazer pelo HUD.
        </p>
        <Input rotulo="Para confirmar, digite o nome da matéria" placeholder={m.titulo} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoFocus />
      </form>
    </Modal>
  )
}

function LinhaTopico({ materia, t }: { materia: string; t: Topico }) {
  return (
    <li>
      <Link
        to={urlTopico(materia, t.nota)}
        className={cn('flex flex-col gap-1 rounded-controle px-4 py-3 shadow-relevo-sm transition-shadow hover:shadow-relevo active:shadow-cavado-sm', foco)}
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 font-semibold">{t.titulo}</span>
          <span className="flex items-center gap-3 text-xs text-tinta-suave">
            {(t.anotacoes ?? 0) > 0 && (
              <span className="flex items-center gap-1" title="suas anotações">
                <NotebookPen className="size-3.5" aria-hidden /> {t.anotacoes}
              </span>
            )}
            <span>{palavras(t.palavras)}</span>
          </span>
        </span>
        {t.resumo && <span className="line-clamp-2 text-sm text-tinta-suave">{t.resumo}</span>}
      </Link>
    </li>
  )
}

export function MateriaTela() {
  const { materia = '' } = useParams()
  const { data: m, isPending, error } = useMateria(materia)
  const { gerar, pendente } = useGerar()
  const [novoTopico, setNovoTopico] = useState<string | null>(null)
  const [material, setMaterial] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [excluir, setExcluir] = useState(false)

  if (isPending) return <p className="text-tinta-suave">carregando…</p>
  if (error || !m) return <EmptyState icone={<BookOpen />} cor="terracota" titulo="Matéria não encontrada" descricao={error?.message} acao={<Voltar para="/estudos" texto="Estudos" />} />

  return (
    <div className="flex flex-col gap-6">
      <Voltar para="/estudos" texto="Estudos" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{m.titulo}</h1>
          <p className="mt-1 text-tinta-suave">
            {m.topicos_total} tópico(s) · {palavras(m.topicos.reduce((n, t) => n + t.palavras, 0))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="fantasma" className="hover:text-erro" onClick={() => setExcluir(true)} title="Apagar a matéria com todos os tópicos, anotações e material">
            <Trash2 className="size-4" aria-hidden /> Excluir
          </Button>
          <Button variante="fantasma" onClick={() => setMaterial(true)} title="Mandar documentos ou texto para o Gandalf estruturar">
            <Upload className="size-4" aria-hidden /> Enviar material
          </Button>
          {m.topicos.length > 0 && (
            <Button onClick={() => setQuiz(true)} title="Perguntas de tópicos variados da matéria">
              <CircleHelp className="size-4" aria-hidden /> Gerar quiz
            </Button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          titulo="Tópicos"
          icone={<Layers />}
          cor="sakura"
          acoes={
            <Button variante="fantasma" tamanho="sm" onClick={() => setNovoTopico('')}>
              <Plus className="size-3.5" aria-hidden /> Tópico
            </Button>
          }
        >
          {m.topicos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Ainda sem tópicos. Peça um tópico novo ou envie material.</p>
          ) : (
            <ol className="animar-cascata flex flex-col gap-2">
              {m.topicos.map((t) => (
                <LinhaTopico key={t.nota} materia={materia} t={t} />
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-6">
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
            <Card titulo="Mapa da matéria" subtitulo="_index.md" icone={<Sparkles />} cor="ocre">
              <details className="group">
                <summary className={cn('cursor-pointer text-sm font-semibold text-musgo-texto', foco)}>Ver objetivo e conteúdo</summary>
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
            <Wand2 className="size-4" aria-hidden /> Gerar tópico
          </Button>
        }
      >
        <Textarea rotulo="Sobre o que é o tópico?" placeholder="Ex.: prompt caching e quando usar" value={novoTopico ?? ''} onChange={(e) => setNovoTopico(e.target.value)} />
      </Modal>
      <EnviarMaterial materia={materia} aberto={material} onClose={() => setMaterial(false)} />
      <GerarQuiz materia={materia} aberto={quiz} onClose={() => setQuiz(false)} />
      <ExcluirMateria m={m} aberto={excluir} onClose={() => setExcluir(false)} />
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
  const { gerar, pendente } = useGerar()
  const navigate = useNavigate()
  const [material, setMaterial] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [aprofundar, setAprofundar] = useState<string | null>(null)
  const t = m?.topicos.find((x) => x.nota === nota)
  const titulo = t?.titulo ?? nota.split('/').pop()?.replace('.md', '') ?? ''
  const indice = m?.topicos.findIndex((x) => x.nota === nota) ?? -1
  const anterior = indice > 0 ? m?.topicos[indice - 1] : undefined
  const seguinte = indice >= 0 ? m?.topicos[indice + 1] : undefined

  return (
    <div className="flex flex-col gap-6">
      <Voltar para={urlMateria(materia)} texto={m?.titulo ?? 'Matéria'} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
          {t && (
            <p className="mt-2 text-sm text-tinta-suave">
              {palavras(t.palavras)}
              {anotacoes.length > 0 && ` · ${anotacoes.length} anotação(ões) suas`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="fantasma" onClick={() => setMaterial(true)} title="Mandar documentos ou texto sobre este tópico">
            <Upload className="size-4" aria-hidden /> Material
          </Button>
          <Button variante="fantasma" onClick={() => pomodoro.focar(`${titulo}${m ? ` (${m.titulo})` : ''}`)} title="Começar um foco de pomodoro neste tópico">
            <Timer className="size-4" aria-hidden /> Foco
          </Button>
          <Button variante="secundario" onClick={() => setAprofundar('')} title="Pedir ao Gandalf para expandir este tópico">
            <Wand2 className="size-4" aria-hidden /> Aprofundar
          </Button>
          <Button onClick={() => setQuiz(true)} title="Perguntas sobre este tópico">
            <CircleHelp className="size-4" aria-hidden /> Gerar quiz
          </Button>
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
          {(anterior || seguinte) && (
            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-sombra/40 pt-4">
              {anterior ? (
                <Button variante="fantasma" tamanho="sm" onClick={() => navigate(urlTopico(materia, anterior.nota))}>
                  ← {anterior.titulo}
                </Button>
              ) : (
                <span />
              )}
              {seguinte && (
                <Button variante="secundario" tamanho="sm" onClick={() => navigate(urlTopico(materia, seguinte.nota))}>
                  {seguinte.titulo} →
                </Button>
              )}
            </div>
          )}
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
      <GerarQuiz materia={materia} topico={nota} tituloTopico={titulo} aberto={quiz} onClose={() => setQuiz(false)} />
      <Modal
        aberto={aprofundar !== null}
        onClose={() => setAprofundar(null)}
        titulo={`Aprofundar: ${titulo}`}
        icone={<Wand2 />}
        cor="sakura"
        rodape={
          <>
            <Button variante="fantasma" onClick={() => setAprofundar(null)}>
              Cancelar
            </Button>
            <Button disabled={pendente} onClick={() => gerar({ pedido: aprofundar ?? '', tipo: 'aprofundar', nota }, () => setAprofundar(null))}>
              <Wand2 className="size-4" aria-hidden /> Aprofundar tópico
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Textarea
            rotulo="Algum foco? (opcional)"
            placeholder="Ex.: mais exemplos práticos; explicar melhor a parte de X; comparar com Y…"
            value={aprofundar ?? ''}
            onChange={(e) => setAprofundar(e.target.value)}
          />
          <p className="text-xs text-tinta-suave">
            O Gandalf expande a nota com explicações, exemplos e armadilhas, usando suas anotações e o material enviado, sem perder o que já está nela. Leva alguns minutos e usa a sua cota do Claude.
          </p>
        </div>
      </Modal>
    </div>
  )
}

// ---------- quiz (efêmero) ----------

const VEREDITO: Record<Veredito, { cor: Cor; texto: string; pontos: number }> = {
  certo: { cor: 'musgo', texto: 'Acertou', pontos: 1 },
  parcial: { cor: 'ocre', texto: 'Quase', pontos: 0.5 },
  errado: { cor: 'terracota', texto: 'Errou', pontos: 0 },
}
const LETRAS = 'ABCDEF'

type Resultado = { resposta: string; veredito: Veredito; correcao?: CorrecaoQuiz; salva?: boolean }

/** Texto da anotação gerada por "Salvar como nota". */
function notaDaQuestao(p: PerguntaQuiz, r: Resultado): string {
  const partes = [`**Pergunta:** ${p.pergunta}`]
  if (p.opcoes) partes.push(p.opcoes.map((o, i) => `- ${LETRAS[i]}) ${i === p.correta ? `**${o}** ✓` : o}`).join('\n'))
  partes.push(`**Minha resposta:** ${r.resposta || '(em branco)'} (${VEREDITO[r.veredito].texto.toLowerCase()})`)
  partes.push(`**Resposta certa:** ${p.opcoes && p.correta !== null ? `${LETRAS[p.correta]}) ${p.opcoes[p.correta]}` : p.resposta}`)
  if (r.correcao?.comentario) partes.push(r.correcao.comentario)
  const extra = r.correcao?.complemento || p.explicacao
  if (extra) partes.push(extra)
  return partes.join('\n\n')
}

function PerguntaAtual({
  p,
  materia,
  resultado,
  onResultado,
}: {
  p: PerguntaQuiz
  materia: string
  resultado: Resultado | undefined
  onResultado: (r: Resultado) => void
}) {
  const corrigir = useCorrigirQuiz(materia)
  const toast = useToast()
  const [escolha, setEscolha] = useState<number | null>(null)
  const [texto, setTexto] = useState('')

  function responder(e?: FormEvent) {
    e?.preventDefault()
    if (resultado) return
    if (p.opcoes) {
      if (escolha === null) return
      onResultado({ resposta: `${LETRAS[escolha]}) ${p.opcoes[escolha]}`, veredito: escolha === p.correta ? 'certo' : 'errado' })
      return
    }
    if (!texto.trim()) return
    corrigir.mutate(
      { pergunta: p.pergunta, resposta_modelo: p.resposta, resposta: texto, topico: p.topico },
      { onSuccess: (c) => onResultado({ resposta: texto.trim(), veredito: c.veredito, correcao: c }), onError: (err) => toast('erro', err.message) },
    )
  }

  return (
    <form onSubmit={responder} className="flex flex-col gap-5">
      <p className="font-titulo text-2xl leading-snug">{p.pergunta}</p>
      {p.opcoes ? (
        <div role="radiogroup" aria-label="Opções" className="flex flex-col gap-2">
          {p.opcoes.map((o, i) => {
            const certa = resultado && i === p.correta
            const errada = resultado && i === escolha && i !== p.correta
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={escolha === i}
                disabled={!!resultado}
                onClick={() => setEscolha(i)}
                className={cn(
                  'flex items-start gap-3 rounded-controle px-4 py-3 text-left transition-shadow disabled:cursor-default',
                  escolha === i || certa ? 'shadow-cavado-sm' : 'shadow-relevo-sm hover:shadow-relevo',
                  certa && 'text-musgo-texto',
                  errada && 'text-erro',
                  foco,
                )}
              >
                <span className="w-5 shrink-0 font-semibold">{LETRAS[i]})</span>
                <span className="min-w-0 flex-1">{o}</span>
                {certa && <Check className="size-4 shrink-0" aria-label="correta" />}
                {errada && <X className="size-4 shrink-0" aria-label="sua resposta" />}
              </button>
            )
          })}
        </div>
      ) : (
        <textarea
          aria-label="Sua resposta"
          placeholder="Escreva sua resposta com suas palavras… (Ctrl+Enter envia)"
          value={texto}
          disabled={!!resultado || corrigir.isPending}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) responder()
          }}
          className={cn(cavado, 'min-h-32 w-full resize-y rounded-controle px-4 py-3 placeholder:text-tinta-suave/70 disabled:opacity-80', foco)}
        />
      )}
      {!resultado && (
        <Button type="submit" className="self-end" disabled={p.opcoes ? escolha === null : !texto.trim() || corrigir.isPending}>
          {corrigir.isPending ? 'O Gandalf está corrigindo…' : 'Responder'}
        </Button>
      )}
    </form>
  )
}

function Feedback({ p, r }: { p: PerguntaQuiz; r: Resultado }) {
  const v = VEREDITO[r.veredito]
  const extra = r.correcao?.complemento || p.explicacao
  return (
    <div className="animar-entrada flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge cor={v.cor}>{v.texto}</Badge>
        {r.correcao?.comentario && <span className="text-sm">{r.correcao.comentario}</span>}
      </div>
      <div className="flex flex-col gap-2 rounded-controle p-4 shadow-cavado-sm">
        <p className="text-sm">
          <span className="font-semibold">Resposta certa: </span>
          {p.opcoes && p.correta !== null ? `${LETRAS[p.correta]}) ${p.opcoes[p.correta]}` : p.resposta}
        </p>
        {extra && <Markdown texto={extra} className="text-sm" />}
      </div>
    </div>
  )
}

/** Cada navegação (inclusive "Novo quiz" na mesma URL) começa um quiz do zero. */
export function QuizTela() {
  return <QuizSessao key={useLocation().key} />
}

function QuizSessao() {
  const { materia = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const topico = params.get('topico')
  const tipo: TipoQuiz = params.get('tipo') === 'texto' ? 'texto' : 'multipla'
  const quantidade = Math.min(MAX_PERGUNTAS_QUIZ, Math.max(1, Number(params.get('n')) || 5))
  // location.key muda a cada navegação: "Novo quiz" gera outro em vez de reaproveitar o anterior
  const { data: quiz, isPending, error, refetch, isFetching } = useQuiz(materia, { quantidade, tipo, topico }, location.key)
  const { data: m } = useMateria(materia)
  const salvar = useSalvarAnotacao(materia)
  const [i, setI] = useState(0)
  const [resultados, setResultados] = useState<Record<number, Resultado>>({})

  const perguntas = quiz?.perguntas ?? []
  const atual = perguntas[i]
  const r = resultados[i]
  const fim = perguntas.length > 0 && i >= perguntas.length
  const tituloTopico = topico ? (m?.topicos.find((t) => t.nota === topico)?.titulo ?? quiz?.perguntas[0]?.titulo_topico) : null
  const pontos = Object.values(resultados).reduce((n, x) => n + VEREDITO[x.veredito].pontos, 0)
  const voltar = topico ? urlTopico(materia, topico) : urlMateria(materia)

  function salvarComoNota() {
    if (!atual || !r || r.salva) return
    salvar.mutate(
      { titulo: `Quiz: ${atual.pergunta.length > 110 ? atual.pergunta.slice(0, 109) + '…' : atual.pergunta}`, texto: notaDaQuestao(atual, r), topico: atual.topico, origem: 'quiz' },
      {
        onSuccess: () => {
          setResultados((x) => ({ ...x, [i]: { ...r, salva: true } }))
          toast('sucesso', atual.topico ? 'Questão salva nas anotações do tópico' : 'Questão salva nas anotações da matéria')
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Voltar para={voltar} texto={tituloTopico ?? m?.titulo ?? 'Matéria'} />
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Quiz{tituloTopico ? `: ${tituloTopico}` : m ? `: ${m.titulo}` : ''}</h1>
        <p className="mt-1 text-tinta-suave">
          {TIPOS.find((t) => t.tipo === tipo)?.texto}
          {perguntas.length > 0 && !fim && ` · pergunta ${i + 1} de ${perguntas.length}`}
          {atual && !topico && atual.titulo_topico && ` · ${atual.titulo_topico}`}
        </p>
      </header>
      {perguntas.length > 0 && <ProgressBar rotulo="Andamento do quiz" valor={Math.min(i + (r ? 1 : 0), perguntas.length)} max={perguntas.length} cor="sakura" mostrarValor={false} />}

      {isPending || (isFetching && !quiz) ? (
        <Card className="min-h-48 items-center justify-center">
          <Sparkles className="size-6 animate-pulse text-sakura" aria-hidden />
          <p className="text-tinta-suave">O Gandalf está preparando {quantidade} pergunta(s)…</p>
        </Card>
      ) : error ? (
        <EmptyState
          icone={<CircleHelp />}
          cor="terracota"
          titulo="Não deu para gerar o quiz"
          descricao={error.message}
          acao={<Button onClick={() => refetch()}><RotateCcw className="size-4" aria-hidden /> Tentar de novo</Button>}
        />
      ) : fim ? (
        <Card titulo="Fim do quiz" subtitulo={`${pontos.toLocaleString('pt-BR')} de ${perguntas.length} ponto(s)`} icone={<Sparkles />} cor="ocre" className="animar-surgir">
          <ol className="flex flex-col gap-2 text-sm">
            {perguntas.map((p, k) => {
              const x = resultados[k]
              return (
                <li key={k} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">{k + 1}. {p.pergunta}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {x?.salva && <BookmarkCheck className="size-4 text-tinta-suave" aria-label="salva como nota" />}
                    {x && <Badge cor={VEREDITO[x.veredito].cor}>{VEREDITO[x.veredito].texto}</Badge>}
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-tinta-suave">Este quiz não fica salvo. As questões que você salvou estão nas suas anotações.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variante="fantasma" onClick={() => navigate(voltar)}>
              Voltar
            </Button>
            <Button onClick={() => navigate(urlQuiz(materia, { quantidade, tipo, topico }), { replace: true })}>
              <RotateCcw className="size-4" aria-hidden /> Novo quiz
            </Button>
          </div>
        </Card>
      ) : (
        atual && (
          <Card key={i} className="animar-surgir gap-5">
            <PerguntaAtual p={atual} materia={materia} resultado={r} onResultado={(x) => setResultados((y) => ({ ...y, [i]: x }))} />
            {r && (
              <>
                <Feedback p={atual} r={r} />
                <div className="flex flex-wrap justify-between gap-2 border-t border-sombra/40 pt-4">
                  <Button variante="fantasma" tamanho="sm" onClick={salvarComoNota} disabled={r.salva || salvar.isPending}>
                    {r.salva ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
                    {r.salva ? 'Salva nas anotações' : 'Salvar questão como nota'}
                  </Button>
                  <Button tamanho="sm" onClick={() => setI((x) => x + 1)} autoFocus>
                    {i + 1 < perguntas.length ? (
                      <>
                        Próxima <ArrowRight className="size-3.5" aria-hidden />
                      </>
                    ) : (
                      <>
                        <ListOrdered className="size-3.5" aria-hidden /> Ver resultado
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
