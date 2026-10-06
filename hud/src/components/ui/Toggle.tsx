import { Power } from 'lucide-react'
import { cn } from '../../lib/cn'
import { focusRing } from './styles'

type Props = {
  on: boolean
  onChange: (on: boolean) => void
  label: string
  /** Shows the label next to it; otherwise it's only the aria-label. */
  showLabel?: boolean
  disabled?: boolean
}

/** A switch: a sunken track and a raised knob, with "ON/OFF" like in the reference. */
export function Toggle({ on, onChange, label, showLabel = false, disabled }: Props) {
  return (
    <label className={cn('inline-flex items-center gap-3', disabled ? 'opacity-45' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={showLabel ? undefined : label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn(
          'relative h-8 w-16 shrink-0 cursor-pointer rounded-pill shadow-sunken-sm transition-colors duration-150 disabled:cursor-not-allowed',
          on ? 'bg-primary/20' : 'bg-surface',
          focusRing,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 text-[0.6rem] font-bold tracking-wide -translate-y-1/2',
            on ? 'left-2.5 text-primary-text' : 'right-2 text-ink-muted',
          )}
        >
          {on ? 'ON' : 'OFF'}
        </span>
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 grid size-6 place-items-center rounded-pill bg-surface shadow-raised-sm transition-transform duration-150',
            on ? 'translate-x-8 text-primary-text' : 'text-ink-muted',
          )}
        >
          <Power className="size-3" strokeWidth={3} />
        </span>
      </button>
      {showLabel && <span className="font-medium">{label}</span>}
    </label>
  )
}
