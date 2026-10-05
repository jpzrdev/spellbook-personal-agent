import { Check } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  /** Strikes the label through when checked (useful for tasks). */
  strikethrough?: boolean
}

/** A sunken box; when checked, it fills with primary. */
export function Checkbox({ label, strikethrough, className, disabled, ...props }: Props) {
  return (
    <label className={cn('inline-flex items-center gap-3', disabled ? 'opacity-45' : 'cursor-pointer', className)}>
      <input type="checkbox" className="peer sr-only" disabled={disabled} {...props} />
      <span
        aria-hidden
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-lg bg-surface shadow-sunken-sm transition-[background-color,box-shadow] duration-150',
          'peer-checked:bg-primary peer-checked:text-on-primary peer-checked:shadow-raised-sm peer-checked:animate-[check-pop_350ms_ease-out]',
          // golden spark when checking (the ::after restarts the animation every time the selector starts to match)
          'relative after:pointer-events-none after:absolute after:inset-[-6px] after:rounded-full after:opacity-0 peer-checked:after:animate-[spark_600ms_ease-out]',
          '[&>svg]:invisible peer-checked:[&>svg]:visible',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-primary',
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
      <span className={cn('font-medium', strikethrough && 'peer-checked:text-ink-muted peer-checked:line-through')}>
        {label}
      </span>
    </label>
  )
}
