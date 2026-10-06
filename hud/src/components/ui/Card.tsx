import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { raised, type Color } from './styles'

type Props = Omit<HTMLAttributes<HTMLElement>, 'title' | 'color'> & {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  /** Color of the icon chip. */
  color?: Color
  actions?: ReactNode
}

/** A raised card: icon chip, title, subtitle and actions in the corner. */
export function Card({ title, subtitle, icon, color, actions, className, children, ...props }: Props) {
  return (
    <section className={cn(raised, 'flex flex-col gap-4 rounded-card p-5', className)} {...props}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start gap-3">
          {icon && (
            <IconChip color={color} size="sm">
              {icon}
            </IconChip>
          )}
          <div className="min-w-[8rem] flex-1">
            <h3 className="text-lg leading-tight font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
