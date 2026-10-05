import { CalendarPlus, Check, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { EventoProposto, PropostaResumo, Repetir } from '../lib/api'
import { useConfirmarProposta, useDescartarProposta, useSessoes } from '../lib/queries'
import { dataPorExtenso } from '../lib/datas'
import { STATUS_SESSAO } from '../lib/sessoes'
import { Badge, Button, Input, Select, Toggle, useToast } from './ui'

const REPETIR: Array<{ valor: string; texto: string }> = [
  { valor: '', texto: 'Não repete' },
  { valor: 'anual', texto: 'Todo ano' },
  { valor: 'mensal', texto: 'Todo mês' },
  { valor: 'semanal', texto: 'Toda semana' },
  { valor: 'diaria', texto: 'Todo dia' },
]

const AVISOS_DIA_INTEIRO = [
  { min: 900, texto: 'véspera 9h' },
  { min: 9540, texto: '1 semana antes 9h' },
  { min: 0, texto: 'meia-noite do dia' },
]
const AVISOS_HORARIO = [
  { min: 10, texto: '10 min' },
  { min: 30, texto: '30 min' },
  { min: 60, texto: '1 h' },
  { min: 1440, texto: '1 dia' },
]

type Props = {
  proposta: PropostaResumo
  /** Guarda o novo estado na conversa (para não oferecer "Criar" de novo depois de recarregar). */
  onMudou?: (p: PropostaResumo) => void
}

/** Card "Criar na agenda?": o Gandalf propõe, o usuário confere/edita e só então o evento é criado. */
export function PropostaEvento({ proposta, onMudou }: Props) {
  const [e, setE] = useState<EventoProposto>(proposta.evento)
  const [estado, setEstado] = useState<'pendente' | 'confirmada' | 'descartada'>(proposta.status)
  const [sessaoId, setSessaoId] = useState<string | null>(proposta.sessao_id ?? null)
  const confirmar = useConfirmarProposta()
  const descartar = useDescartarProposta()
  const { data: sessoes } = useSessoes()
  const toast = useToast()
  const sessao = sessaoId ? sessoes?.find((s) => s.id === sessaoId) : undefined
  const mudar = (m: Partial<EventoProposto>) => setE((atual) => ({ ...atual, ...m }))
  const avisos = e.dia_inteiro ? AVISOS_DIA_INTEIRO : AVISOS_HORARIO

  function criar(ev: FormEvent) {
    ev.preventDefault()
    confirmar.mutate(
      { id: proposta.id, evento: e },
      {
        onSuccess: (r) => {
          setEstado('confirmada')
          setSessaoId(r.sessao.id)
          onMudou?.({ ...proposta, evento: e, status: 'confirmada', sessao_id: r.sessao.id })
        },
        onError: (err) => toast('erro', err.message),
      },
    )
  }

  if (estado === 'descartada') return <p className="text-sm text-tinta-suave">Proposta descartada: nada foi criado na agenda.</p>

  if (estado === 'confirmada')
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-controle p-3 shadow-cavado-sm">
        <CalendarPlus className="size-4 text-musgo" aria-hidden />
        <span className="text-sm font-semibold">{e.titulo}</span>
        <span className="text-sm text-tinta-suave">{dataPorExtenso(e.data)}</span>
        {sessao ? (
          <Badge cor={STATUS_SESSAO[sessao.status].cor}>
            {sessao.status === 'ok' ? 'na agenda' : STATUS_SESSAO[sessao.status].texto}
          </Badge>
        ) : (
          <Badge cor="ardosia">{sessaoId ? 'criando…' : 'confirmado'}</Badge>
        )}
        {sessao?.resultado && <p className="w-full text-sm text-tinta-suave">{sessao.resultado}</p>}
        {sessaoId && (
          <Link to={`/terminais?sessao=${sessaoId}`} className="text-xs font-semibold text-musgo-texto">
            ver sessão
          </Link>
        )}
      </div>
    )

  return (
    <form onSubmit={criar} className="flex flex-col gap-3 rounded-controle p-4 shadow-cavado-sm">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus className="size-4 text-musgo" aria-hidden /> Criar no Google Agenda?
      </p>
      <Input rotulo="Título" value={e.titulo} onChange={(ev) => mudar({ titulo: ev.target.value })} maxLength={200} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input rotulo="Data" type="date" value={e.data} onChange={(ev) => mudar({ data: ev.target.value })} required
          dica={dataPorExtenso(e.data)} />
        <Select rotulo="Repetir" value={e.repetir ?? ''} opcoes={REPETIR}
          onChange={(ev) => mudar({ repetir: (ev.target.value || null) as Repetir | null })} />
      </div>
      <Toggle
        ligado={e.dia_inteiro}
        mostrarRotulo
        rotulo="Dia inteiro"
        onChange={(dia) =>
          mudar(dia ? { dia_inteiro: true, hora_inicio: null, hora_fim: null, avisos_min: [900] } : { dia_inteiro: false, hora_inicio: '09:00', hora_fim: '10:00', avisos_min: [30] })
        }
      />
      {!e.dia_inteiro && (
        <div className="grid grid-cols-2 gap-3">
          <Input rotulo="Início" type="time" value={e.hora_inicio ?? ''} onChange={(ev) => mudar({ hora_inicio: ev.target.value })} required />
          <Input rotulo="Fim" type="time" value={e.hora_fim ?? ''} onChange={(ev) => mudar({ hora_fim: ev.target.value })} />
        </div>
      )}
      <Input rotulo="Local (opcional)" value={e.local ?? ''} onChange={(ev) => mudar({ local: ev.target.value || null })} maxLength={200} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Avisos do Google</legend>
        <div className="flex flex-wrap gap-2">
          {avisos.map((a) => {
            const ligado = e.avisos_min.includes(a.min)
            return (
              <button
                key={a.min}
                type="button"
                aria-pressed={ligado}
                onClick={() => mudar({ avisos_min: ligado ? e.avisos_min.filter((m) => m !== a.min) : [...e.avisos_min, a.min] })}
                className={
                  'cursor-pointer rounded-pilula px-3 py-1 text-xs font-semibold ' +
                  (ligado ? 'text-musgo-texto shadow-cavado-sm' : 'text-tinta-suave shadow-relevo-sm')
                }
              >
                {a.texto}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" tamanho="sm" disabled={confirmar.isPending || !e.titulo.trim() || !e.data}>
          <Check className="size-3.5" aria-hidden /> Criar na agenda
        </Button>
        <Button
          variante="fantasma"
          tamanho="sm"
          disabled={descartar.isPending}
          onClick={() => descartar.mutate(proposta.id, { onSettled: () => {
              setEstado('descartada')
              onMudou?.({ ...proposta, status: 'descartada' })
            } })}
        >
          <X className="size-3.5" aria-hidden /> Descartar
        </Button>
      </div>
    </form>
  )
}
