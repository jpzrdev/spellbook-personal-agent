import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { textColor, type Color } from './styles'

type Props = {
  children: ReactNode
  color?: Color
  size?: 'sm' | 'md' | 'lg'
  /** Sunken instead of raised (e.g. a selected item). */
  sunken?: boolean
  className?: string
}

const sizes = { sm: 'size-8 [&>svg]:size-4', md: 'size-11 [&>svg]:size-5', lg: 'size-14 [&>svg]:size-6' }

/** An icon inside a raised circle, like on the reference cards. Decorative. */
export function IconChip({ children, color, size = 'md', sunken, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-pill bg-surface',
        sunken ? 'shadow-sunken-sm' : 'shadow-raised-sm',
        color ? textColor[color] : 'text-ink-muted',
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  )
}
