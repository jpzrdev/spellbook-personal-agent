import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  Inbox,
  ListChecks,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Repeat,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  Badge,
  BentoGrid,
  BentoItem,
  Button,
  Card,
  Checkbox,
  Dropdown,
  EmptyState,
  IconChip,
  Input,
  Modal,
  Orb,
  Pill,
  ProgressBar,
  SearchInput,
  Tabs,
  TerminalPane,
  TierBadge,
  Toggle,
  ToastView,
  useToast,
  type ButtonVariante,
  type Cor,
} from '../components/ui'
import { cavado, solido } from '../components/ui/styles'
import { cn } from '../lib/cn'

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-wider text-tinta-suave uppercase">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-5">{children}</div>
    </div>
  )
}

const variantes: ButtonVariante[] = ['primario', 'secundario', 'acento', 'fantasma']
const cores: Array<{ cor: Cor; uso: string }> = [
  { cor: 'musgo', uso: 'ação · sucesso · Gandalf' },
  { cor: 'musgo-claro', uso: 'Tier 1' },
  { cor: 'madeira', uso: 'acento · Tier 3' },
  { cor: 'ocre', uso: 'atenção · hoje · Tier 2' },
  { cor: 'terracota', uso: 'perigo · erro' },
  { cor: 'sakura', uso: 'estudos' },
  { cor: 'ardosia', uso: 'informação' },
]

/** Composição de exemplo em bento grid (esboço da tela Hoje). */
function ExemploBento() {
  const [rotinas, setRotinas] = useState({ manha: true, noite: false })
  const agenda = [
    { hora: '09:00', fim: '10:30', titulo: 'Aula de Cálculo II', local: 'Sala 204', cor: 'sakura' as Cor },
    { hora: '14:00', fim: '', titulo: 'Dentista', local: '', cor: 'ardosia' as Cor },
    { hora: '19:30', fim: '20:30', titulo: 'Revisão: limites', local: '', cor: 'sakura' as Cor },
  ]
  return (
    <BentoGrid>
      <BentoItem col={2} row={2}>
        <Card
          className="h-full"
          titulo="Agenda de hoje"
          subtitulo="sexta, 3 de outubro"
          icone={<CalendarDays />}
          cor="ocre"
          acoes={
            <Button variante="icone" tamanho="sm" aria-label="Abrir agenda">
              <ArrowUpRight className="size-4" />
            </Button>
          }
        >
          <ol className="flex flex-col gap-3">
            {agenda.map((e) => (
              <li key={e.hora} className="flex items-center gap-4 rounded-controle p-3 shadow-relevo-sm">
                <span className="w-12 text-sm font-semibold tabular-nums">{e.hora}</span>
                <span aria-hidden className={cn('h-9 w-1 rounded-pilula', solido[e.cor])} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.titulo}</p>
                  <p className="text-xs text-tinta-suave">
                    {e.fim ? `até ${e.fim}` : 'horário marcado'}
                    {e.local && ` · ${e.local}`}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-4 text-tinta-suave" />
              </li>
            ))}
          </ol>
        </Card>
      </BentoItem>

      <BentoItem>
        <Card className="h-full justify-between" titulo="Tarefas" subtitulo="abertas" icone={<ListChecks />} cor="musgo">
          <p className="font-titulo text-5xl font-normal">7</p>
          <Badge cor="ocre">2 para hoje</Badge>
        </Card>
      </BentoItem>

      <BentoItem>
        <Card className="h-full justify-between" titulo="Revisões" subtitulo="pendentes" icone={<BookOpen />} cor="sakura">
          <p className="font-titulo text-5xl font-normal">12</p>
          <ProgressBar rotulo="Cálculo II" valor={64} cor="sakura" />
        </Card>
      </BentoItem>

      <BentoItem col={2}>
        <Card
          className="h-full"
          titulo="3 prioridades"
          icone={<Sparkles />}
          cor="musgo"
          acoes={
            <Button variante="icone" tamanho="sm" aria-label="Mais opções">
              <MoreVertical className="size-4" />
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Checkbox rotulo="Lista 3 de cálculo" riscar />
            <Checkbox rotulo="Pagar conta de luz" riscar />
            <Checkbox rotulo="Preencher perfil no vault" riscar defaultChecked />
          </div>
        </Card>
      </BentoItem>

      <BentoItem>
        <Card className="h-full" titulo="Manhã" subtitulo="seg–sex às 06:50" icone={<Repeat />} cor="madeira">
          <Toggle ligado={rotinas.manha} onChange={(v) => setRotinas((r) => ({ ...r, manha: v }))} rotulo="Rotina da manhã ativa" />
        </Card>
      </BentoItem>
      <BentoItem>
        <Card className="h-full" titulo="Noite" subtitulo="todo dia às 23:00" icone={<Clock />} cor="madeira">
          <Toggle ligado={rotinas.noite} onChange={(v) => setRotinas((r) => ({ ...r, noite: v }))} rotulo="Rotina da noite ativa" />
        </Card>
      </BentoItem>

      <BentoItem col={2}>
        <div
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
            placeholder="Anote qualquer coisa… vai para raw/"
            className="h-11 min-w-0 flex-1 bg-transparent px-2 placeholder:text-tinta-suave/70 focus-visible:outline-none"
          />
          <Button tamanho="sm">Guardar</Button>
        </div>
      </BentoItem>
    </BentoGrid>
  )
}

