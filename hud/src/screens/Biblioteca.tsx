import { ArrowLeft, BookMarked, Compass, FileText, Globe, ListChecks, Map as Mapa, MessageCircleQuestion, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChatThread } from '../components/ChatThread'
import { Markdown } from '../components/Markdown'
import { Badge, BentoGrid, BentoItem, Button, Card, EmptyState, Modal, Tabs, Textarea, useToast } from '../components/ui'
import { foco } from '../components/ui/styles'
import type { TemaBiblioteca } from '../lib/api'
import { cn } from '../lib/cn'
import { ddmm } from '../lib/datas'
import { useBiblioteca, useNota, useNovaPesquisa, useTarefasDoChecklist, useTemaBiblioteca } from '../lib/queries'

const url = (slug: string, nota?: string) => `/biblioteca/${encodeURIComponent(slug)}${nota ? `?parte=${encodeURIComponent(nota)}` : ''}`

/** Modal de pesquisa: nova (tema livre) ou atualização de um tema guardado. Só web, sem vault. */
function ModalPesquisa({ aberto, onClose, atualizar, titulo }: { aberto: boolean; onClose: () => void; atualizar?: string; titulo?: string }) {
  const pesquisar = useNovaPesquisa()
  const toast = useToast()
  const navigate = useNavigate()
  const [pedido, setPedido] = useState('')
  const [tipo, setTipo] = useState<'pesquisa' | 'plano'>('pesquisa')

  function enviar() {
    if (!pedido.trim()) return
    pesquisar.mutate(
      { pedido: pedido.trim(), tipo, atualizar },
      {
        onSuccess: (s) => {
          setPedido('')
          onClose()
          toast('info', 'Pesquisando na web… o resultado aparece em "Resumos de hoje" para você guardar.')
          navigate(`/terminais?sessao=${s.id}`)
        },
        onError: (e) => toast('erro', e.message),
      },
    )
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo={atualizar ? `Atualizar: ${titulo}` : 'Nova pesquisa'}
      icone={<Globe />}
      cor="ardosia"
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!pedido.trim() || pesquisar.isPending}>
            <Globe className="size-4" aria-hidden /> Pesquisar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!atualizar && (
          <Tabs
            rotulo="Tipo"
            valor={tipo}
            onChange={(v) => setTipo(v as 'pesquisa' | 'plano')}
            itens={[
              { id: 'pesquisa', label: 'Pesquisa' },
              { id: 'plano', label: 'Plano (viagem, mudança…)' },
            ]}
          />
        )}
        <Textarea
          rotulo={atualizar ? 'O que atualizar ou acrescentar?' : 'O que você quer saber?'}
          placeholder={atualizar ? 'Ex.: acrescentar um dia em Nara; conferir se a taxa do visto mudou' : 'Ex.: tudo que eu preciso saber para me mudar para o Canadá como desenvolvedor'}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
        />
        <p className="text-xs text-tinta-suave">
          A pesquisa roda só com acesso à web (sem ver o seu vault). O resultado volta para você decidir se guarda. Usa a sua cota do Claude.
        </p>
      </div>
    </Modal>
  )
}

function CartaoTema({ t }: { t: TemaBiblioteca }) {
  return (
    <Link to={url(t.slug)} className={cn('block h-full rounded-card', foco)}>
      <Card
        className="h-full transition-shadow hover:shadow-relevo-lg"
        titulo={t.titulo}
        subtitulo={`${t.partes} parte(s)${t.atualizado ? ` · atualizado ${ddmm(t.atualizado)}` : ''}`}
        icone={t.tipo === 'plano' ? <Mapa /> : <Compass />}
        cor={t.tipo === 'plano' ? 'ocre' : 'ardosia'}
        acoes={<Badge cor={t.tipo === 'plano' ? 'ocre' : 'ardosia'}>{t.tipo}</Badge>}
      >
        {t.resumo && <p className="line-clamp-3 text-sm text-tinta-suave">{t.resumo}</p>}
      </Card>
    </Link>
  )
}

