import { Search } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { focusRing, sunken } from './styles'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
}

const field = cn(
  sunken,
  'h-11 w-full rounded-control px-4 font-body placeholder:text-ink-muted/70',
  'disabled:cursor-not-allowed disabled:opacity-45',
  focusRing,
)

/** A sunken text field. */
export function Input({ label, hint, error, id, className, ...props }: Props) {
  const generated = useId()
  const inputId = id ?? generated
  const descriptionId = `${inputId}-desc`
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descriptionId : undefined}
        className={cn(field, error && 'outline-2 outline-ember/70')}
        {...props}
      />
      {(error || hint) && (
        <p id={descriptionId} className={cn('text-sm', error ? 'font-semibold text-danger' : 'text-ink-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

type SearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }

/** A search field with an icon. The label becomes the aria-label. */
export function SearchInput({ label, className, ...props }: SearchProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-muted"
      />
      <input type="search" aria-label={label} className={cn(field, 'rounded-pill pl-11')} {...props} />
    </div>
  )
}
