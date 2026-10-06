import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { TIER_COLOR, solid, tinted, type Color } from './styles'

type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & { color?: Color }

/** A label with a tinted background and a color dot; the text stays `ink` (AA contrast). */
export function Badge({ color = 'primary', className, children, ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-semibold text-ink',
        tinted[color],
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn('size-1.5 rounded-pill', solid[color])} />
      {children}
    </span>
  )
}

/** A softly raised pill, for tags and filters. */
export function Pill({ className, ...props }: Omit<Props, 'color'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-surface px-3 py-1 text-sm font-medium text-ink-muted shadow-raised-sm',
        className,
      )}
      {...props}
    />
  )
}

export type Tier = 1 | 2 | 3

const tierNames: Record<Tier, string> = { 1: 'rules', 2: 'fast', 3: 'Claude Code' }

/** Badge of Gandalf's tier, with the tier's series color. */
export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      title={`Tier ${tier}: ${tierNames[tier]}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs font-semibold text-ink',
        TIER_COLOR[tier].bg,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-pill', TIER_COLOR[tier].dot)} />
      T{tier} · {tierNames[tier]}
    </span>
  )
}