export function Biblioteca() {
  const { data: temas = [], isPending, error } = useBiblioteca()
  const [pesquisando, setPesquisando] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="mt-1 text-tinta-suave">Pesquisas e planos que você guardou, organizados por tema.</p>
        </div>
        <Button onClick={() => setPesquisando(true)}>
          <Plus className="size-4" aria-hidden /> Nova pesquisa
        </Button>
      </header>
      {isPending ? (
        <p className="text-tinta-suave">carregando…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-erro">{error.message}</p>
      ) : temas.length === 0 ? (
        <EmptyState
          icone={<BookMarked />}
          cor="ardosia"
          titulo="Nada guardado ainda"
          descricao="Pergunte ao Gandalf algo que precise de pesquisa (“quero me mudar para o Canadá, o que preciso saber?”, “monte um plano de viagem para o Japão”) e toque em “Guardar no vault”."
          acao={<Button onClick={() => setPesquisando(true)}><Plus className="size-4" aria-hidden /> Nova pesquisa</Button>}
        />
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {temas.map((t) => (
            <BentoItem key={t.slug}>
              <CartaoTema t={t} />
            </BentoItem>
          ))}
        </BentoGrid>
      )}
      <ModalPesquisa aberto={pesquisando} onClose={() => setPesquisando(false)} />
    </div>
  )
}

export function TemaBibliotecaTela() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: t, isPending, error } = useTemaBiblioteca(slug)
  const tarefas = useTarefasDoChecklist(slug)
  const toast = useToast()
  const [atualizando, setAtualizando] = useState(false)
  const parte = params.get('parte') ?? t?.indice ?? null
  const { data: nota, isPending: carregandoNota } = useNota(parte)

  if (isPending) return <p className="text-tinta-suave">carregando…</p>
  if (error || !t)
    return <EmptyState icone={<BookMarked />} cor="terracota" titulo="Tema não encontrado" descricao={error?.message} />

  const partes = [...(t.indice ? [{ nota: t.indice, titulo: 'Visão geral' }] : []), ...t.lista_partes]

  return (
    <div className="flex flex-col gap-6">
      <Link to="/biblioteca" className={cn('inline-flex items-center gap-1.5 self-start rounded-pilula text-sm font-semibold text-tinta-suave hover:text-tinta', foco)}>
        <ArrowLeft className="size-4" aria-hidden /> Biblioteca
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{t.titulo}</h1>
          <p className="mt-1 text-tinta-suave">
            {t.tipo === 'plano' ? 'Plano' : 'Pesquisa'} · {t.partes} parte(s){t.atualizado && ` · atualizado ${ddmm(t.atualizado)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.tem_checklist && (
            <Button
              variante="secundario"
              disabled={tarefas.isPending}
              onClick={() =>
                tarefas.mutate(undefined, {
                  onSuccess: (r) => toast('sucesso', r.criadas.length ? `${r.criadas.length} tarefa(s) criada(s) do checklist` : 'O checklist já está nas suas tarefas'),
                  onError: (e) => toast('erro', e.message),
                })
              }
            >
              <ListChecks className="size-4" aria-hidden /> Checklist → tarefas
            </Button>
          )}
          <Button onClick={() => setAtualizando(true)}>
            <RefreshCw className="size-4" aria-hidden /> Atualizar pesquisa
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <nav aria-label="Partes" className="flex flex-col gap-1.5">
          {partes.map((p) => {
            const ativa = p.nota === parte
            return (
              <button
                key={p.nota}
                type="button"
                onClick={() => setParams({ parte: p.nota }, { replace: true })}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-controle px-3 py-2 text-left text-sm font-semibold transition-shadow',
                  foco,
                  ativa ? 'text-musgo-texto shadow-cavado-sm' : 'text-tinta-suave shadow-relevo-sm hover:text-tinta',
                )}
              >
                <FileText className="size-4 shrink-0" aria-hidden /> {p.titulo}
              </button>
            )
          })}
        </nav>
        <Card key={parte ?? ''} className="animar-entrada">
          {carregandoNota ? <p className="text-tinta-suave">carregando…</p> : <Markdown texto={nota?.texto ?? ''} />}
        </Card>
        <Card titulo="Perguntas" subtitulo="sobre a parte aberta" icone={<MessageCircleQuestion />} cor="musgo">
          {parte && <ChatThread key={parte} nota={parte} soNovas altura="max-h-[45vh]" placeholder="Pergunte sobre este tema…" />}
        </Card>
      </div>
      <ModalPesquisa aberto={atualizando} onClose={() => setAtualizando(false)} atualizar={slug} titulo={t.titulo} />
    </div>
  )
}
