import { Power } from 'lucide-react'
import { cn } from '../../lib/cn'
import { foco } from './styles'

type Props = {
  ligado: boolean
  onChange: (ligado: boolean) => void
  rotulo: string
  /** Mostra o rótulo ao lado; sem isso ele vira só aria-label. */
  mostrarRotulo?: boolean
  disabled?: boolean
}

/** Interruptor: trilha cavada e botão em relevo, com "ON/OFF" como na referência. */
export function Toggle({ ligado, onChange, rotulo, mostrarRotulo = false, disabled }: Props) {
  return (
    <label className={cn('inline-flex items-center gap-3', disabled ? 'opacity-45' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={mostrarRotulo ? undefined : rotulo}
        disabled={disabled}
        onClick={() => onChange(!ligado)}
        className={cn(
          'relative h-8 w-16 shrink-0 cursor-pointer rounded-pilula shadow-cavado-sm transition-colors duration-150 disabled:cursor-not-allowed',
          ligado ? 'bg-musgo/20' : 'bg-pergaminho',
          foco,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 text-[0.6rem] font-bold tracking-wide -translate-y-1/2',
            ligado ? 'left-2.5 text-musgo-texto' : 'right-2 text-tinta-suave',
          )}
        >
          {ligado ? 'ON' : 'OFF'}
        </span>
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 grid size-6 place-items-center rounded-pilula bg-pergaminho shadow-relevo-sm transition-transform duration-150',
            ligado ? 'translate-x-8 text-musgo-texto' : 'text-tinta-suave',
          )}
        >
          <Power className="size-3" strokeWidth={3} />
        </span>
      </button>
      {mostrarRotulo && <span className="font-medium">{rotulo}</span>}
    </label>
  )
}
