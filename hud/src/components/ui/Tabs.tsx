import { type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { PILL, useIndicator } from './indicator'
import { focusRing, sunken } from './styles'

export type TabItem = { id: string; label: ReactNode }

type Props = {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  label: string
  className?: string
}

/** Segmented control: a sunken track and a raised pill that slides to the active tab. Arrow-key navigable. */
export function Tabs({ items, value, onChange, label, className }: Props) {
  const { container, items: refs, style } = useIndicator<HTMLButtonElement>(items.findIndex((i) => i.id === value))

  function onKeyDown(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + items.length) % items.length
    onChange(items[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div
      ref={container}
      role="tablist"
      aria-label={label}
      className={cn(sunken, 'relative inline-flex flex-wrap gap-1 rounded-pill p-1.5', className)}
    >
      <span aria-hidden className={PILL} style={style} />
      {items.map((item, i) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative cursor-pointer rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors duration-200',
              focusRing,
              active ? 'text-primary-text' : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
