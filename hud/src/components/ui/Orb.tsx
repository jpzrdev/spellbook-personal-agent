import { Loader, MessageCircle, Mic, Volume2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { foco } from './styles'

export type OrbEstado = 'parado' | 'ouvindo' | 'pensando' | 'falando'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  estado?: OrbEstado
  modo?: 'voz' | 'chat'
}

const rotulos: Record<OrbEstado, string> = {
  parado: 'Falar com o Gandalf',
  ouvindo: 'Ouvindo… solte para enviar',
  pensando: 'Gandalf está pensando',
  falando: 'Gandalf falando: clique para parar',
}

/** Botão redondo grande em relevo. Ouvindo: afunda e pulsa em musgo. */
export function Orb({ estado = 'parado', modo = 'voz', className, ...props }: Props) {
  const Icone = estado === 'pensando' ? Loader : estado === 'falando' ? Volume2 : modo === 'voz' ? Mic : MessageCircle
  const ouvindo = estado === 'ouvindo'
  return (
    <button
      type="button"
      aria-label={rotulos[estado]}
      aria-pressed={ouvindo}
      className={cn(
        'relative grid size-16 cursor-pointer place-items-center rounded-pilula bg-pergaminho text-musgo-texto',
        'transition-[box-shadow] duration-150',
        ouvindo ? 'shadow-cavado' : 'shadow-relevo hover:shadow-relevo-lg active:shadow-cavado',
        foco,
        className,
      )}
      {...props}
    >
      {ouvindo && (
        <span
          aria-hidden
          className="absolute -inset-1 rounded-pilula border-2 border-musgo motion-safe:animate-orb-pulso"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'grid size-10 place-items-center rounded-pilula',
          ouvindo ? 'bg-musgo text-sobre-musgo' : 'shadow-cavado-sm',
        )}
      >
        <Icone className={cn('size-5', estado === 'pensando' && 'motion-safe:animate-spin')} strokeWidth={2.25} />
      </span>
    </button>
  )
}
