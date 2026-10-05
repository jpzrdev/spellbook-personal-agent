import { BellRing, Clock, Cog, History, MoreHorizontal, Pencil, Play, Plus, Repeat, Trash2, Wand2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  Badge,
  Button,
  Card,
  Dropdown,
  EmptyState,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toggle,
  useToast,
  type Cor,
} from '../components/ui'
import { foco } from '../components/ui/styles'
import type { Execucao, Rotina } from '../lib/api'
import { cn } from '../lib/cn'
import {
  useAcoesInternas,
  useCriarRotina,
  useEditarRotina,
  useRemoverRotina,
  useRodarRotina,
  useRotinas,
  useSkills,
} from '../lib/queries'
import { lerCron, montarCron, quandoRelativo, type Dias } from '../lib/tempo'

const STATUS: Record<string, { cor: Cor; texto: string }> = {
  ok: { cor: 'musgo', texto: 'ok' },
  erro: { cor: 'terracota', texto: 'erro' },
  rodando: { cor: 'ocre', texto: 'rodando' },
  fila: { cor: 'ardosia', texto: 'na fila' },
  cancelada: { cor: 'madeira', texto: 'cancelada' },
  tempo_esgotado: { cor: 'terracota', texto: 'tempo esgotado' },
}

function Historico({ itens }: { itens: Execucao[] }) {
  if (itens.length === 0) return <p className="text-xs text-tinta-suave">Ainda não rodou.</p>
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Últimas execuções">
      {itens.slice(0, 5).map((e, i) => {
        const st = STATUS[e.status] ?? { cor: 'ardosia' as Cor, texto: e.status }
        return (
          <li key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-tinta-suave tabular-nums">{quandoRelativo(e.quando)}</span>
            <Badge cor={st.cor}>{st.texto}</Badge>
          </li>
        )
      })}
    </ul>
  )
}

