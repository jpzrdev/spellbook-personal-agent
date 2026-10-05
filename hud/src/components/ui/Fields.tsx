import { ChevronDown } from 'lucide-react'
import { useId, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { focusRing, sunken } from './styles'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: Array<{ value: string; text: string }>
  hint?: string
}

/** Native (accessible) select with the sunken look. */
export function Select({ label, options, hint, id, className, ...props }: SelectProps) {
  const generated = useId()
  const selectId = id ?? generated
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={selectId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-describedby={hint ? `${selectId}-hint` : undefined}
          className={cn(sunken, 'h-11 w-full cursor-pointer appearance-none rounded-control pr-10 pl-4', focusRing)}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted" />
      </div>
      {hint && (
        <p id={`${selectId}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }

export function Textarea({ label, hint, id, className, ...props }: TextareaProps) {
  const generated = useId()
  const areaId = id ?? generated
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={areaId} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={areaId}
        aria-describedby={hint ? `${areaId}-hint` : undefined}
        className={cn(sunken, 'min-h-24 w-full resize-y rounded-control px-4 py-3 placeholder:text-ink-muted/70', focusRing)}
        {...props}
      />
      {hint && (
        <p id={`${areaId}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
