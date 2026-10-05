import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { COR_TIER, solido, tingido, type Cor } from './styles'

type Props = HTMLAttributes<HTMLSpanElement> & { cor?: Cor }

/** Etiqueta com fundo tingido e ponto de cor; o texto fica em `tinta` (contraste AA). */
export function Badge({ cor = 'musgo', className, children, ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pilula px-2.5 py-0.5 text-xs font-semibold text-tinta',
        tingido[cor],
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn('size-1.5 rounded-pilula', solido[cor])} />
      {children}
    </span>
  )
}

/** Pílula em relevo suave, para tags e filtros. */
export function Pill({ className, ...props }: Omit<Props, 'cor'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pilula bg-pergaminho px-3 py-1 text-sm font-medium text-tinta-suave shadow-relevo-sm',
        className,
      )}
      {...props}
    />
  )
}

export type Tier = 1 | 2 | 3

const nomesTier: Record<Tier, string> = { 1: 'regras', 2: 'rápido', 3: 'Claude Code' }

/** Badge do tier do Gandalf, com a cor de série do tier. */
export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      title={`Tier ${tier}: ${nomesTier[tier]}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pilula px-2.5 py-0.5 text-xs font-semibold text-tinta',
        COR_TIER[tier].fundo,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-pilula', COR_TIER[tier].ponto)} />
      T{tier} · {nomesTier[tier]}
    </span>
  )
}