function CartaoRotina({ r, onExcluir, onEditar }: { r: Rotina; onExcluir: () => void; onEditar: () => void }) {
  const editar = useEditarRotina()
  const rodar = useRodarRotina()
  const toast = useToast()
  const navigate = useNavigate()
  const [verHistorico, setVerHistorico] = useState(false)
  const ultima = r.historico[0]

  function rodarAgora() {
    rodar.mutate(r.slug, {
      onSuccess: (res) => {
        if (res.sessao_id) {
          toast('sucesso', `${r.nome}: sessão iniciada`)
          navigate(`/terminais?sessao=${res.sessao_id}`)
        } else toast(res.status === 'ok' ? 'sucesso' : 'erro', `${r.nome}: ${res.resposta?.split('\n')[0] ?? res.status}`)
      },
      onError: (err) => toast('erro', err.message),
    })
  }

  return (
    <Card
      className={cn('h-full', !r.ativa && 'opacity-80')}
      titulo={r.nome}
      subtitulo={r.quando}
      icone={r.tier === 3 ? <Wand2 /> : <Cog />}
      cor={r.tier === 3 ? 'madeira' : 'musgo'}
      acoes={
        <Toggle
          ligado={r.ativa}
          rotulo={`Rotina ${r.nome} ${r.ativa ? 'ativa' : 'pausada'}`}
          onChange={(ativa) =>
            editar.mutate({ slug: r.slug, ativa }, { onError: (err) => toast('erro', `Não salvou: ${err.message}`) })
          }
        />
      }
    >
      {r.descricao && <p className="line-clamp-3 text-sm text-tinta-suave">{r.descricao}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Badge cor={r.tier === 3 ? 'madeira' : 'musgo-claro'}>
          {r.tier === 3 ? (r.skill ? `Claude Code · /${r.skill}` : 'Claude Code') : `interna · ${r.acao}`}
        </Badge>
        {r.saida === 'efemera' && <Badge cor="ardosia">efêmera</Badge>}
        {r.notificar && (
          <Badge cor="sakura">
            <BellRing className="size-3" aria-hidden /> avisa
          </Badge>
        )}
        {r.proxima && (
          <span className="flex items-center gap-1 text-xs text-tinta-suave">
            <Clock className="size-3.5" aria-hidden /> próxima: {quandoRelativo(r.proxima)}
          </span>
        )}
        {ultima && (
          <span className="flex items-center gap-1 text-xs text-tinta-suave">
            última: <Badge cor={(STATUS[ultima.status] ?? STATUS.ok).cor}>{(STATUS[ultima.status] ?? { texto: ultima.status }).texto}</Badge>
          </span>
        )}
      </div>
      {verHistorico && <Historico itens={r.historico} />}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={verHistorico}
          onClick={() => setVerHistorico((v) => !v)}
          className={cn('flex cursor-pointer items-center gap-1.5 rounded-pilula px-3 py-1 text-xs font-semibold text-tinta-suave shadow-relevo-sm hover:text-tinta active:shadow-cavado-sm', foco)}
        >
          <History className="size-3.5" aria-hidden /> Histórico
        </button>
        <div className="flex items-center gap-2">
          <Dropdown
            rotulo={
              <>
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">Mais ações de {r.nome}</span>
              </>
            }
            variante="fantasma"
            alinhar="direita"
            itens={[
              { id: 'editar', label: 'Editar', icone: <Pencil className="size-4" />, onSelect: onEditar },
              { id: 'excluir', label: 'Excluir', icone: <Trash2 className="size-4" />, perigo: true, onSelect: onExcluir },
            ]}
          />
          <Button tamanho="sm" onClick={rodarAgora} disabled={rodar.isPending}>
            <Play className="size-3.5" aria-hidden /> Rodar agora
          </Button>
        </div>
      </div>
    </Card>
  )
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Criar (sem `rotina`) ou editar uma rotina existente. */
function FormRotina({ aberto, onClose, rotina }: { aberto: boolean; onClose: () => void; rotina?: Rotina }) {
  const criar = useCriarRotina()
  const editar = useEditarRotina()
  const simples = rotina ? lerCron(rotina.cron) : null
  const { data: skills = [] } = useSkills()
  const { data: acoes = [] } = useAcoesInternas()
  const toast = useToast()
  const [nome, setNome] = useState(rotina?.nome ?? '')
  const [tipo, setTipo] = useState<'3' | '1'>(rotina?.tier === 1 ? '1' : '3')
  const [skill, setSkill] = useState(rotina?.skill ?? '')
  const [acao, setAcao] = useState(rotina?.acao ?? '')
  const [hora, setHora] = useState(simples?.hora ?? '07:00')
  const [dias, setDias] = useState<Dias>(simples?.dias ?? 'todo')
  const [custom, setCustom] = useState<number[]>(simples?.custom ?? [1, 3, 5])
  const [avancado, setAvancado] = useState(!!rotina && !simples)
  const [cronManual, setCronManual] = useState(rotina?.cron ?? '')
  const [descricao, setDescricao] = useState(rotina?.descricao ?? '')
  const [saida, setSaida] = useState<'vault' | 'efemera'>(rotina?.saida ?? 'vault')
  const [notificar, setNotificar] = useState(rotina?.notificar ?? false)
  const [erro, setErro] = useState<string | null>(null)

  const cron = avancado ? cronManual : montarCron(hora, dias, custom)
  const acaoEscolhida = acao || acoes[0]?.nome || ''

  function limpar() {
    setNome('')
    setDescricao('')
    setErro(null)
    setAvancado(false)
  }

  function salvar(e?: FormEvent) {
    e?.preventDefault()
    setErro(null)
    const campos = {
      nome: nome.trim(),
      cron,
      skill: tipo === '3' ? skill || null : null,
      acao: tipo === '1' ? acaoEscolhida : null,
      descricao,
      saida,
      notificar,
    }
    if (rotina) {
      editar.mutate(
        { slug: rotina.slug, ...campos },
        {
          onSuccess: (r) => {
            toast('sucesso', `Rotina salva: ${r.nome} (${r.quando})`)
            onClose()
          },
          onError: (err) => setErro(err.message),
        },
      )
      return
    }
    criar.mutate(
      { ...campos, tier: tipo === '3' ? 3 : 1, ativa: true },
      {
        onSuccess: (r) => {
          toast('sucesso', `Rotina criada: ${r.nome} (${r.quando})`)
          limpar()
          onClose()
        },
        onError: (err) => setErro(err.message),
      },
    )
  }

  return (
    <Modal
      aberto={aberto}
      onClose={onClose}
      titulo={rotina ? `Editar: ${rotina.nome}` : 'Nova rotina'}
      icone={<Repeat />}
      rodape={
        <>
          <Button variante="fantasma" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => salvar()} disabled={!nome.trim() || !cron.trim() || criar.isPending || editar.isPending}>
            {rotina ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form onSubmit={salvar} className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-1">
        <Input rotulo="Nome" placeholder="Ex.: Revisão de Cálculo" value={nome} onChange={(e) => setNome(e.target.value)} />
        <div className={cn('flex flex-col gap-2', rotina && 'hidden')}>
          <span className="text-sm font-semibold">Tipo</span>
          <Tabs
            rotulo="Tipo de rotina"
            valor={tipo}
            onChange={(v) => setTipo(v as '3' | '1')}
            itens={[
              { id: '3', label: 'Claude Code (IA)' },
              { id: '1', label: 'Interna (sem IA)' },
            ]}
          />
        </div>
        {tipo === '3' ? (
          <Select
            rotulo="Skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            opcoes={[{ valor: '', texto: 'Nenhuma: a descrição vira a tarefa' }, ...skills.map((s) => ({ valor: s.nome, texto: `/${s.nome}` }))]}
          />
        ) : (
          <Select
            rotulo="Ação"
            value={acaoEscolhida}
            onChange={(e) => setAcao(e.target.value)}
            opcoes={acoes.map((a) => ({ valor: a.nome, texto: `${a.nome}: ${a.descricao}` }))}
          />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Quando</span>
          {!avancado ? (
            <>
              <Tabs
                rotulo="Dias"
                valor={dias}
                onChange={(v) => setDias(v as Dias)}
                itens={[
                  { id: 'todo', label: 'Todo dia' },
                  { id: 'uteis', label: 'Seg–sex' },
                  { id: 'fds', label: 'Fim de semana' },
                  { id: 'custom', label: 'Escolher' },
                ]}
              />
              {dias === 'custom' && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                  {DIAS_SEMANA.map((d, i) => {
                    const marcado = custom.includes(i)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={marcado}
                        onClick={() => setCustom((c) => (marcado ? c.filter((x) => x !== i) : [...c, i]))}
                        className={cn(
                          'w-12 cursor-pointer rounded-pilula py-1 text-sm font-semibold',
                          foco,
                          marcado ? 'text-musgo-texto shadow-cavado-sm' : 'text-tinta-suave shadow-relevo-sm',
                        )}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              )}
              <Input rotulo="Horário" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="max-w-40" />
            </>
          ) : (
            <Input
              rotulo="Expressão cron"
              placeholder="minuto hora dia mês dia-da-semana"
              value={cronManual}
              onChange={(e) => setCronManual(e.target.value)}
              dica="Ex.: 0 7-22/2 * * * (a cada 2h, das 7h às 22h). 0 = domingo."
            />
          )}
          <button
            type="button"
            onClick={() => {
              if (!avancado) setCronManual(cron)
              setAvancado((a) => !a)
            }}
            className={cn('self-start rounded-pilula px-2 py-1 text-xs font-semibold text-musgo-texto', foco)}
          >
            {avancado ? 'voltar ao modo simples' : `modo avançado (cron: ${cron})`}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Saída</span>
          <Tabs
            rotulo="Onde fica o resultado"
            valor={saida}
            onChange={(v) => setSaida(v as 'vault' | 'efemera')}
            itens={[
              { id: 'vault', label: 'Guardar no vault' },
              { id: 'efemera', label: 'Efêmera (só no HUD)' },
            ]}
          />
          <p className="text-xs text-tinta-suave">
            {saida === 'efemera'
              ? 'O resultado aparece em "Resumos de hoje" por 48 h e não vai para o vault nem para o git. O Claude Code roda só com leitura.'
              : 'O resultado e os arquivos criados ficam no vault (com recibo completo).'}
          </p>
        </div>
        <Toggle
          ligado={notificar}
          onChange={setNotificar}
          mostrarRotulo
          rotulo="Avisar no celular quando terminar (falhas sempre avisam)"
        />
        <Textarea
          rotulo="Descrição"
          placeholder={tipo === '3' ? 'O que o Claude Code deve fazer nesta rotina' : 'Para que serve esta rotina'}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        {erro && (
          <p role="alert" className="text-sm font-semibold text-erro">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  )
}

export function Rotinas() {
  const { data: rotinas = [], isPending, error } = useRotinas()
  const remover = useRemoverRotina()
  const toast = useToast()
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<Rotina | null>(null)
  const [excluir, setExcluir] = useState<Rotina | null>(null)
  const ativas = rotinas.filter((r) => r.ativa).length

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Rotinas</h1>
          <p className="mt-1 text-tinta-suave">
            {ativas} de {rotinas.length} ativas · arquivos em <code className="font-mono text-sm">vida/rotinas/</code> (editar no Obsidian também vale)
          </p>
        </div>
        <Button onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden /> Nova rotina
        </Button>
      </header>

      {isPending ? (
        <p className="text-tinta-suave">carregando…</p>
      ) : error ? (
        <p role="alert" className="font-semibold text-erro">{error.message}</p>
      ) : rotinas.length === 0 ? (
        <EmptyState icone={<Repeat />} titulo="Nenhuma rotina" descricao="Crie uma para o Gandalf trabalhar sozinho no horário certo." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {rotinas.map((r) => (
            <CartaoRotina key={r.slug} r={r} onExcluir={() => setExcluir(r)} onEditar={() => setEditando(r)} />
          ))}
        </div>
      )}

      <FormRotina aberto={criando} onClose={() => setCriando(false)} />
      {editando && <FormRotina key={editando.slug} aberto rotina={editando} onClose={() => setEditando(null)} />}

      <Modal
        aberto={excluir !== null}
        onClose={() => setExcluir(null)}
        titulo="Excluir rotina?"
        icone={<Trash2 />}
        cor="terracota"
        rodape={
          <>
            <Button variante="fantasma" onClick={() => setExcluir(null)}>
              Cancelar
            </Button>
            <Button
              variante="secundario"
              className="text-erro"
              disabled={remover.isPending}
              onClick={() =>
                excluir &&
                remover.mutate(excluir.slug, {
                  onSuccess: () => {
                    toast('sucesso', `Rotina excluída: ${excluir.nome}`)
                    setExcluir(null)
                  },
                  onError: (err) => toast('erro', err.message),
                })
              }
            >
              <Trash2 className="size-4" aria-hidden /> Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm">
          O arquivo <code className="font-mono">vida/rotinas/{excluir?.slug}.md</code> será apagado. Dá para recuperar pelo git do vault.
        </p>
      </Modal>
    </div>
  )
}