/** Catálogo vivo do design system. */
export function UiCatalogo() {
  const toast = useToast()
  const [aba, setAba] = useState('hoje')
  const [ligado, setLigado] = useState(true)
  const [modal, setModal] = useState(false)
  const [progresso, setProgresso] = useState(40)

  return (
    <div className="flex flex-col gap-14">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Design system</h1>
        <p className="mt-2 text-tinta-suave">
          Neumorfismo "Bonsai": pergaminho, musgo e madeira. Passe o mouse, clique e use o Tab.
        </p>
      </header>

      <Secao titulo="Bento grid (exemplo)">
        <ExemploBento />
      </Secao>

      <Secao titulo="Cores">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-7">
          {cores.map(({ cor, uso }) => (
            <div key={cor} className="flex flex-col items-center gap-2 text-center">
              <span className={cn('size-14 rounded-pilula shadow-relevo-sm', solido[cor])} aria-hidden />
              <span className="text-sm font-semibold">{cor}</span>
              <span className="text-xs text-tinta-suave">{uso}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex h-20 items-center justify-center rounded-card text-sm font-semibold shadow-relevo">
            relevo
          </div>
          <div className={cn(cavado, 'flex h-20 items-center justify-center rounded-card text-sm font-semibold')}>
            cavado
          </div>
        </div>
      </Secao>

      <Secao titulo="Button">
        <Linha rotulo="variantes">
          {variantes.map((v) => (
            <Button key={v} variante={v}>
              {v}
            </Button>
          ))}
        </Linha>
        <Linha rotulo="tamanhos">
          <Button tamanho="sm">pequeno</Button>
          <Button tamanho="md">médio</Button>
          <Button tamanho="lg">grande</Button>
        </Linha>
        <Linha rotulo="com ícone · ícone · desabilitado">
          <Button variante="acento">
            <Play className="size-4" aria-hidden /> Executar
          </Button>
          <Button variante="icone" aria-label="Adicionar">
            <Plus className="size-5" />
          </Button>
          <Button variante="icone" tamanho="sm" aria-label="Configurações">
            <Settings className="size-4" />
          </Button>
          <Button disabled>desabilitado</Button>
          <Button variante="secundario" disabled>
            secundário off
          </Button>
        </Linha>
      </Secao>

      <Secao titulo="Badge · Pill · Tier · IconChip">
        <Linha rotulo="badges">
          <Badge cor="ocre">hoje</Badge>
          <Badge cor="terracota">atrasada</Badge>
          <Badge cor="musgo">ok</Badge>
          <Badge cor="ardosia">info</Badge>
          <Badge cor="sakura">estudos</Badge>
        </Linha>
        <Linha rotulo="pills">
          <Pill>#pessoal</Pill>
          <Pill>#estudos/calculo</Pill>
          <Pill>⏫ alta</Pill>
        </Linha>
        <Linha rotulo="tiers do Gandalf">
          <TierBadge tier={1} />
          <TierBadge tier={2} />
          <TierBadge tier={3} />
        </Linha>
        <Linha rotulo="icon chips">
          <IconChip tamanho="sm" cor="musgo">
            <Sparkles />
          </IconChip>
          <IconChip cor="ocre">
            <CalendarDays />
          </IconChip>
          <IconChip tamanho="lg" cor="sakura">
            <BookOpen />
          </IconChip>
          <IconChip cavado cor="madeira">
            <Repeat />
          </IconChip>
        </Linha>
      </Secao>

      <Secao titulo="Card">
        <div className="grid gap-6 md:grid-cols-3">
          <Card titulo="Só título">Card simples, em relevo.</Card>
          <Card
            titulo="AI Analytics"
            subtitulo="uso de hoje"
            icone={<Sparkles />}
            cor="musgo"
            acoes={
              <Button variante="icone" tamanho="sm" aria-label="Abrir">
                <ArrowUpRight className="size-4" />
              </Button>
            }
          >
            Com chip de ícone, subtítulo e ação no canto.
          </Card>
          <Card>Card sem cabeçalho.</Card>
        </div>
      </Secao>

      <Secao titulo="Tabs">
        <div>
          <Tabs
            rotulo="Exemplo de abas"
            valor={aba}
            onChange={setAba}
            itens={[
              { id: 'hoje', label: 'Hoje' },
              { id: 'semana', label: 'Semana' },
              { id: 'mes', label: 'Mês' },
            ]}
          />
        </div>
        <p className="text-sm text-tinta-suave">
          Aba ativa: <strong className="text-tinta">{aba}</strong> (use ← → com o foco nas abas)
        </p>
      </Secao>

      <Secao titulo="Toggle · Checkbox">
        <Linha rotulo="toggle">
          <Toggle ligado={ligado} onChange={setLigado} rotulo="Rotina ativa" mostrarRotulo />
          <Toggle ligado={false} onChange={() => {}} rotulo="Desligado" mostrarRotulo />
          <Toggle ligado onChange={() => {}} rotulo="Desabilitado" mostrarRotulo disabled />
        </Linha>
        <Linha rotulo="checkbox">
          <Checkbox rotulo="Lista 3 de cálculo" riscar />
          <Checkbox rotulo="Já concluída" riscar defaultChecked />
          <Checkbox rotulo="Desabilitada" disabled />
        </Linha>
      </Secao>

      <Secao titulo="Input · SearchInput">
        <div className="grid gap-6 md:grid-cols-3">
          <Input rotulo="Nova tarefa" placeholder="Ex.: pagar conta de luz" dica="Enter para adicionar" />
          <Input rotulo="Com erro" defaultValue="31/02" erro="Data inválida" />
          <Input rotulo="Desabilitado" placeholder="…" disabled />
        </div>
        <SearchInput rotulo="Buscar no vault" placeholder="Buscar no vault…" className="max-w-md" />
      </Secao>

      <Secao titulo="Dropdown / Menu">
        <Linha rotulo="menu">
          <Dropdown
            rotulo="Ações"
            itens={[
              { id: 'editar', label: 'Editar', icone: <Pencil className="size-4" />, onSelect: () => toast('info', 'Editar') },
              { id: 'rodar', label: 'Rodar agora', icone: <Play className="size-4" />, onSelect: () => toast('sucesso', 'Rodando') },
              { id: 'apagar', label: 'Apagar', icone: <Trash2 className="size-4" />, perigo: true, onSelect: () => toast('erro', 'Apagado (de mentira)') },
            ]}
          />
          <Dropdown
            variante="primario"
            rotulo="Modelo"
            itens={[
              { id: 'haiku', label: 'Haiku', onSelect: () => {} },
              { id: 'sonnet', label: 'Sonnet', onSelect: () => {} },
            ]}
          />
        </Linha>
      </Secao>

      <Secao titulo="ProgressBar">
        <div className="grid max-w-xl gap-5">
          <ProgressBar rotulo="Vazia" valor={0} />
          <ProgressBar rotulo="Revisões de cálculo" valor={progresso} cor="sakura" />
          <ProgressBar rotulo="Completa" valor={100} />
          <div className="flex gap-3">
            <Button tamanho="sm" variante="secundario" onClick={() => setProgresso((p) => Math.max(0, p - 10))}>
              −10
            </Button>
            <Button tamanho="sm" variante="secundario" onClick={() => setProgresso((p) => Math.min(100, p + 10))}>
              +10
            </Button>
          </div>
        </div>
      </Secao>

      <Secao titulo="Toast">
        <Linha rotulo="estático">
          <ToastView tipo="sucesso">Tarefa concluída</ToastView>
          <ToastView tipo="erro">Falha ao rodar a rotina</ToastView>
          <ToastView tipo="info">Nova nota em wiki/</ToastView>
        </Linha>
        <Linha rotulo="disparar">
          <Button onClick={() => toast('sucesso', 'Salvo no vault!')}>Sucesso</Button>
          <Button variante="secundario" onClick={() => toast('erro', 'Bridge fora do ar')}>
            Erro
          </Button>
          <Button variante="secundario" onClick={() => toast('info', 'Rotina iniciada')}>
            Info
          </Button>
        </Linha>
      </Secao>

      <Secao titulo="Modal">
        <Linha rotulo="abrir">
          <Button variante="secundario" onClick={() => setModal(true)}>
            Abrir modal
          </Button>
        </Linha>
        <Modal
          aberto={modal}
          onClose={() => setModal(false)}
          titulo="Nova rotina"
          icone={<Repeat />}
          rodape={
            <>
              <Button variante="fantasma" onClick={() => setModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setModal(false)
                  toast('sucesso', 'Rotina criada')
                }}
              >
                Criar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input rotulo="Nome" placeholder="Resumo da manhã" />
            <Input rotulo="Horário" placeholder="seg–sex às 06:50" />
          </div>
        </Modal>
      </Secao>

      <Secao titulo="TerminalPane">
        <TerminalPane
          titulo="claude · organizar raw/"
          acoes={
            <Button tamanho="sm" variante="secundario">
              Cancelar
            </Button>
          }
          linhas={[
            '$ claude -p "organize o raw/"',
            '● Lendo wiki/_master-index.md',
            '● 3 arquivos novos em raw/',
            '✎ wiki/estudos/calculo/limites.md',
            '✎ wiki/estudos/calculo/_index.md',
            '',
            '✓ concluído em 42s',
          ]}
        />
      </Secao>

      <Secao titulo="Orb">
        <Linha rotulo="parado · ouvindo · pensando · chat">
          <Orb />
          <Orb estado="ouvindo" />
          <Orb estado="pensando" />
          <Orb modo="chat" />
        </Linha>
      </Secao>

      <Secao titulo="EmptyState">
        <div className="grid gap-6 md:grid-cols-2">
          <EmptyState
            icone={<Inbox />}
            titulo="Nada em raw/"
            descricao="Jogue qualquer coisa na captura rápida e o Gandalf organiza depois."
            acao={<Button>Capturar</Button>}
          />
          <EmptyState icone={<Play />} cor="madeira" titulo="Nenhuma sessão ativa" />
        </div>
      </Secao>
    </div>
  )
}
