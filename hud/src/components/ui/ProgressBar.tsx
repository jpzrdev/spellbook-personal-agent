import { cn } from '../../lib/cn'
import { solid, type Color } from './styles'

type Props = {
  value: number
  max?: number
  label: string
  color?: Color
  showValue?: boolean
  className?: string
}

/** A sunken track with a rounded fill. */
export function ProgressBar({ value, max = 100, label, color = 'primary', showValue = true, className }: Props) {
  const pct = Math.round((Math.min(Math.max(value, 0), max) / max) * 100)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex justify-between text-sm font-semibold">
        <span>{label}</span>
        {showValue && <span className="text-ink-muted tabular-nums">{pct}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-3.5 overflow-hidden rounded-pill bg-surface p-0.5 shadow-sunken-sm"
      >
        <div
          className={cn('h-full rounded-pill transition-[width] duration-300', solid[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
