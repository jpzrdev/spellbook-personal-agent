import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconChip } from './IconChip'
import { sunken, type Color } from './styles'

type Props = {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  color?: Color
  className?: string
}

/** A sunken area with a raised icon chip. */
export function EmptyState({ icon, title, description, action, color = 'primary', className }: Props) {
  return (
    <div className={cn(sunken, 'flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center', className)}>
      <IconChip color={color} size="lg">
        {icon}
      </IconChip>
      <h3 className="mt-1 text-xl font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
