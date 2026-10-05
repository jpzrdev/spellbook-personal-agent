import { AlarmClock, BellOff, BellRing, Check, Repeat, Send, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { post, type Lembrete } from '../lib/api'
import { usePush } from '../lib/push'
import { useEditarLembrete, useLembretes, useRemoverLembrete } from '../lib/queries'
import { quandoRelativo } from '../lib/tempo'
import { Badge, Button, Card, useToast } from './ui'

/** Botão de ativar notificações neste aparelho (com o motivo quando não dá). */
export function Notificacoes() {
  const { estado, erro, ativar, desativar } = usePush()
  const toast = useToast()

  async function testar() {
    try {
      await post('/push/teste', {})
      toast('sucesso', 'Notificação de teste enviada')
    } catch (e) {
      toast('erro', e instanceof Error ? e.message : String(e))
    }
  }

  const aviso: Partial<Record<typeof estado, string>> = {
    dev: 'Notificações só no modo de uso (scripts/servir.ps1).',
    'sem-suporte': 'Este navegador não recebe notificações.',
    instalar: 'No iPhone: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone para ativar.',
    bloqueado: 'Notificações bloqueadas: libere nas configurações do navegador/aparelho.',
  }
  if (estado === 'carregando') return null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {estado === 'ligado' ? (
          <>
            <Badge cor="musgo">
              <BellRing className="size-3" aria-hidden /> notificações ligadas
            </Badge>
            <Button variante="fantasma" tamanho="sm" onClick={testar}>
              <Send className="size-3.5" aria-hidden /> Testar
            </Button>
            <Button variante="fantasma" tamanho="sm" onClick={desativar}>
              <BellOff className="size-3.5" aria-hidden /> Desligar
            </Button>
          </>
        ) : estado === 'desligado' ? (
          <Button tamanho="sm" onClick={ativar}>
            <BellRing className="size-3.5" aria-hidden /> Ativar notificações neste aparelho
          </Button>
        ) : (
          <p className="text-xs text-tinta-suave">{aviso[estado]}</p>
        )}
      </div>
      {erro && <p className="text-xs font-semibold text-erro">{erro}</p>}
    </div>
  )
}

function LinhaAvisado({ x }: { x: Lembrete }) {
  const editar = useEditarLembrete()
  const toast = useToast()
  const adiar = (min: number) => editar.mutate({ id: x.id, adiar_min: min }, { onError: (e) => toast('erro', e.message) })
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-controle px-3 py-2 shadow-cavado-sm">
      <span className="w-28 shrink-0 text-xs font-semibold text-tinta-suave">avisado {x.concluido_em ? quandoRelativo(x.concluido_em) : ''}</span>
      <span className="min-w-0 flex-1 text-sm text-tinta-suave line-through">{x.texto}</span>
      <span className="flex items-center gap-1">
        <Button variante="fantasma" tamanho="sm" className="h-8 px-2" disabled={editar.isPending} onClick={() => adiar(10)}>
          +10 min
        </Button>
        <Button variante="fantasma" tamanho="sm" className="h-8 px-2" disabled={editar.isPending} onClick={() => adiar(60)}>
          +1 h
        </Button>
      </span>
    </li>
  )
}

function LinhaLembrete({ x }: { x: Lembrete }) {
  const editar = useEditarLembrete()
  const remover = useRemoverLembrete()
  const toast = useToast()
  const falhou = (e: Error) => toast('erro', e.message)
  const quando = x.recorrencia ? x.recorrencia_texto : x.proximo ? quandoRelativo(x.proximo) : ''

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-controle px-3 py-2 shadow-relevo-sm">
      <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-semibold text-tinta-suave tabular-nums">
        {x.recorrencia && <Repeat className="size-3.5" aria-label="repete" />}
        {quando}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{x.texto}</span>
      <span className="flex items-center gap-1">
        {!x.recorrencia && (
          <Button variante="fantasma" tamanho="sm" className="h-8 px-2" disabled={editar.isPending}
            onClick={() => editar.mutate({ id: x.id, adiar_min: 60 }, { onError: falhou })}>
            +1 h
          </Button>
        )}
        <Button variante="fantasma" tamanho="sm" className="h-8 px-2" aria-label={x.recorrencia ? 'Pausar' : 'Concluir'}
          title={x.recorrencia ? 'Pausar' : 'Concluir'} disabled={editar.isPending}
          onClick={() => editar.mutate({ id: x.id, concluido: true }, { onError: falhou })}>
          <Check className="size-4" />
        </Button>
        <Button variante="fantasma" tamanho="sm" className="h-8 px-2" aria-label="Excluir" title="Excluir" disabled={remover.isPending}
          onClick={() => remover.mutate(x.id, { onError: falhou })}>
          <Trash2 className="size-4" />
        </Button>
      </span>
    </li>
  )
}

/** Ações vindas de uma notificação (`/?lembrete=<id>&acao=adiar10|adiar60|feito`). */
function useAcaoDaNotificacao() {
  const [params, setParams] = useSearchParams()
  const editar = useEditarLembrete()
  const toast = useToast()
  const id = params.get('lembrete')
  const acao = params.get('acao')

  useEffect(() => {
    if (!id || !acao) return
    const mudanca = acao === 'adiar10' ? { adiar_min: 10 } : acao === 'adiar60' ? { adiar_min: 60 } : null
    setParams({}, { replace: true })
    if (!mudanca) return
    editar.mutate(
      { id, ...mudanca },
      { onSuccess: (x) => toast('sucesso', `Adiado: ${x.texto}`), onError: (e) => toast('erro', e.message) },
    )
  }, [id, acao]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Card de lembretes da tela Hoje: próximos avisos, adiar/concluir e o botão de notificações. */
export function Lembretes() {
  const { data: itens = [] } = useLembretes()
  useAcaoDaNotificacao()
  const pendentes = itens.filter((x) => !x.concluido)
  const avisados = itens.filter((x) => x.avisado_recente)
  return (
    <Card
      className="h-full"
      titulo="Lembretes"
      subtitulo="peça ao Gandalf: “me lembra de … em 30 min”"
      icone={<AlarmClock />}
      cor="sakura"
      acoes={pendentes.length > 0 ? <Badge cor="sakura">{pendentes.length}</Badge> : undefined}
    >
      <Notificacoes />
      {pendentes.length === 0 && avisados.length === 0 ? (
        <p className="text-sm text-tinta-suave">Nenhum lembrete pendente.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto p-1">
          {avisados.map((x) => (
            <LinhaAvisado key={x.id} x={x} />
          ))}
          {pendentes.map((x) => (
            <LinhaLembrete key={x.id} x={x} />
          ))}
        </ul>
      )}
    </Card>
  )
}
