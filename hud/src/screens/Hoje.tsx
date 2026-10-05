import {
  CalendarDays,
  CircleAlert,
  Inbox,
  ListChecks,
  Plus,
  Repeat,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Lembretes } from '../components/Lembretes'
import { Resumos } from '../components/Resumos'
import {
  Badge,
  BentoGrid,
  BentoItem,
  Button,
  Card,
  Checkbox,
  EmptyState,
  IconChip,
  useToast,
  type Cor,
} from '../components/ui'
import { cavado, foco, solido } from '../components/ui/styles'
import type { Evento, Hoje as HojeT, RotinaDoDia, Tarefa } from '../lib/api'
import { cn } from '../lib/cn'
import { ddmm, prazo } from '../lib/datas'
import { useCapturar, useConcluirTarefa, useCriarTarefa, useHoje, useTarefas } from '../lib/queries'

function PrazoBadge({ vence, hoje }: { vence: string | null; hoje: string }) {
  const p = prazo(vence, hoje)
  if (!p || !vence) return null
  if (p === 'atrasada') return <Badge cor="terracota">atrasada · {ddmm(vence)}</Badge>
  if (p === 'hoje') return <Badge cor="ocre">hoje</Badge>
  return <Badge cor="ardosia">{ddmm(vence)}</Badge>
}

function LinhaTarefa({ t, hoje }: { t: Tarefa; hoje: string }) {
  const concluir = useConcluirTarefa()
  const toast = useToast()
  return (
    <li className="flex items-center justify-between gap-3">
      <Checkbox
        rotulo={t.texto}
        riscar
        checked={t.concluida}
        onChange={(e) =>
          concluir.mutate(
            { id: t.id, concluida: e.target.checked },
            { onError: (err) => toast('erro', `Não salvou: ${err.message}`) },
          )
        }
      />
      {!t.concluida && <PrazoBadge vence={t.vence} hoje={hoje} />}
    </li>
  )
}

const corEvento: Cor[] = ['sakura', 'ardosia', 'musgo-claro', 'ocre']

