import { Pause, Play, RotateCcw, SkipForward, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { mmss, NOME_FASE, pomodoro, PRESETS, restante, total, usePomodoro } from '../lib/pomodoro'
import { Button, Tabs } from './ui'
import { foco, relevo } from './ui/styles'

const COR_FASE = { foco: 'stroke-terracota', pausa: 'stroke-musgo', longa: 'stroke-musgo' } as const
const TEXTO_FASE = { foco: 'text-terracota', pausa: 'text-musgo-texto', longa: 'text-musgo-texto' } as const

/** Anel de progresso da fase (cheio no começo, esvazia até o fim). */
function Anel({ fracao, fase, tamanho, espessura }: { fracao: number; fase: keyof typeof COR_FASE; tamanho: number; espessura: number }) {
  const r = (tamanho - espessura) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={espessura} className="stroke-sombra/40" />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={r}
        fill="none"
        strokeWidth={espessura}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fracao)}
        className={cn(COR_FASE[fase], 'transition-[stroke-dashoffset] duration-1000 ease-linear')}
      />
    </svg>
  )
}

/** Widget do pomodoro: botão redondo na pilha lateral (com o anel do tempo) + painel com os controles. */
export function Pomodoro() {
  const { estado: e, agora } = usePomodoro()
  const [aberto, setAberto] = useState(false)
  const painel = useRef<HTMLDivElement>(null)
  const falta = restante(e, agora)
  const fracao = Math.max(0, Math.min(1, falta / total(e)))
  const ativo = e.rodando || falta < total(e)
  // Fase acabou: o painel abre sozinho para o próximo passo (fechar também dispensa o aviso).
  const mostrar = aberto || e.acabou !== null
  const fechar = () => {
    setAberto(false)
    pomodoro.fecharAviso()
  }

  useEffect(() => {
    if (!mostrar) return
    const fora = (ev: MouseEvent) => {
      if (!painel.current?.parentElement?.contains(ev.target as Node)) fechar()
    }
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && fechar()
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [mostrar]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      {mostrar && (
        <div
          ref={painel}
          role="dialog"
          aria-label="Pomodoro"
          className={cn(relevo, 'animar-surgir absolute right-full bottom-0 mr-3 flex w-72 origin-bottom-right flex-col items-center gap-4 rounded-card p-5 shadow-relevo-lg')}
        >
          <header className="flex w-full items-center justify-between">
            <span className={cn('text-sm font-bold', TEXTO_FASE[e.fase])}>{NOME_FASE[e.fase]}</span>
            <span className="text-xs text-tinta-suave" title="Focos concluídos hoje">
              🍅 × {e.focosHoje} hoje
            </span>
            <button type="button" aria-label="Fechar" onClick={fechar} className={cn('rounded-pilula p-1 text-tinta-suave hover:text-tinta', foco)}>
              <X className="size-4" />
            </button>
          </header>

          {e.acabou && (
            <p role="status" className="w-full rounded-controle px-3 py-2 text-center text-sm font-semibold shadow-cavado-sm">
              {e.acabou === 'foco' ? 'Foco concluído! Respire, alongue, beba água.' : 'Pausa encerrada. Pronto para mais um foco?'}
            </p>
          )}

          <div className="relative grid place-items-center">
            <Anel fracao={fracao} fase={e.fase} tamanho={168} espessura={10} />
            <span className="absolute font-titulo text-4xl tabular-nums" aria-live="off">
              {mmss(falta)}
            </span>
          </div>

          <input
            aria-label="No que você vai focar"
            placeholder="No que você vai focar?"
            value={e.rotulo}
            onChange={(ev) => pomodoro.rotular(ev.target.value)}
            className="h-9 w-full rounded-pilula bg-pergaminho px-4 text-center text-sm shadow-cavado-sm placeholder:text-tinta-suave/70 focus-visible:outline-2 focus-visible:outline-musgo"
          />

          <div className="flex items-center gap-2">
            <Button variante="icone" tamanho="sm" aria-label="Reiniciar fase" title="Reiniciar fase" onClick={pomodoro.reiniciar}>
              <RotateCcw className="size-4" />
            </Button>
            {e.rodando ? (
              <Button onClick={pomodoro.pausar}>
                <Pause className="size-4" aria-hidden /> Pausar
              </Button>
            ) : (
              <Button onClick={() => pomodoro.iniciar()}>
                <Play className="size-4" aria-hidden /> {falta < total(e) ? 'Continuar' : e.fase === 'foco' ? 'Começar foco' : 'Começar pausa'}
              </Button>
            )}
            <Button variante="icone" tamanho="sm" aria-label="Pular para a próxima fase" title="Pular fase" onClick={pomodoro.pular}>
              <SkipForward className="size-4" />
            </Button>
          </div>

          <Tabs
            rotulo="Duração"
            valor={e.preset}
            onChange={(p) => pomodoro.escolherPreset(p)}
            itens={Object.keys(PRESETS).map((p) => ({ id: p, label: p }))}
          />
          <p className="text-center text-[0.7rem] text-tinta-suave">A cada 4 focos, uma pausa longa. O aviso chega no celular mesmo com o app fechado.</p>
        </div>
      )}

      <button
        type="button"
        aria-label={ativo ? `Pomodoro: ${NOME_FASE[e.fase]}, faltam ${mmss(falta)}` : 'Abrir pomodoro'}
        aria-expanded={mostrar}
        onClick={() => (mostrar ? fechar() : setAberto(true))}
        className={cn(
          'relative grid size-11 cursor-pointer place-items-center rounded-pilula bg-pergaminho text-tinta-suave shadow-relevo-sm hover:text-tinta active:shadow-cavado-sm',
          e.acabou && 'animate-bounce',
          foco,
        )}
      >
        {ativo ? (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <Anel fracao={fracao} fase={e.fase} tamanho={44} espessura={3} />
            </span>
            <span className={cn('relative text-[0.62rem] font-bold tabular-nums', TEXTO_FASE[e.fase])}>{mmss(falta)}</span>
          </>
        ) : (
          <Timer className="size-5" aria-hidden />
        )}
      </button>
    </div>
  )
}