function Agenda({ eventos, dataExtenso }: { eventos: Evento[]; dataExtenso: string }) {
  return (
    <Card className="h-full" titulo="Agenda de hoje" subtitulo={dataExtenso} icone={<CalendarDays />} cor="ocre">
      {eventos.length === 0 ? (
        <EmptyState icone={<Sun />} cor="ocre" titulo="Dia livre" descricao="Nada na agenda de hoje." className="py-8" />
      ) : (
        <ol className="flex flex-col gap-3">
          {eventos.map((e, i) => (
            <li key={i} className="flex items-center gap-4 rounded-controle p-3 shadow-relevo-sm">
              <span className="w-12 text-sm font-semibold tabular-nums">{e.inicio ?? 'dia'}</span>
              <span aria-hidden className={cn('h-9 w-1 shrink-0 rounded-pilula', solido[corEvento[i % corEvento.length]])} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.titulo}</p>
                <p className="text-xs text-tinta-suave">
                  {e.inicio ? (e.fim ? `até ${e.fim}` : 'horário marcado') : 'dia todo'}
                  {e.local && ` · ${e.local}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function Prioridades({ dados }: { dados: HojeT }) {
  return (
    <Card className="h-full" titulo="3 prioridades" icone={<Sparkles />} cor="musgo">
      {dados.prioridades.length === 0 ? (
        <p className="text-tinta-suave">Nenhuma tarefa aberta. 🌱</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {dados.prioridades.map((t) => (
            <LinhaTarefa key={t.id} t={t} hoje={dados.data} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Contador({ titulo, subtitulo, valor, icone, cor, rodape }: {
  titulo: string
  subtitulo: string
  valor: number
  icone: ReactNode
  cor: Cor
  rodape?: ReactNode
}) {
  return (
    <Card className="h-full justify-between" titulo={titulo} subtitulo={subtitulo} icone={icone} cor={cor}>
      <p className="font-titulo text-5xl font-normal tabular-nums">{valor}</p>
      {rodape}
    </Card>
  )
}

function ListaTarefas({ hoje }: { hoje: string }) {
  const { data: tarefas = [], isPending } = useTarefas()
  const criar = useCriarTarefa()
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const visiveis = tarefas.filter((t) => !t.concluida || t.concluida_em === hoje)

  function adicionar(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    criar.mutate(
      { texto: t },
      {
        onSuccess: () => setTexto(''),
        onError: (err) => toast('erro', `Não salvou: ${err.message}`),
      },
    )
  }

  return (
    <Card className="h-full" titulo="Tarefas" subtitulo="vida/tarefas.md" icone={<ListChecks />} cor="musgo">
      <form onSubmit={adicionar} className={cn(cavado, 'flex items-center gap-2 rounded-pilula py-1 pr-1 pl-4')}>
        <input
          aria-label="Nova tarefa"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nova tarefa…"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-tinta-suave/70 focus-visible:outline-none"
        />
        <Button type="submit" variante="icone" tamanho="sm" aria-label="Adicionar tarefa" disabled={!texto.trim() || criar.isPending}>
          <Plus className="size-4" />
        </Button>
      </form>
      {isPending ? (
        <p className="text-sm text-tinta-suave">carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="text-sm text-tinta-suave">Tudo feito por aqui. 🌱</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto p-1">
          {visiveis.map((t) => (
            <LinhaTarefa key={t.id} t={t} hoje={hoje} />
          ))}
        </ul>
      )}
    </Card>
  )
}

const statusRotina: Record<RotinaDoDia['status'], { cor: Cor; texto: string }> = {
  pendente: { cor: 'ardosia', texto: 'pendente' },
  passou: { cor: 'madeira', texto: 'não rodou' },
  fila: { cor: 'ardosia', texto: 'na fila' },
  rodando: { cor: 'ocre', texto: 'rodando' },
  ok: { cor: 'musgo', texto: 'ok' },
  erro: { cor: 'terracota', texto: 'erro' },
  cancelada: { cor: 'madeira', texto: 'cancelada' },
  tempo_esgotado: { cor: 'terracota', texto: 'tempo esgotado' },
}

function Rotinas({ rotinas }: { rotinas: RotinaDoDia[] }) {
  return (
    <Card className="h-full" titulo="Rotinas de hoje" icone={<Repeat />} cor="madeira">
      {rotinas.length === 0 ? (
        <p className="text-sm text-tinta-suave">Nenhuma rotina ativa roda hoje.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rotinas.map((r) => (
            <li key={`${r.slug}-${r.horario}`} className="flex items-center gap-3 rounded-controle px-3 py-2 shadow-relevo-sm">
              <span className="w-12 text-sm font-semibold tabular-nums">{r.horario}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.nome}</span>
              <Badge cor={statusRotina[r.status].cor}>{statusRotina[r.status].texto}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Captura() {
  const capturar = useCapturar()
  const toast = useToast()
  const [texto, setTexto] = useState('')

  function guardar(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    capturar.mutate(t, {
      onSuccess: (r) => {
        setTexto('')
        toast('sucesso', `Guardado em ${r.arquivo}`)
      },
      onError: (err) => toast('erro', `Não salvou: ${err.message}`),
    })
  }

  return (
    <form
      onSubmit={guardar}
      className={cn(
        cavado,
        'flex h-full items-center gap-3 rounded-card p-3',
        'focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-musgo',
      )}
    >
      <IconChip cor="musgo">
        <Inbox />
      </IconChip>
      <input
        aria-label="Captura rápida para raw/"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Anote qualquer coisa… vai para raw/"
        className="h-11 min-w-0 flex-1 bg-transparent px-2 placeholder:text-tinta-suave/70 focus-visible:outline-none"
      />
      <Button type="submit" tamanho="sm" disabled={!texto.trim() || capturar.isPending}>
        Guardar
      </Button>
    </form>
  )
}

export function Hoje() {
  const { data, error, isPending, refetch } = useHoje()

  if (isPending) return <p className="text-tinta-suave">carregando o dia…</p>
  if (error)
    return (
      <EmptyState
        icone={<CircleAlert />}
        cor="terracota"
        titulo="Não consegui falar com o Bridge"
        descricao={error.message}
        acao={
          <button type="button" onClick={() => refetch()} className={cn('rounded-pilula px-4 py-2 font-semibold shadow-relevo-sm', foco)}>
            Tentar de novo
          </button>
        }
      />
    )

  const t = data.tarefas
  return (
    <div className="flex flex-col gap-8 pb-24">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Hoje</h1>
        <p className="mt-1 text-tinta-suave first-letter:uppercase">{data.data_extenso}</p>
      </header>
      <Resumos />
      <BentoGrid>
        <BentoItem col={2} row={2}>
          <Agenda eventos={data.agenda} dataExtenso={data.data_extenso} />
        </BentoItem>
        <BentoItem col={2}>
          <Prioridades dados={data} />
        </BentoItem>
        <BentoItem>
          <Contador
            titulo="Abertas"
            subtitulo="tarefas"
            valor={t.abertas}
            icone={<ListChecks />}
            cor="musgo"
            rodape={t.concluidas_hoje > 0 ? <Badge cor="musgo">{t.concluidas_hoje} feita(s) hoje</Badge> : undefined}
          />
        </BentoItem>
        <BentoItem>
          <Contador
            titulo="Para hoje"
            subtitulo="vencem hoje"
            valor={t.hoje}
            icone={<Sun />}
            cor="ocre"
            rodape={t.atrasadas > 0 ? <Badge cor="terracota">{t.atrasadas} atrasada(s)</Badge> : undefined}
          />
        </BentoItem>
        <BentoItem col={2} row={2}>
          <ListaTarefas hoje={data.data} />
        </BentoItem>
        <BentoItem col={2}>
          <Lembretes />
        </BentoItem>
        <BentoItem col={2}>
          <Rotinas rotinas={data.rotinas} />
        </BentoItem>
        <BentoItem col={2}>
          <Captura />
        </BentoItem>
      </BentoGrid>
    </div>
  )
}
